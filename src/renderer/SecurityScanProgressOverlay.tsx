import React from "react";

type Props = {
  open: boolean;
  projectLabel: string;
  scannedFiles: number;
  lastPath: string;
};

export function SecurityScanProgressOverlay({
  open,
  projectLabel,
  scannedFiles,
  lastPath,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay security-scan-busy-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="security-scan-busy-card glass-modal">
        <div className="security-scan-busy-spinner" aria-hidden />
        <h2 className="security-scan-busy-title">Scanning project</h2>
        <p className="security-scan-busy-lead">
          Read-only security pass over source files. Nothing in this folder is executed — no install
          scripts, builds, or dev servers are started just by opening the project.
        </p>
        <p className="security-scan-busy-meta">
          <span className="security-scan-busy-root">{projectLabel}</span>
        </p>
        <p className="security-scan-busy-stats">
          <strong>{scannedFiles}</strong> file{scannedFiles === 1 ? "" : "s"} checked
        </p>
        {lastPath ? (
          <p className="security-scan-busy-path" title={lastPath}>
            {lastPath}
          </p>
        ) : null}
      </div>
    </div>
  );
}
