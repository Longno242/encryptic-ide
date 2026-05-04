import React, { useEffect, useState } from "react";
import type { GitSummary } from "./types";

const api = window.encryptic;

type Props = {
  projectRoot: string | null;
};

export function GitStrip({ projectRoot }: Props) {
  const [info, setInfo] = useState<GitSummary | null>(null);

  useEffect(() => {
    if (!projectRoot) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const g = (await api.gitSummary()) as GitSummary;
      if (!cancelled) setInfo(g);
    };
    void load();
    const t = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [projectRoot]);

  if (!projectRoot) return null;

  if (!info?.ok) {
    return (
      <div className="git-strip git-strip-muted">
        <span className="git-dot" />
        {info?.message || "Git"}
      </div>
    );
  }

  return (
    <div className="git-strip">
      <span className="git-dot git-dot-on" />
      <span className="git-branch">{info.branch}</span>
      {info.dirty > 0 ? (
        <span className="git-dirty">{info.dirty} changed</span>
      ) : (
        <span className="git-clean">clean</span>
      )}
    </div>
  );
}
