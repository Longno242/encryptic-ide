import React, { useCallback, useEffect, useState } from "react";
import type { NugetSearchRow, NugetInstalledRow } from "./types";

const api = window.encryptic;

type Props = {
  onInstalledChanged: () => void;
};

export function NugetPanel({ onInstalledChanged }: Props) {
  const [csprojs, setCsprojs] = useState<string[]>([]);
  const [csproj, setCsproj] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [hits, setHits] = useState<NugetSearchRow[]>([]);
  const [installVer, setInstallVer] = useState<Record<string, string>>({});
  const [installed, setInstalled] = useState<NugetInstalledRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refreshCsproj = useCallback(async () => {
    setErr(null);
    try {
      const list = (await api.nugetListCsproj()) as string[];
      setCsprojs(list);
      if (list.length && !list.includes(csproj)) setCsproj(list[0]);
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    }
  }, [csproj]);

  useEffect(() => {
    void refreshCsproj();
  }, [refreshCsproj]);

  const loadInstalled = useCallback(async () => {
    if (!csproj) {
      setInstalled([]);
      return;
    }
    setListBusy(true);
    setErr(null);
    try {
      const rows = (await api.nugetListInstalled(csproj)) as NugetInstalledRow[];
      setInstalled(rows);
    } catch (e) {
      setInstalled([]);
      setErr(String((e as Error)?.message || e));
    } finally {
      setListBusy(false);
    }
  }, [csproj]);

  useEffect(() => {
    void loadInstalled();
  }, [loadInstalled]);

  async function runSearch() {
    setSearchBusy(true);
    setErr(null);
    setHits([]);
    try {
      const r = (await api.nugetSearch(searchQ.trim())) as NugetSearchRow[];
      setHits(r);
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setSearchBusy(false);
    }
  }

  async function install(id: string, defaultVer: string) {
    if (!csproj) {
      setErr("Select a .csproj first.");
      return;
    }
    const v = (installVer[id] ?? "").trim() || defaultVer || "";
    setInstallBusy(id);
    setMsg(null);
    setErr(null);
    try {
      const res = (await api.nugetAddPackage(csproj, id, v || undefined)) as {
        ok: boolean;
        log: string;
      };
      setMsg(res.log || `Installed ${id}.`);
      await loadInstalled();
      onInstalledChanged();
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setInstallBusy(null);
    }
  }

  return (
    <div className="nuget-panel">
      <div className="nuget-callout">
        <strong>BepInEx / Unity mods:</strong> use this tab for packages on{" "}
        <a href="https://www.nuget.org/" target="_blank" rel="noreferrer">
          nuget.org
        </a>{" "}
        (Harmony, analyzers, etc.). Unity / game assemblies are usually{" "}
        <code>&lt;Reference&gt;</code> to DLLs under your game&apos;s managed
        folder — add those in the .csproj or a <code>libs</code> folder, then
        reference the path.
      </div>

      <div className="nuget-toolbar">
        <label className="field-label">Target project (.csproj)</label>
        <div className="nuget-row">
          <select
            className="field-input nuget-select"
            value={csproj}
            onChange={(e) => setCsproj(e.target.value)}
          >
            {csprojs.length === 0 ? (
              <option value="">No .csproj found under this folder</option>
            ) : (
              csprojs.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="btn-ghost btn-compact"
            onClick={() => void refreshCsproj()}
          >
            Rescan
          </button>
          <button
            type="button"
            className="btn-ghost btn-compact"
            disabled={!csproj || listBusy}
            onClick={() => void loadInstalled()}
          >
            {listBusy ? "…" : "Refresh installed"}
          </button>
        </div>
      </div>

      {err && <div className="nuget-error">{err}</div>}
      {msg && <div className="nuget-msg">{msg}</div>}

      <div className="nuget-section">
        <div className="nuget-section-title">Marketplace search</div>
        <div className="nuget-row">
          <input
            className="field-input nuget-grow"
            placeholder="e.g. BepInEx.Analyzers, Lib.Harmony, Newtonsoft.Json"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
          <button
            type="button"
            className="btn-primary btn-compact"
            disabled={searchBusy || !searchQ.trim()}
            onClick={() => void runSearch()}
          >
            {searchBusy ? "…" : "Search"}
          </button>
        </div>
        <ul className="nuget-hit-list">
          {hits.map((h) => (
            <li key={h.id} className="nuget-hit-card">
              <div className="nuget-hit-head">
                <span className="nuget-id">{h.id}</span>
                <span className="nuget-ver">{h.version}</span>
              </div>
              {h.description && (
                <p className="nuget-desc">{h.description}</p>
              )}
              <div className="nuget-install-row">
                <input
                  className="field-input nuget-ver-input"
                  placeholder={`Version (default ${h.version})`}
                  value={installVer[h.id] ?? ""}
                  onChange={(e) =>
                    setInstallVer((m) => ({ ...m, [h.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn-primary btn-compact"
                  disabled={!csproj || installBusy === h.id}
                  onClick={() => void install(h.id, h.version)}
                >
                  {installBusy === h.id ? "…" : "Add to project"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="nuget-section">
        <div className="nuget-section-title">Installed packages</div>
        <ul className="nuget-installed">
          {installed.map((p) => (
            <li key={p.id}>
              <span className="nuget-id">{p.id}</span>
              <span className="nuget-ver">{p.version}</span>
            </li>
          ))}
        </ul>
        <p className="nuget-foot">
          Uses <code>dotnet add package</code> against the selected .csproj. Requires
          the .NET SDK on PATH. Legacy <code>packages.config</code> projects are
          list-only in this panel.
        </p>
      </div>
    </div>
  );
}
