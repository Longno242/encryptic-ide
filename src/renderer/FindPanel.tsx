import React, { useState } from "react";
import type { SearchHit } from "./types";

const api = window.encryptic;

type Props = {
  onOpenFile: (relPath: string, line?: number) => void;
};

export function FindPanel({ onOpenFile }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function runSearch() {
    setErr(null);
    setBusy(true);
    setHits([]);
    try {
      const r = await api.searchInProject(query.trim(), 160);
      setHits(r as SearchHit[]);
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="find-panel">
      <div className="find-toolbar">
        <input
          className="field-input find-input"
          placeholder="Search text in project (ripgrep if installed, else scan)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch();
          }}
        />
        <button
          type="button"
          className="btn-primary btn-compact"
          disabled={busy || !query.trim()}
          onClick={() => void runSearch()}
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
      {err && <div className="find-error">{err}</div>}
      <p className="find-hint">
        Install{" "}
        <a
          href="https://github.com/BurntSushi/ripgrep#installation"
          target="_blank"
          rel="noreferrer"
        >
          ripgrep (rg)
        </a>{" "}
        on PATH for faster search on large repos.
      </p>
      <ul className="find-results">
        {hits.map((h, i) => (
          <li key={`${h.path}:${h.line}:${i}`}>
            <button
              type="button"
              className="find-hit"
              onClick={() => onOpenFile(h.path, h.line)}
            >
              <span className="find-hit-path">
                {h.path}
                <span className="find-hit-line">:{h.line}</span>
              </span>
              <span className="find-hit-preview">{h.preview}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
