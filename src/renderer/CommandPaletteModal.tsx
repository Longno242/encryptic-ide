import React, { useEffect, useMemo, useRef, useState } from "react";

export type PaletteCommand = {
  id: string;
  section: string;
  label: string;
  hint?: string;
  /** Lowercase haystack for fuzzy filter */
  keywords: string;
  run: () => void | Promise<void>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
};

function scoreCmd(cmd: PaletteCommand, q: string): number {
  const hay = `${cmd.label} ${cmd.hint ?? ""} ${cmd.keywords}`.toLowerCase();
  const qq = q.trim().toLowerCase();
  if (!qq) return 1;
  if (hay.includes(qq)) return 200;
  const parts = qq.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of parts) {
    if (hay.includes(w)) s += 80;
  }
  return s;
}

export function CommandPaletteModal({ open, onClose, commands }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ranked = useMemo(() => {
    if (!q.trim()) return commands;
    return [...commands]
      .map((c) => ({ c, s: scoreCmd(c, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.c.label.localeCompare(b.c.label))
      .map((x) => x.c);
  }, [commands, q]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setSel(0);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    setSel(0);
  }, [q, open, commands.length]);

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
        void Promise.resolve(ranked[sel].run()).finally(() => onClose());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, ranked, sel, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay quick-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="palette-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-quick glass-modal">
        <div className="modal-head">
          <h2 id="palette-title">Command palette</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="quick-body">
          <input
            ref={inputRef}
            className="field-input quick-input"
            placeholder="Type a command name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="quick-list" role="listbox" aria-label="Commands">
            {ranked.length === 0 ? (
              <li className="palette-empty">No matching commands</li>
            ) : (
              ranked.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === sel}>
                  <button
                    type="button"
                    className={`quick-row palette-row ${i === sel ? "active" : ""}`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => void Promise.resolve(c.run()).finally(() => onClose())}
                  >
                    <span className="palette-row-main">{c.label}</span>
                    {c.hint ? <span className="palette-row-hint">{c.hint}</span> : null}
                    <span className="palette-row-sec">{c.section}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="quick-footer">Enter run · Esc close · ↑↓ navigate · Ctrl+Shift+P</div>
      </div>
    </div>
  );
}
