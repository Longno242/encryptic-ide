import React, { useEffect, useState } from "react";

const api = window.encryptic;

const THEME_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "default", label: "Default", hint: "Original Encryptic blues" },
  { id: "encryptic", label: "Encryptic", hint: "Purple brand glow" },
  { id: "ocean", label: "Ocean", hint: "Deep teal & cyan" },
  { id: "sunset", label: "Sunset", hint: "Warm coral & violet" },
  { id: "forest", label: "Forest", hint: "Emerald & moss" },
  { id: "ember", label: "Ember", hint: "Amber & ember red" },
  { id: "high_contrast", label: "High contrast", hint: "Sharp blacks & yellow" },
];

const ALLOWED_THEMES = new Set(THEME_PRESETS.map((t) => t.id));

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function SettingsModal({ open, onClose, onSaved }: Props) {
  const [fontSize, setFontSize] = useState(14);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState(true);
  const [themeId, setThemeId] = useState("default");
  const [bgPath, setBgPath] = useState<string | null>(null);
  const [discordRpc, setDiscordRpc] = useState(false);
  const [discordRpcHint, setDiscordRpcHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDiscordRpcHint(null);
    void (async () => {
      const s = await api.loadSettings();
      if (typeof s.editorFontSize === "number") setFontSize(s.editorFontSize);
      if (typeof s.editorTabSize === "number") setTabSize(s.editorTabSize);
      if (typeof s.editorWordWrap === "boolean") setWordWrap(s.editorWordWrap);
      const t = typeof s.uiTheme === "string" && ALLOWED_THEMES.has(s.uiTheme) ? s.uiTheme : "default";
      setThemeId(t);
      const bg = s.customBackgroundPath;
      setBgPath(typeof bg === "string" && bg.trim() ? bg.trim() : null);
      setDiscordRpc(!!s.discordRpcEnabled);
    })();
  }, [open]);

  async function save() {
    setDiscordRpcHint(null);
    const uiTheme = ALLOWED_THEMES.has(themeId) ? themeId : "default";
    await api.saveSettings({
      editorFontSize: fontSize,
      editorTabSize: tabSize,
      editorWordWrap: wordWrap,
      uiTheme,
      customBackgroundPath: bgPath,
      discordRpcEnabled: discordRpc,
    });
    if (discordRpc) {
      const rpc = await api.discordRpcVerify();
      if (!rpc.ok && !("skipped" in rpc && rpc.skipped)) {
        setDiscordRpcHint(
          "message" in rpc && rpc.message
            ? rpc.message
            : "Make sure the Discord desktop app is running and you are logged in, then save again."
        );
        return;
      }
    }
    onSaved();
    onClose();
  }

  async function pickBackground() {
    const p = await api.pickWallpaperImage();
    if (p) setBgPath(p);
  }

  function clearBackground() {
    setBgPath(null);
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal glass-modal settings-modal">
        <div className="modal-head">
          <h2 id="settings-modal-title">Settings</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body settings-body">
          <h3 className="settings-section-title">Appearance</h3>
          <p className="settings-section-desc">Theme presets apply across the hub and workspace.</p>
          <div className="theme-grid" role="group" aria-label="Color theme">
            {THEME_PRESETS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-chip ${themeId === t.id ? "active" : ""}`}
                title={t.hint}
                onClick={() => setThemeId(t.id)}
              >
                <span className="theme-chip-label">{t.label}</span>
              </button>
            ))}
          </div>

          <label className="field-label">Custom background</label>
          <p className="settings-section-desc">
            Use any image on disk. It shows behind the UI with a dimmed overlay so text stays readable.
          </p>
          <div className="settings-row-btns">
            <button type="button" className="btn-ghost" onClick={() => void pickBackground()}>
              Choose image…
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!bgPath}
              onClick={clearBackground}
            >
              Clear
            </button>
          </div>
          {bgPath ? (
            <p className="settings-path-hint" title={bgPath}>
              {bgPath}
            </p>
          ) : null}

          <h3 className="settings-section-title">Editor</h3>
          <label className="field-label">Editor font size</label>
          <input
            type="number"
            min={10}
            max={28}
            className="field-input"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value) || 14)}
          />
          <label className="field-label">Tab size</label>
          <input
            type="number"
            min={1}
            max={8}
            className="field-input"
            value={tabSize}
            onChange={(e) => setTabSize(Number(e.target.value) || 2)}
          />
          <label className="settings-check">
            <input
              type="checkbox"
              checked={wordWrap}
              onChange={(e) => setWordWrap(e.target.checked)}
            />
            Word wrap
          </label>

          <h3 className="settings-section-title">Integrations</h3>
          <label className="settings-check settings-check-block">
            <input
              type="checkbox"
              checked={discordRpc}
              onChange={(e) => setDiscordRpc(e.target.checked)}
            />
            <span>
              Discord Rich Presence
              <span className="settings-subhint">
                {" "}
                Shows what you are doing in Discord when the desktop app is running. Uses your Encryptic
                application. If Discord is not open when you save, you will be asked to start it.
              </span>
            </span>
          </label>
          {discordRpcHint ? (
            <div className="settings-discord-hint" role="alert">
              {discordRpcHint}
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
