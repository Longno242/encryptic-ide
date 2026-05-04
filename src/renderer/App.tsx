import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTree } from "./FileTree";
import { GitStrip } from "./GitStrip";
import { CommandPaletteModal, type PaletteCommand } from "./CommandPaletteModal";
import { QuickOpenModal } from "./QuickOpenModal";
import { SettingsModal } from "./SettingsModal";
import { WelcomeHub } from "./WelcomeHub";
import { WorkspaceDock } from "./WorkspaceDock";
import type { OpenTab, ProjectAnalyzeResult, TreeNode } from "./types";

const MAX_RECENT_FILES = 32;
const MAX_CLOSED_STACK = 16;

const api = typeof window !== "undefined" ? window.encryptic : undefined;

type UiMode = "hub" | "workspace";

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

function normalizeWinCase(p: string): string {
  return normalizeSlashes(p).toLowerCase();
}

function parseCompilerDiagnosticLine(line: string): {
  relPath: string;
  marker: editor.IMarkerData;
} | null {
  // Example:
  // C:\proj\Foo.cs(12,9): error CS1002: ; expected
  const m =
    line.match(
      /^(.*)\((\d+),(\d+)(?:,(\d+),(\d+))?\):\s(error|warning)\s([A-Z]{1,4}\d+):\s(.+)$/
    ) ?? null;
  if (!m) return null;
  const file = normalizeSlashes(m[1].trim());
  const sl = Number(m[2]) || 1;
  const sc = Number(m[3]) || 1;
  const el = Number(m[4]) || sl;
  const ec = Number(m[5]) || sc + 1;
  const sev = m[6] === "error" ? 8 : 4; // monaco MarkerSeverity values
  const code = m[7];
  const msg = m[8];
  return {
    relPath: file,
    marker: {
      severity: sev,
      message: `${code}: ${msg}`,
      startLineNumber: sl,
      startColumn: sc,
      endLineNumber: Math.max(sl, el),
      endColumn: Math.max(sc + 1, ec),
      code,
    },
  };
}

