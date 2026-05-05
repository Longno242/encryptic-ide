import React, { useEffect } from "react";
import type { SecurityScanResult } from "./types";

type Props = {
  open: boolean;
  result: SecurityScanResult | null;
  onClose: () => void;
  onOpenFile: (relPath: string, line: number) => void;
};

export function SecurityScanModal({ open, result, onClose, onOpenFile }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !result) return null;

  const { findings, scannedFiles, truncated } = result;

  return (
    <div
      className="modal-overlay quick-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sec-scan-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-quick glass-modal security-scan-modal">
        <div className="modal-head">
          <h2 id="sec-scan-title">Project security check</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="security-scan-body">
          <p className="security-scan-lead">
            Heuristic scan only — not antivirus. These patterns sometimes appear in malware or
            supply-chain scripts. Review before running unknown build steps or install scripts.
          </p>
          <p className="security-scan-meta">
            Scanned {scannedFiles} text file(s).
            {truncated ? " Some files were skipped (size or limit)." : ""}
          </p>
          {findings.length === 0 ? (
            <p className="security-scan-empty">No suspicious patterns matched.</p>
          ) : (
            <ul className="security-scan-list">
              {findings.map((f, i) => (
                <li key={`${f.path}-${f.line}-${f.id}-${i}`} className="security-scan-row">
                  <button
                    type="button"
                    className="security-scan-hit"
                    onClick={() => {
                      void onOpenFile(f.path, f.line);
                      onClose();
                    }}
                  >
                    <span className={`security-sev ${f.severity}`}>{f.severity}</span>
                    <span className="security-path">{f.path}:{f.line}</span>
                    <span className="security-title">{f.title}</span>
                    {f.snippet ? (
                      <code className="security-snippet">{f.snippet}</code>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="quick-footer">Esc or click outside to close</div>
      </div>
    </div>
  );
}
