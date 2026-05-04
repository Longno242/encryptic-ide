import React, { useEffect, useMemo, useRef, useState } from "react";

const api = window.encryptic;

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (relPath: string) => void;
};

function scorePath(path: string, q: string): number {
  const p = path.toLowerCase();
  const qq = q.trim().toLowerCase();
  if (!qq) return 1;
  if (p === qq) return 500;
  if (p.endsWith(qq)) return 300;
  if (p.includes(qq)) return 200;
  const parts = qq.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of parts) {
    if (p.includes(w)) s += 50;
  }
  return s;
}

export function QuickOpenModal({ open, onClose, onPick }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setSel(0);
      return;
    }
    void (async () => {
      const list = await api.listFilesFlat();
      setFiles(list as string[]);
    })();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const ranked = useMemo(() => {
    if (!q.trim()) return files.slice(0, 200);
    return [...files]
      .map((f) => ({ f, s: scorePath(f, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.f.localeCompare(b.f))
      .slice(0, 200)
      .map((x) => x.f);
  }, [files, q]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((i) => Math.min(ranked.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && ranked[sel]) {
        e.preventDefault();
        onPick(ranked[sel]);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, ranked, sel, onClose, onPick]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay quick-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-quick glass-modal">
        <div className="modal-head">
          <h2>Go to file</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="quick-body">
          <input
            ref={inputRef}
            className="field-input quick-input"
            placeholder="Type part of a path…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="quick-list">
            {ranked.map((f, i) => (
              <li key={f}>
                <button
                  type="button"
                  className={`quick-row ${i === sel ? "active" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => {
                    onPick(f);
                    onClose();
                  }}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="quick-footer">Enter open · Esc close · ↑↓ navigate</div>
      </div>
    </div>
  );
}