export function App() {
  const [uiMode, setUiMode] = useState<UiMode>("hub");
  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const tabsRef = useRef(tabs);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("composer-2");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOut, setAiOut] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [projectAnalyze, setProjectAnalyze] =
    useState<ProjectAnalyzeResult | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusFindTick, setFocusFindTick] = useState(0);
  const [editorNavTick, setEditorNavTick] = useState(0);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<(typeof import("monaco-editor")) | null>(null);
  const activePathRef = useRef<string | null>(null);
  const pendingNavRef = useRef<{ path: string; line: number } | null>(null);
  const closedTabsRef = useRef<OpenTab[]>([]);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [editorTabSize, setEditorTabSize] = useState(2);
  const [editorWordWrap, setEditorWordWrap] = useState(true);
  const [monacoTheme, setMonacoTheme] = useState<"vs-dark" | "hc-black">("vs-dark");
  const buildDiagByFileRef = useRef<Map<string, editor.IMarkerData[]>>(new Map());
  const buildChunkRemainderRef = useRef("");

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath]
  );

  const refreshTree = useCallback(async () => {
    if (!api) return;
    const r = await api.getRoot();
    setRoot(r);
    if (r) {
      const t = await api.listTree();
      setTree(t);
    } else {
      setTree([]);
    }
  }, []);

  const loadRecentFromDisk = useCallback(async () => {
    if (!api) return;
    const s = await api.loadSettings();
    setRecent(Array.isArray(s.recentProjects) ? s.recentProjects : []);
  }, []);

  const enterWorkspace = useCallback(async () => {
    await refreshTree();
    setUiMode("workspace");
  }, [refreshTree]);

  const goHub = useCallback(async () => {
    if (!api) return;
    await api.closeProject();
    setTabs([]);
    setActivePath(null);
    closedTabsRef.current = [];
    setRoot(null);
    setTree([]);
    setProjectAnalyze(null);
    setAiError(null);
    await loadRecentFromDisk();
    setUiMode("hub");
  }, [loadRecentFromDisk]);

  const refreshProjectAnalyze = useCallback(async () => {
    if (!api) return;
    try {
      const r = await api.analyzeProject();
      setProjectAnalyze(r as ProjectAnalyzeResult);
    } catch {
      setProjectAnalyze({
        stacks: [],
        summary: "Could not analyze project",
        presets: [],
      });
    }
  }, []);

  useEffect(() => {
    if (uiMode === "workspace" && root) void refreshProjectAnalyze();
    else setProjectAnalyze(null);
  }, [uiMode, root, refreshProjectAnalyze]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!activeTab) {
      editorRef.current = null;
      return;
    }
    const p = pendingNavRef.current;
    if (!p || p.path !== activePath) return;
    const targetPath = p.path;
    const line = p.line;
    const attempt = () => {
      const ed = editorRef.current;
      if (!ed || activePathRef.current !== targetPath) return;
      const model = ed.getModel();
      if (!model || model.isDisposed()) return;
      const max = model.getLineCount();
      if (max < 1) return;
      const ln = Math.min(Math.max(1, line), max);
      ed.revealLineInCenter(ln);
      ed.setPosition({ lineNumber: ln, column: 1 });
      ed.focus();
      if (pendingNavRef.current?.path === targetPath) {
        pendingNavRef.current = null;
      }
    };
    const t0 = window.setTimeout(attempt, 0);
    const t1 = window.setTimeout(attempt, 60);
    const t2 = window.setTimeout(attempt, 180);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activePath, activeTab?.content, activeTab, editorNavTick]);

  useEffect(() => {
    void loadRecentFromDisk();
  }, [loadRecentFromDisk]);

  const loadRecentFiles = useCallback(async () => {
    if (!api) return;
    const s = await api.loadSettings();
    const rf = Array.isArray(s.recentEditorFiles)
      ? (s.recentEditorFiles as string[]).filter((x) => typeof x === "string")
      : [];
    setRecentFiles(rf);
  }, []);

  useEffect(() => {
    if (uiMode === "workspace" && root) void loadRecentFiles();
  }, [uiMode, root, loadRecentFiles]);

  const recordRecentFile = useCallback(async (relPath: string) => {
    if (!api) return;
    const s = await api.loadSettings();
    const prev = Array.isArray(s.recentEditorFiles)
      ? (s.recentEditorFiles as string[]).filter((x) => typeof x === "string")
      : [];
    const next = [relPath, ...prev.filter((p) => p !== relPath)].slice(0, MAX_RECENT_FILES);
    await api.saveSettings({ recentEditorFiles: next });
    setRecentFiles(next);
  }, []);

  const loadEditorPrefs = useCallback(async () => {
    if (!api) return;
    const s = await api.loadSettings();
    if (s.cursorApiKey) setApiKey(s.cursorApiKey);
    if (s.modelId) setModelId(String(s.modelId));
    if (typeof s.editorFontSize === "number") setEditorFontSize(s.editorFontSize);
    if (typeof s.editorTabSize === "number") setEditorTabSize(s.editorTabSize);
    if (typeof s.editorWordWrap === "boolean") setEditorWordWrap(s.editorWordWrap);
  }, []);

  const applyAppearance = useCallback(async () => {
    if (!api) return;
    const s = await api.loadSettings();
    const theme =
      typeof s.uiTheme === "string" && s.uiTheme && s.uiTheme !== "default"
        ? s.uiTheme
        : "default";
    if (theme === "default") {
      delete document.documentElement.dataset.uiTheme;
    } else {
      document.documentElement.dataset.uiTheme = theme;
    }
    const raw = s.customBackgroundPath;
    if (typeof raw === "string" && raw.trim()) {
      const url = await api.pathToFileUrl(raw.trim());
      if (url) {
        document.body.style.setProperty("--user-bg-image", `url("${url}")`);
        document.body.classList.add("has-custom-bg");
      } else {
        document.body.classList.remove("has-custom-bg");
        document.body.style.removeProperty("--user-bg-image");
      }
    } else {
      document.body.classList.remove("has-custom-bg");
      document.body.style.removeProperty("--user-bg-image");
    }
    setMonacoTheme(s.uiTheme === "high_contrast" ? "hc-black" : "vs-dark");
  }, []);

  useEffect(() => {
    void loadEditorPrefs();
  }, [loadEditorPrefs]);

  useEffect(() => {
    void applyAppearance();
  }, [applyAppearance]);

  useEffect(() => {
    if (!api) return;
    const offOpen = api.onMenuOpenFolder(async () => {
      const p = await api.openFolder();
      if (p) await enterWorkspace();
    });
    const offHome = api.onMenuHome(() => {
      void goHub();
    });
    const offPrefs = api.onMenuPreferences(() => {
      setSettingsOpen(true);
    });
    return () => {
      offOpen();
      offHome();
      offPrefs();
    };
  }, [enterWorkspace, goHub]);

  useEffect(() => {
    if (!api) return;
    const offT = api.onAiToken((text) => {
      setAiOut((o) => o + text);
    });
    const offD = api.onAiDone(() => {
      setAiBusy(false);
      setAiOut((o) => o + "\n\n— Done —\n");
    });
    const offE = api.onAiError((msg) => {
      setAiError(msg);
      setAiBusy(false);
    });
    return () => {
      offT();
      offD();
      offE();
    };
  }, []);

  useEffect(() => {
    if (!api) return;
    const owner = "dotnet-build";
    const clearAllMarkers = () => {
      const m = monacoRef.current;
      if (!m) return;
      for (const model of m.editor.getModels()) {
        m.editor.setModelMarkers(model, owner, []);
      }
    };

    const pushLine = (line: string) => {
      const parsed = parseCompilerDiagnosticLine(line.trim());
      if (!parsed) return;
      let rel = parsed.relPath;
      if (root) {
        const nr = normalizeWinCase(root);
        const np = normalizeWinCase(rel);
        if (np.startsWith(`${nr}/`)) {
          rel = normalizeSlashes(rel).slice(normalizeSlashes(root).length + 1);
        }
      }
      rel = normalizeSlashes(rel);
      const arr = buildDiagByFileRef.current.get(rel) ?? [];
      arr.push(parsed.marker);
      buildDiagByFileRef.current.set(rel, arr);
    };

    const flushChunk = (text: string) => {
      const joined = buildChunkRemainderRef.current + text;
      const lines = joined.split(/\r?\n/);
      buildChunkRemainderRef.current = lines.pop() ?? "";
      for (const line of lines) pushLine(line);
    };

    const applyMarkers = () => {
      const m = monacoRef.current;
      if (!m) return;
      clearAllMarkers();
      for (const [relPath, markers] of buildDiagByFileRef.current.entries()) {
        const nRel = normalizeSlashes(relPath);
        const model = m.editor
          .getModels()
          .find((md) => normalizeSlashes(md.uri.path).replace(/^\/+/, "").endsWith(nRel));
        if (model) {
          m.editor.setModelMarkers(model, owner, markers);
        }
      }
    };

    const offData = api.onBuildData((payload) => {
      flushChunk(payload.text || "");
    });
    const offDone = api.onBuildDone(() => {
      if (buildChunkRemainderRef.current.trim()) {
        pushLine(buildChunkRemainderRef.current);
      }
      buildChunkRemainderRef.current = "";
      applyMarkers();
      buildDiagByFileRef.current = new Map();
    });

    return () => {
      offData();
      offDone();
    };
  }, [root]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveActive();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (uiMode === "workspace" && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpen(true);
      }
      if (uiMode === "workspace" && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        void reopenClosedTab();
      }
      if (uiMode === "workspace" && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setFocusFindTick((n) => n + 1);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, uiMode]);

  async function openFile(relPath: string, line?: number) {
    if (!api) return;
    const ln = line != null && line >= 1 ? Math.floor(line) : undefined;
    if (ln == null) pendingNavRef.current = null;

    const existing = tabs.find((t) => t.path === relPath);
    if (existing) {
      setActivePath(relPath);
      if (ln != null) {
        pendingNavRef.current = { path: relPath, line: ln };
        setEditorNavTick((n) => n + 1);
      }
      void recordRecentFile(relPath);
      return;
    }
    try {
      const content = await api.readFile(relPath);
      setTabs((t) => [
        ...t,
        { path: relPath, content, savedContent: content, dirty: false },
      ]);
      setActivePath(relPath);
      if (ln != null) {
        pendingNavRef.current = { path: relPath, line: ln };
        setEditorNavTick((n) => n + 1);
      }
      void recordRecentFile(relPath);
    } catch (e) {
      setAiError(String((e as Error)?.message || e));
    }
  }

  function closeTab(filePath: string) {
    const victim = tabs.find((t) => t.path === filePath);
    if (!victim) return;
    closedTabsRef.current = [{ ...victim }, ...closedTabsRef.current].slice(0, MAX_CLOSED_STACK);
    const next = tabs.filter((t) => t.path !== filePath);
    setTabs(next);
    if (activePath === filePath) {
      setActivePath(next[0]?.path ?? null);
    }
  }

  async function reopenClosedTab() {
    if (!api) return;
    const snap = closedTabsRef.current[0];
    if (!snap) return;
    closedTabsRef.current = closedTabsRef.current.slice(1);
    if (tabsRef.current.some((t) => t.path === snap.path)) {
      setActivePath(snap.path);
      return;
    }
    try {
      const content = await api.readFile(snap.path);
      setTabs((ts) => [...ts, { path: snap.path, content, savedContent: content, dirty: false }]);
      setActivePath(snap.path);
      void recordRecentFile(snap.path);
    } catch {
      closedTabsRef.current = [snap, ...closedTabsRef.current];
      setAiError(`Could not reopen ${snap.path} — file may have been moved or deleted.`);
    }
  }

  async function saveActive() {
    if (!api || !activeTab || !activeTab.dirty) return;
    await api.writeFile(activeTab.path, activeTab.content);
    setTabs((ts) =>
      ts.map((t) =>
        t.path === activeTab.path
          ? { ...t, savedContent: activeTab.content, dirty: false }
          : t
      )
    );
  }

  function updateEditor(value: string | undefined) {
    if (!activePath || value === undefined) return;
    setTabs((ts) =>
      ts.map((t) =>
        t.path === activePath
          ? { ...t, content: value, dirty: value !== t.savedContent }
          : t
      )
    );
  }

  async function persistSettings(nextKey: string, nextModel: string) {
    if (!api) return;
    await api.saveSettings({ cursorApiKey: nextKey, modelId: nextModel });
  }

  function runAi() {
    if (!api || !aiPrompt.trim()) return;
    setAiError(null);
    setAiOut("");
    setAiBusy(true);
    void persistSettings(apiKey, modelId);
    api.aiStart({ prompt: aiPrompt.trim(), apiKey, modelId });
  }

  function buildPaletteCommands(): PaletteCommand[] {
    if (!api) return [];
    if (uiMode === "hub") {
      const out: PaletteCommand[] = [
        {
          id: "hub-settings",
          section: "General",
          label: "Open settings",
          hint: "Ctrl+,",
          keywords: "preferences theme discord wallpaper",
          run: () => setSettingsOpen(true),
        },
        {
          id: "hub-open-folder",
          section: "Project",
          label: "Open folder…",
          hint: "Browse for a project",
          keywords: "open browse directory workspace",
          run: async () => {
            const p = await api.openFolder();
            if (p) await enterWorkspace();
          },
        },
      ];
      recent.slice(0, 12).forEach((abs, i) => {
        const norm = abs.replace(/\\/g, "/");
        const short = basename(norm);
        out.push({
          id: `hub-recent-${i}`,
          section: "Recent projects",
          label: `Open ${short}`,
          hint: abs,
          keywords: `${abs} ${short}`.toLowerCase(),
          run: async () => {
            const ok = await api.pathExists(abs);
            if (!ok) {
              window.alert("That folder no longer exists. Pick another project from the hub.");
              return;
            }
            await api.openProjectPath(abs);
            await enterWorkspace();
          },
        });
      });
      return out;
    }
    const ws: PaletteCommand[] = [
      {
        id: "ws-hub",
        section: "Navigate",
        label: "Go to project hub…",
        hint: "Ctrl+Shift+H",
        keywords: "home welcome start close project",
        run: () => void goHub(),
      },
      {
        id: "ws-open-folder",
        section: "Project",
        label: "Open different folder…",
        keywords: "switch browse directory workspace",
        run: async () => {
          const p = await api.openFolder();
          if (p) {
            setTabs([]);
            setActivePath(null);
            await refreshTree();
          }
        },
      },
      {
        id: "ws-save",
        section: "Editor",
        label: "Save active file",
        hint: "Ctrl+S",
        keywords: "write disk",
        run: () => void saveActive(),
      },
      {
        id: "ws-quick",
        section: "Editor",
        label: "Go to file…",
        hint: "Ctrl+P",
        keywords: "quick open fuzzy path file",
        run: () => setQuickOpen(true),
      },
      {
        id: "ws-settings",
        section: "General",
        label: "Open settings",
        hint: "Ctrl+,",
        keywords: "preferences theme discord",
        run: () => setSettingsOpen(true),
      },
      {
        id: "ws-find",
        section: "Search",
        label: "Focus find in project",
        hint: "Ctrl+Shift+F",
        keywords: "search grep workspace",
        run: () => setFocusFindTick((n) => n + 1),
      },
      {
        id: "ws-reopen",
        section: "Editor",
        label: "Reopen closed editor",
        hint: "Ctrl+Shift+T",
        keywords: "undo close tab restore",
        run: () => void reopenClosedTab(),
      },
    ];
    recentFiles.slice(0, 16).forEach((rel, i) => {
      ws.push({
        id: `rf-${i}-${rel}`,
        section: "Recent files",
        label: `Open ${basename(rel)}`,
        hint: rel,
        keywords: `${rel} ${basename(rel)}`.toLowerCase(),
        run: () => void openFile(rel),
      });
    });
    return ws;
  }

  if (!api) {
    return (
      <div className="gate-msg">
        <p>
          Run with Electron: <code>npm run electron:dev</code>
        </p>
      </div>
    );
  }

  if (uiMode === "hub") {
    return (
      <>
        <WelcomeHub
          onProjectReady={enterWorkspace}
          recent={recent}
          onRecentUpdate={setRecent}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            void loadEditorPrefs();
            void applyAppearance();
          }}
        />
        <CommandPaletteModal
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          commands={buildPaletteCommands()}
        />
      </>
    );
  }

  return (
    <div className="app workspace">
      <div className="workspace-shell">
      <header className="titlebar">
        <div className="titlebar-left">
          <button
            type="button"
            className="btn-pill"
            onClick={() => void goHub()}
          >
            ◆ Hub
          </button>
          <button
            type="button"
            className="btn-pill btn-pill-muted"
            onClick={async () => {
              const p = await api.openFolder();
              if (p) {
                setTabs([]);
                setActivePath(null);
                await refreshTree();
              }
            }}
          >
            Open folder
          </button>
          <button
            type="button"
            className="btn-pill btn-pill-muted"
            disabled={!activeTab?.dirty}
            onClick={() => void saveActive()}
          >
            Save
          </button>
          <button
            type="button"
            className="btn-pill btn-pill-muted"
            title="Go to file (Ctrl+P)"
            onClick={() => setQuickOpen(true)}
          >
            Go to file
          </button>
          <button
            type="button"
            className="btn-pill btn-pill-muted"
            title="Command palette (Ctrl+Shift+P)"
            onClick={() => setCommandPaletteOpen(true)}
          >
            Commands
          </button>
          <button
            type="button"
            className="btn-pill btn-pill-muted"
            title="Settings (Ctrl+,)"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
        </div>
        <div className="titlebar-path" title={root ?? ""}>
          {root ?? ""}
        </div>
      </header>

      <div className="body work-body">
        <aside className="sidebar explorer">
          <div className="panel-header">Explorer</div>
          <div className="panel-scroll">
            {tree.length === 0 ? (
              <div className="panel-empty">No files</div>
            ) : (
              <FileTree
                nodes={tree}
                activePath={activePath}
                onOpenFile={(p) => void openFile(p)}
              />
            )}
          </div>
          <GitStrip projectRoot={root} />
        </aside>

        <main className="editor-stack">
          <div className="tab-strip">
            {tabs.map((t) => (
              <div key={t.path} className="tab-pill-wrap">
                <button
                  type="button"
                  className={`tab-pill ${t.path === activePath ? "active" : ""}`}
                  title={t.path}
                  onClick={() => setActivePath(t.path)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(t.path);
                    }
                  }}
                >
                  {basename(t.path)}
                  {t.dirty ? " ·" : ""}
                </button>
                <button
                  type="button"
                  className="tab-close"
                  title="Close tab"
                  aria-label={`Close ${basename(t.path)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.path);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {activeTab ? (
            <div className="monaco-wrap">
              <Editor
                height="100%"
                theme={monacoTheme}
                path={activeTab.path}
                defaultLanguage={guessLang(activeTab.path)}
                value={activeTab.content}
                onMount={(ed, monaco) => {
                  editorRef.current = ed;
                  monacoRef.current = monaco;
                  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: false,
                    noSyntaxValidation: false,
                  });
                  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                    noSemanticValidation: false,
                    noSyntaxValidation: false,
                  });
                }}
                onChange={(v) => updateEditor(v)}
                options={{
                  fontSize: editorFontSize,
                  tabSize: editorTabSize,
                  fontFamily: "'JetBrains Mono', Consolas, monospace",
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  wordWrap: editorWordWrap ? "on" : "off",
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  padding: { top: 8 },
                  renderValidationDecorations: "on",
                }}
              />
            </div>
          ) : (
            <div className="editor-placeholder">
              <p>Open a file from the explorer</p>
            </div>
          )}
        </main>

        <aside className="ai-drawer">
          <div className="panel-header">Cursor AI</div>
          <div className="ai-inner">
            <label className="field-label">API key</label>
            <input
              className="field-input"
              type="password"
              autoComplete="off"
              placeholder="cursor_…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => void persistSettings(apiKey, modelId)}
            />
            <label className="field-label">Model</label>
            <input
              className="field-input"
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              onBlur={() => void persistSettings(apiKey, modelId)}
            />
            {aiError && <div className="inline-error">{aiError}</div>}
            <label className="field-label">Prompt</label>
            <textarea
              className="ai-prompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Runs in your project folder…"
            />
            <div className="ai-stream">{aiOut || "…"}</div>
            <button
              type="button"
              className="btn-primary btn-block"
              disabled={aiBusy}
              onClick={() => runAi()}
            >
              {aiBusy ? "Running…" : "Run agent"}
            </button>
          </div>
        </aside>
      </div>

      <WorkspaceDock
        projectRoot={root}
        analyze={projectAnalyze}
        onRefreshAnalyze={refreshProjectAnalyze}
        onOpenFile={(p, line) => void openFile(p, line)}
        onPackagesChanged={() => {
          void refreshTree();
          void refreshProjectAnalyze();
        }}
        focusFindTick={focusFindTick}
      />
      </div>

      <QuickOpenModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onPick={(p) => void openFile(p)}
      />
      <CommandPaletteModal
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={buildPaletteCommands()}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          void loadEditorPrefs();
          void applyAppearance();
        }}
      />
    </div>
  );
}

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function guessLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sql: "sql",
    sh: "shell",
    ps1: "powershell",
  };
  return map[ext] ?? "plaintext";
}
