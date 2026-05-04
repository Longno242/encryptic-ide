import React, { useEffect, useState } from "react";
import { BuildPanel } from "./BuildPanel";
import { FindPanel } from "./FindPanel";
import { NugetPanel } from "./NugetPanel";
import { ReferencesPanel } from "./ReferencesPanel";
import { TerminalPanel } from "./TerminalPanel";
import type { ProjectAnalyzeResult } from "./types";

export type DockTabId = "build" | "find" | "nuget" | "refs" | "shell";

type Props = {
  projectRoot: string | null;
  analyze: ProjectAnalyzeResult | null;
  onRefreshAnalyze: () => Promise<void>;
  onOpenFile: (relPath: string, line?: number) => void;
  onPackagesChanged: () => void;
  /** Increment from parent (e.g. Ctrl+Shift+F) to jump to Search tab */
  focusFindTick?: number;
};

const TABS: { id: DockTabId; label: string; hint: string }[] = [
  { id: "build", label: "Build", hint: "Compile & presets" },
  { id: "find", label: "Search", hint: "Text in project" },
  { id: "nuget", label: "NuGet", hint: "Search & install packages" },
  { id: "refs", label: "References", hint: "Add DLLs to .csproj (files or folder)" },
  { id: "shell", label: "Shell", hint: "Run a command line" },
];

export function WorkspaceDock({
  projectRoot,
  analyze,
  onRefreshAnalyze,
  onOpenFile,
  onPackagesChanged,
  focusFindTick = 0,
}: Props) {
  const [tab, setTab] = useState<DockTabId>("build");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!focusFindTick) return;
    setTab("find");
    setCollapsed(false);
  }, [focusFindTick]);

  if (!projectRoot) return null;

  return (
    <div className={`workspace-dock ${collapsed ? "collapsed" : ""}`}>
      <div className="workspace-dock-bar">
        <button
          type="button"
          className="dock-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <span className="build-chev">{collapsed ? "▶" : "▼"}</span>
          Workspace tools
        </button>
        {!collapsed && (
          <nav className="dock-tab-strip" aria-label="Workspace panels">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`dock-tab ${tab === t.id ? "active" : ""}`}
                title={t.hint}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      {!collapsed && (
        <div className="workspace-dock-body">
          {tab === "build" && (
            <BuildPanel analyze={analyze} onRefreshAnalyze={onRefreshAnalyze} />
          )}
          {tab === "find" && (
            <FindPanel onOpenFile={onOpenFile} />
          )}
          {tab === "nuget" && (
            <NugetPanel onInstalledChanged={onPackagesChanged} />
          )}
          {tab === "refs" && (
            <ReferencesPanel onChanged={onPackagesChanged} />
          )}
          {tab === "shell" && <TerminalPanel />}
        </div>
      )}
    </div>
  );
}
