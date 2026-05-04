import React, { useCallback, useEffect, useState } from "react";
import type { CsprojDllRefRow } from "./types";

const api = window.encryptic;

type Props = {
  onChanged: () => void;
};

export function ReferencesPanel({ onChanged }: Props) {
  const [csprojs, setCsprojs] = useState<string[]>([]);
  const [csproj, setCsproj] = useState("");
  const [rows, setRows] = useState<CsprojDllRefRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [copyIntoProject, setCopyIntoProject] = useState(true);
  const [includeSubfolders, setIncludeSubfolders] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshCsproj = useCallback(async () => {
    setErr(null);
    try {
      const list = (await api.nugetListCsproj()) as string[];
      setCsprojs(list);
      setCsproj((prev) => (list.includes(prev) ? prev : list[0] ?? ""));
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    }
  }, []);

  useEffect(() => {
    void refreshCsproj();
  }, [refreshCsproj]);

  const loadRefs = useCallback(async () => {
    if (!csproj) {
      setRows([]);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = (await api.csprojListDllRefs(csproj)) as CsprojDllRefRow[];
      setRows(r);
    } catch (e) {
      setRows([]);
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }, [csproj]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  async function addDlls() {
    if (!csproj) {
      setErr("Select a .csproj first.");
      return;
    }
    setErr(null);
    setMsg(null);
    const picked = (await api.pickDllFiles()) as string[];
    if (!picked.length) return;
    setBusy(true);
    try {
      const res = (await api.csprojAddDllRefs(
        csproj,
        picked,
        copyIntoProject
      )) as { ok: boolean; added: number };
      setMsg(
        `Added ${res.added} reference(s). ${copyIntoProject ? "DLLs copied next to the .csproj under libs\\." : "Hint paths point to the files you picked."}`
      );
      await loadRefs();
      onChanged();
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function addDllsFromFolder() {
    if (!csproj) {
      setErr("Select a .csproj first.");
      return;
    }
    setErr(null);
    setMsg(null);
    const folder = (await api.pickDllFolder()) as string | null;
    if (!folder) return;
    setBusy(true);
    try {
      const dlls = (await api.listDllsInFolder(
        folder,
        includeSubfolders
      )) as string[];
      if (!dlls.length) {
        setErr(
          includeSubfolders
            ? "No .dll files found in that folder (or subfolders)."
            : "No .dll files found in that folder. Turn on “Include subfolders” if DLLs are nested."
        );
        return;
      }
      const res = (await api.csprojAddDllRefs(
        csproj,
        dlls,
        copyIntoProject
      )) as { ok: boolean; added: number };
      setMsg(
        `Added ${res.added} reference(s) from folder (${dlls.length} DLLs found). ${copyIntoProject ? "Copied under libs\\ next to the .csproj." : "Hint paths point to the original files."}`
      );
      await loadRefs();
      onChanged();
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(rawBlock: string) {
    if (!csproj) return;
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      await api.csprojRemoveDllRef(csproj, rawBlock);
      setMsg("Reference removed.");
      await loadRefs();
      onChanged();
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="refs-panel">
      <div className="refs-panel-head">
        <h2 className="refs-panel-title">References</h2>
        <p className="refs-panel-lead">
          Add every DLL you need to the selected project: Encryptic updates the
          <code>.csproj</code> for you (<code>&lt;Reference&gt;</code> +{" "}
          <code>HintPath</code>). Use <strong>Copy into libs\\</strong> to pull
          copies next to the project (recommended for game{" "}
          <code>Managed\\</code> folders). NuGet packages use the{" "}
          <strong>NuGet</strong> tab.
        </p>
      </div>

      <div className="nuget-toolbar">
        <label className="field-label">Project file (.csproj)</label>
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
            disabled={!csproj || busy}
            onClick={() => void loadRefs()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="refs-toolbar refs-toolbar-options">
        <label className="refs-check">
          <input
            type="checkbox"
            checked={copyIntoProject}
            onChange={(e) => setCopyIntoProject(e.target.checked)}
          />
          Copy DLLs into <code>libs\\</code> next to this .csproj (auto in
          project)
        </label>
        <label className="refs-check">
          <input
            type="checkbox"
            checked={includeSubfolders}
            onChange={(e) => setIncludeSubfolders(e.target.checked)}
          />
          Include subfolders when adding from a folder
        </label>
      </div>

      <div className="refs-actions">
        <button
          type="button"
          className="btn-primary btn-compact"
          disabled={!csproj || busy}
          onClick={() => void addDlls()}
        >
          Add DLL file(s)…
        </button>
        <button
          type="button"
          className="btn-primary btn-compact"
          disabled={!csproj || busy}
          onClick={() => void addDllsFromFolder()}
        >
          Add all DLLs from folder…
        </button>
      </div>

      {err && <div className="nuget-error">{err}</div>}
      {msg && <div className="nuget-msg">{msg}</div>}

      <div className="nuget-section">
        <div className="nuget-section-title">Assembly references (HintPath)</div>
        <ul className="refs-list">
          {rows.map((r, i) => (
            <li key={`${r.include}:${r.hintPath}:${i}`} className="refs-row">
              <div className="refs-meta">
                <span className="nuget-id">{r.include}</span>
                <span className="refs-hint" title={r.hintPath}>
                  {r.hintPath}
                </span>
              </div>
              <button
                type="button"
                className="btn-ghost btn-compact refs-remove"
                disabled={busy}
                onClick={() => void removeRow(r.rawBlock)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {rows.length === 0 && !busy && csproj && (
          <p className="refs-empty">No DLL references in this file yet.</p>
        )}
      </div>
    </div>
  );
}
