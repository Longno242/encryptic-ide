import React from "react";
import type { BuildProblemRow } from "./types";

type Props = {
  problems: BuildProblemRow[];
  onOpenFile: (relPath: string, line?: number) => void;
};

export function ProblemsPanel({ problems, onOpenFile }: Props) {
  const sorted = [...problems].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  return (
    <div className="problems-panel">
      <div className="problems-head">
        <span className="problems-count">{sorted.length} issue(s)</span>
      </div>
      {sorted.length === 0 ? (
        <div className="problems-empty">No build problems.</div>
      ) : (
        <ul className="problems-list">
          {sorted.map((p, i) => (
            <li key={`${p.path}:${p.line}:${p.column}:${p.code}:${i}`}>
              <button
                type="button"
                className="problem-row"
                onClick={() => onOpenFile(p.path, p.line)}
                title={`${p.path}:${p.line}:${p.column}`}
              >
                <span className={`problem-sev ${p.severity}`}>{p.severity}</span>
                <span className="problem-code">{p.code}</span>
                <span className="problem-msg">{p.message}</span>
                <span className="problem-loc">
                  {p.path}:{p.line}:{p.column}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
