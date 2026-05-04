import React, { useEffect, useRef, useState } from "react";
import type { ProjectAnalyzeResult } from "./types";

const api = window.encryptic;

type Props = {
  analyze: ProjectAnalyzeResult | null;
  onRefreshAnalyze: () => Promise<void>;
};

export function BuildPanel({ analyze, onRefreshAnalyze }: Props) {
  const [log, setLog] = useState("");
  const [running, setRunning] = useState(false);
  const [lastExit, setLastExit] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offD = api.onBuildData((payload: { stream: string; text: string }) => {
      setLog((l) => l + payload.text);
    });
    const offDone = api.onBuildDone((p: { code: number; signal: string | null }) => {
      setRunning(false);
      setLastExit(
        `Finished with exit code ${p.code}${p.signal ? ` (${p.signal})` : ""}.`
      );
    });
    const offMenuStop = api.onMenuBuildStop(() => {
      void api.buildStop();
      setRunning(false);
      setLog((l) => l + "\n— stop requested —\n");
    });
    return () => {
      offD();
      offDone();
      offMenuStop();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const first = analyze?.presets?.[0];
        if (!first || running) return;
        setLastExit(null);
        setLog((l) => l + `\n▶ ${first.id} (${first.label})\n`);
        setRunning(true);
        void (async () => {
          try {
            await api.buildStart(first.id);
          } catch (err: unknown) {
            setRunning(false);
            setLog((l) => l + `\n${String((err as Error)?.message || err)}\n`);
          }
        })();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [analyze, running]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const runPreset = async (presetId: string) => {
    setLastExit(null);
    setLog((l) => l + `\n▶ ${presetId}\n`);
    setRunning(true);
    try {
      await api.buildStart(presetId);
    } catch (e) {
      setRunning(false);
      setLog((l) => l + `\n${String((e as Error)?.message || e)}\n`);
    }
  };

  const stop = async () => {
    await api.buildStop();
    setRunning(false);
    setLog((l) => l + "\n— build stop requested —\n");
  };

  return (
    <div className="build-panel-inner">
      <div className="build-panel-toolbar">
        {analyze && (
          <span className="build-summary" title={analyze.stacks.join(", ")}>
            {analyze.summary}
          </span>
        )}
        <div className="build-dock-actions">
          <button
            type="button"
            className="btn-ghost btn-compact"
            disabled={running}
            onClick={() => void onRefreshAnalyze()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn-ghost btn-compact"
            disabled={!running}
            onClick={() => void stop()}
          >
            Stop
          </button>
          <button
            type="button"
            className="btn-ghost btn-compact"
            onClick={() => {
              setLog("");
              setLastExit(null);
            }}
          >
            Clear log
          </button>
        </div>
      </div>

      <div className="build-preset-row">
        {analyze?.presets?.length ? (
          analyze.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="preset-chip"
              disabled={running}
              title={p.label}
              onClick={() => void runPreset(p.id)}
            >
              {p.label}
            </button>
          ))
        ) : (
          <span className="build-empty-hint">
            No auto-detected build steps. Add a .sln/.slnx or .csproj (any subfolder), CMakeLists.txt,
            package.json, Cargo.toml, go.mod, or main.py, then press Refresh.
          </span>
        )}
      </div>
      <div className="build-shortcut-hint">Ctrl+Shift+B — first action</div>
      {lastExit && <div className="build-exit-hint">{lastExit}</div>}
      <div className="build-log-wrap dock-build-log">
        <pre className="build-log">{log || "Output appears here."}</pre>
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
