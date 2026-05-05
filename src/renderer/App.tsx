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
import { SecurityScanModal } from "./SecurityScanModal";
import { SecurityScanProgressOverlay } from "./SecurityScanProgressOverlay";
import type {
  BuildProblemRow,
  OpenTab,
  ProjectAnalyzeResult,
  SecurityScanProgressPayload,
  SecurityScanResult,
  TreeNode,
} from "./types";

const MAX_RECENT_FILES = 32;
const MAX_CLOSED_STACK = 16;

const api = typeof window !== "undefined" ? window.encryptic : undefined;

type UiMode = "hub" | "workspace";

type AiProviderId = "cursor" | "openai" | "openai_compatible" | "anthropic";

function normalizeAiProvider(raw: unknown): AiProviderId {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "openai" || s === "openai_compatible" || s === "anthropic") return s;
  return "cursor";
}

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

function getLineAndColumnFromOffset(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const end = Math.min(Math.max(0, offset), text.length);
  for (let i = 0; i < end; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (la > lb) i += 1;
    else if (lb > la) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < la || j < lb) edits += 1;
  return edits === 1;
}

function localCsharpMarkers(text: string): editor.IMarkerData[] {
  const markers: editor.IMarkerData[] = [];
  // Catch very common access-modifier typos while typing (e.g. "rivate", "ublic").
  const rx = /\b(rivate|ublic|rotected|nternal)\b/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const bad = m[1];
    const start = m.index;
    const end = start + bad.length;
    const a = getLineAndColumnFromOffset(text, start);
    const b = getLineAndColumnFromOffset(text, end);
    const fix =
      bad === "rivate"
        ? "private"
        : bad === "ublic"
          ? "public"
          : bad === "rotected"
            ? "protected"
            : "internal";
    markers.push({
      severity: 8,
      code: "CS-TYPO",
      message: `Possible C# keyword typo: "${bad}" (did you mean "${fix}"?)`,
      startLineNumber: a.line,
      startColumn: a.col,
      endLineNumber: b.line,
      endColumn: Math.max(a.col + 1, b.col),
    });
  }

  // Broader keyword typo pass on the first token per line.
  const keywords = [
    "private",
    "public",
    "protected",
    "internal",
    "static",
    "class",
    "struct",
    "enum",
    "interface",
    "namespace",
    "using",
    "void",
    "return",
    "if",
    "else",
    "for",
    "foreach",
    "while",
    "switch",
    "case",
    "break",
    "continue",
    "new",
    "try",
    "catch",
    "finally",
    "throw",
  ];
  const seen = new Set<string>();
  const lineHead = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)/gm;
  let h: RegExpExecArray | null;
  while ((h = lineHead.exec(text))) {
    const token = h[1];
    if (!token || token.length < 3) continue;
    const lower = token.toLowerCase();
    if (keywords.includes(lower)) continue;
    let best = "";
    for (const kw of keywords) {
      if (isOneEditAway(lower, kw)) {
        best = kw;
        break;
      }
    }
    if (!best) continue;
    const key = `${h.index}:${lower}:${best}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const start = h.index + h[0].lastIndexOf(token);
    const end = start + token.length;
    const a = getLineAndColumnFromOffset(text, start);
    const b = getLineAndColumnFromOffset(text, end);
    markers.push({
      severity: 8,
      code: "CS-TYPO",
      message: `Possible C# keyword typo: "${token}" (did you mean "${best}"?)`,
      startLineNumber: a.line,
      startColumn: a.col,
      endLineNumber: b.line,
      endColumn: Math.max(a.col + 1, b.col),
    });
  }
  return markers;
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
  const [aiProvider, setAiProvider] = useState<AiProviderId>("cursor");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [aiDrawerOpen, setAiDrawerOpen] = useState(true);
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
  const [buildProblems, setBuildProblems] = useState<BuildProblemRow[]>([]);
  const buildDiagByFileRef = useRef<Map<string, editor.IMarkerData[]>>(new Map());
  const [buildMarkersByFile, setBuildMarkersByFile] = useState<Record<string, editor.IMarkerData[]>>(
    {}
  );
  const buildProblemsRef = useRef<BuildProblemRow[]>([]);
  const buildChunkRemainderRef = useRef("");
  const buildRunningRef = useRef(false);
  const securityScanRootRef = useRef<string | null>(null);
  const securityScanBusyRef = useRef(false);
  const [securityScanBusy, setSecurityScanBusy] = useState(false);
  const [securityScanProgress, setSecurityScanProgress] = useState<{
    scannedFiles: number;
    lastPath: string;
  }>({ scannedFiles: 0, lastPath: "" });
  const [securityScanModal, setSecurityScanModal] = useState<{
    open: boolean;
    result: SecurityScanResult | null;
  }>({ open: false, result: null });

  useEffect(() => {
    securityScanBusyRef.current = securityScanBusy;
  }, [securityScanBusy]);

  useEffect(() => {
    if (!api?.onSecurityScanProgress) return undefined;
    return api.onSecurityScanProgress((p: SecurityScanProgressPayload) => {
      if (!securityScanBusyRef.current) return;
      setSecurityScanProgress({
        scannedFiles: p.scannedFiles,
        lastPath: p.lastPath ?? "",
      });
    });
  }, []);

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
    // Enter the IDE shell first so scan UI can show as soon as a folder path is resolved.
    setUiMode("workspace");
    await refreshTree();
  }, [refreshTree]);

  const goHub = useCallback(async () => {
    if (!api) return;
    await api.closeProject();
    setTabs([]);
    setActivePath(null);
    closedTabsRef.current = [];
    securityScanRootRef.current = null;
    setSecurityScanBusy(false);
    setSecurityScanProgress({ scannedFiles: 0, lastPath: "" });
    setSecurityScanModal({ open: false, result: null });
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

  const runSecurityScan = useCallback(async (showAlways?: boolean) => {
    if (!api || !root) return null;
    setSecurityScanBusy(true);
    setSecurityScanProgress({ scannedFiles: 0, lastPath: "Starting read-only scan…" });
    try {
      const r = (await api.securityScanProject()) as SecurityScanResult;
      setSecurityScanProgress({
        scannedFiles: r.scannedFiles,
        lastPath: "Done",
      });
      if (showAlways || r.findings.length > 0) {
        setSecurityScanModal({ open: true, result: r });
      }
      return r;
    } catch {
      return null;
    } finally {
      setSecurityScanBusy(false);
    }
  }, [root]);

  useEffect(() => {
    if (uiMode === "workspace" && root) void refreshProjectAnalyze();
    else setProjectAnalyze(null);
  }, [uiMode, root, refreshProjectAnalyze]);

  useEffect(() => {
    if (!api || uiMode !== "workspace" || !root) return;
    if (securityScanRootRef.current === root) return;
    securityScanRootRef.current = root;
    // Fresh folder open → always show outcome (hits or explicit all-clear).
    void runSecurityScan(true);
  }, [api, uiMode, root, runSecurityScan]);

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
    setAiProvider(normalizeAiProvider(s.aiProvider));
    if (typeof s.openaiApiKey === "string") setOpenaiApiKey(s.openaiApiKey);
    if (typeof s.openaiBaseUrl === "string") setOpenaiBaseUrl(s.openaiBaseUrl);
    if (typeof s.anthropicApiKey === "string") setAnthropicApiKey(s.anthropicApiKey);
    if (typeof s.aiDrawerOpen === "boolean") setAiDrawerOpen(s.aiDrawerOpen);
    if (typeof s.editorFontSize === "number") setEditorFontSize(s.editorFontSize);
    if (typeof s.editorTabSize === "number") setEditorTabSize(s.editorTabSize);
    if (typeof s.editorWordWrap === "boolean") setEditorWordWrap(s.editorWordWrap);
  }, []);

  const persistAiSettings = useCallback(async () => {
    if (!api) return;
    await api.saveSettings({
      cursorApiKey: apiKey,
      modelId,
      aiProvider,
      openaiApiKey,
      openaiBaseUrl,
      anthropicApiKey,
      aiDrawerOpen,
    });
  }, [
    api,
    apiKey,
    modelId,
    aiProvider,
    openaiApiKey,
    openaiBaseUrl,
    anthropicApiKey,
    aiDrawerOpen,
  ]);

  const toggleAiDrawer = useCallback(() => {
    setAiDrawerOpen((prev) => {
      const next = !prev;
      if (api) {
        void api.saveSettings({
          cursorApiKey: apiKey,
          modelId,
          aiProvider,
          openaiApiKey,
          openaiBaseUrl,
          anthropicApiKey,
          aiDrawerOpen: next,
        });
      }
      return next;
    });
  }, [
    api,
    apiKey,
    modelId,
    aiProvider,
    openaiApiKey,
    openaiBaseUrl,
    anthropicApiKey,
  ]);

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
      const severity = parsed.marker.severity === 8 ? "error" : "warning";
      const code = String(parsed.marker.code ?? "");
      const msg = String(parsed.marker.message ?? "");
      buildProblemsRef.current.push({
        path: rel,
        line: parsed.marker.startLineNumber,
        column: parsed.marker.startColumn,
        severity,
        code,
        message: msg,
      });
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
      buildRunningRef.current = false;
      if (buildChunkRemainderRef.current.trim()) {
        pushLine(buildChunkRemainderRef.current);
      }
      buildChunkRemainderRef.current = "";
      applyMarkers();
      const next: Record<string, editor.IMarkerData[]> = {};
      for (const [k, v] of buildDiagByFileRef.current.entries()) {
        next[k] = v;
      }
      setBuildMarkersByFile(next);
      setBuildProblems(buildProblemsRef.current);
      buildDiagByFileRef.current = new Map();
      buildProblemsRef.current = [];
    });

    return () => {
      offData();
      offDone();
    };
  }, [root]);

  useEffect(() => {
    if (!api || uiMode !== "workspace" || !root || !projectAnalyze) return;
    if (!activeTab || !activeTab.path.toLowerCase().endsWith(".cs")) return;
    // Use compiler diagnostics for full checking (types, syntax, references).
    const dotnetBuild = projectAnalyze.presets.find((p) => p.id.startsWith("dotnet-build"));
    if (!dotnetBuild) return;
    const timeout = window.setTimeout(() => {
      if (buildRunningRef.current) return;
      buildRunningRef.current = true;
      void api.buildStart(dotnetBuild.id).catch(() => {
        buildRunningRef.current = false;
      });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [api, uiMode, root, projectAnalyze, activeTab?.path, activeTab?.content]);

  useEffect(() => {
    const m = monacoRef.current;
    if (!m) return;
    const owner = "dotnet-build";
    const norm = (p: string) => normalizeSlashes(p).replace(/^\/+/, "").toLowerCase();
    for (const model of m.editor.getModels()) {
      const rel = norm(model.uri.path);
      const hitKey = Object.keys(buildMarkersByFile).find((k) => norm(k) === rel);
      m.editor.setModelMarkers(model, owner, hitKey ? buildMarkersByFile[hitKey] : []);
    }
  }, [buildMarkersByFile, activeTab?.path, tabs.length]);

  useEffect(() => {
    const m = monacoRef.current;
    if (!m || !activeTab) return;
    const owner = "csharp-local";
    const norm = (p: string) => normalizeSlashes(p).replace(/^\/+/, "").toLowerCase();
    const model = m.editor
      .getModels()
      .find((md) => norm(md.uri.path) === norm(activeTab.path));
    if (!model) return;
    if (!activeTab.path.toLowerCase().endsWith(".cs")) {
      m.editor.setModelMarkers(model, owner, []);
      return;
    }
    m.editor.setModelMarkers(model, owner, localCsharpMarkers(activeTab.content));
  }, [activeTab?.path, activeTab?.content]);

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

  function runAi() {
    if (!api || !aiPrompt.trim()) return;
    setAiError(null);
    setAiOut("");
    setAiBusy(true);
    void persistAiSettings();
    api.aiStart({
      prompt: aiPrompt.trim(),
      provider: aiProvider,
      apiKey,
      modelId,
      openaiApiKey,
      openaiBaseUrl,
      anthropicApiKey,
    });
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
        id: "ws-ai-panel",
        section: "AI",
        label: aiDrawerOpen ? "Hide AI panel" : "Show AI panel",
        keywords: "assistant chatgpt openai claude cursor llm",
        run: () => toggleAiDrawer(),
      },
      {
        id: "ws-reopen",
        section: "Editor",
        label: "Reopen closed editor",
        hint: "Ctrl+Shift+T",
        keywords: "undo close tab restore",
        run: () => void reopenClosedTab(),
      },
      {
        id: "ws-security-scan",
        section: "Project",
        label: "Run security scan…",
        hint: "Heuristic patterns only",
        keywords: "malware virus base64 powershell script supply chain",
        run: () => void runSecurityScan(true),
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

  const scanShell = (
    <>
      <SecurityScanProgressOverlay
        open={securityScanBusy && !!root}
        projectLabel={root ? basename(root) : ""}
        scannedFiles={securityScanProgress.scannedFiles}
        lastPath={securityScanProgress.lastPath}
      />
      <SecurityScanModal
        open={securityScanModal.open}
        result={securityScanModal.result}
        onClose={() => setSecurityScanModal({ open: false, result: null })}
        onOpenFile={(p, line) => void openFile(p, line)}
      />
    </>
  );

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
        {scanShell}
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
        <button
          type="button"
          className={aiDrawerOpen ? "btn-pill btn-pill-muted" : "btn-pill"}
          title={aiDrawerOpen ? "Hide AI panel" : "Show AI panel"}
          onClick={toggleAiDrawer}
        >
          {aiDrawerOpen ? "Hide AI" : "AI"}
        </button>
      </header>

      <div
        className={`body work-body${aiDrawerOpen ? "" : " work-body--ai-collapsed"}`}
      >
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
          <GitStrip projectRoot={root} gitPaused={securityScanBusy} />
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

        {aiDrawerOpen ? (
          <aside className="ai-drawer">
            <div className="panel-header panel-header--row">
              <span>Assistant</span>
              <button
                type="button"
                className="ai-drawer-close"
                title="Hide panel"
                aria-label="Hide AI panel"
                onClick={toggleAiDrawer}
              >
                ×
              </button>
            </div>
            <div className="ai-inner">
              <label className="field-label">Provider</label>
              <select
                className="field-input field-select"
                value={aiProvider}
                onChange={(e) => {
                  const p = normalizeAiProvider(e.target.value);
                  setAiProvider(p);
                  if (api) {
                    void api.saveSettings({
                      cursorApiKey: apiKey,
                      modelId,
                      aiProvider: p,
                      openaiApiKey,
                      openaiBaseUrl,
                      anthropicApiKey,
                      aiDrawerOpen,
                    });
                  }
                }}
              >
                <option value="cursor">Cursor (agent in project)</option>
                <option value="openai">OpenAI (ChatGPT API)</option>
                <option value="openai_compatible">OpenAI-compatible (custom URL)</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>

              {aiProvider === "cursor" && (
                <>
                  <label className="field-label">Cursor API key</label>
                  <input
                    className="field-input"
                    type="password"
                    autoComplete="off"
                    placeholder="cursor_…"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onBlur={() => void persistAiSettings()}
                  />
                </>
              )}

              {(aiProvider === "openai" || aiProvider === "openai_compatible") && (
                <>
                  <label className="field-label">OpenAI API key</label>
                  <input
                    className="field-input"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-…"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    onBlur={() => void persistAiSettings()}
                  />
                  <label className="field-label">
                    {aiProvider === "openai_compatible"
                      ? "Base URL"
                      : "Base URL (optional)"}
                  </label>
                  <input
                    className="field-input"
                    type="url"
                    autoComplete="off"
                    placeholder={
                      aiProvider === "openai_compatible"
                        ? "https://api.example.com/v1"
                        : "https://api.openai.com/v1"
                    }
                    value={openaiBaseUrl}
                    onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                    onBlur={() => void persistAiSettings()}
                  />
                  {aiProvider === "openai" && (
                    <p className="field-hint ai-field-hint">
                      Leave empty for OpenAI's default <code>api.openai.com/v1</code>.
                    </p>
                  )}
                </>
              )}

              {aiProvider === "anthropic" && (
                <>
                  <label className="field-label">Anthropic API key</label>
                  <input
                    className="field-input"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-ant-…"
                    value={anthropicApiKey}
                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                    onBlur={() => void persistAiSettings()}
                  />
                </>
              )}

              <label className="field-label">Model</label>
              <input
                className="field-input"
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                onBlur={() => void persistAiSettings()}
                placeholder={
                  aiProvider === "cursor"
                    ? "composer-2"
                    : aiProvider === "anthropic"
                      ? "claude-3-5-sonnet-latest"
                      : "gpt-4o-mini"
                }
              />

              {aiProvider === "cursor" && (
                <p className="field-hint ai-field-hint">
                  Agent runs with your project folder as working directory.
                </p>
              )}

              {aiError && <div className="inline-error">{aiError}</div>}
              <label className="field-label">Prompt</label>
              <textarea
                className="ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  aiProvider === "cursor"
                    ? "Runs in your project folder…"
                    : "Chat message…"
                }
              />
              <div className="ai-stream">{aiOut || "…"}</div>
              <button
                type="button"
                className="btn-primary btn-block"
                disabled={aiBusy}
                onClick={() => runAi()}
              >
                {aiBusy
                  ? aiProvider === "cursor"
                    ? "Running…"
                    : "Sending…"
                  : aiProvider === "cursor"
                    ? "Run agent"
                    : "Send"}
              </button>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            className="ai-drawer-peek"
            title="Show AI panel"
            onClick={toggleAiDrawer}
          >
            AI
          </button>
        )}
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
        buildProblems={buildProblems}
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
      {scanShell}
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
