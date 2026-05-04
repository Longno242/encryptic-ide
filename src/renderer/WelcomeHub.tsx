import React, { useCallback, useEffect, useState } from "react";
import type { TemplateMeta } from "./types";

type Props = {
  onProjectReady: () => Promise<void>;
  recent: string[];
  onRecentUpdate: (paths: string[]) => void;
  onOpenSettings: () => void;
};

const api = window.encryptic;

const STACK_CHIPS: { id: string; label: string }[] = [
  { id: "all", label: "All stacks" },
  { id: "dotnet", label: ".NET / C#" },
  { id: "cpp", label: "C++" },
  { id: "web", label: "Web" },
  { id: "rust", label: "Rust" },
  { id: "python", label: "Python" },
];

export function WelcomeHub({ onProjectReady, recent, onRecentUpdate, onOpenSettings }: Props) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [stackFilter, setStackFilter] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("MyApp");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const list = await api.listTemplates();
      setTemplates(list as TemplateMeta[]);
      const s = await api.loadSettings();
      const h = s.hubStackFilter;
      if (typeof h === "string" && h) setStackFilter(h);
    })();
  }, []);

  const filteredTemplates =
    stackFilter === "all"
      ? templates
      : templates.filter((t) => t.stack === stackFilter);

  async function setStackAndPersist(id: string) {
    setStackFilter(id);
    await api.saveSettings({ hubStackFilter: id });
  }

  const openExisting = useCallback(async () => {
    setErr(null);
    const p = await api.openFolder();
    if (p) {
      await onProjectReady();
      const s = await api.loadSettings();
      onRecentUpdate((s.recentProjects as string[]) || []);
    }
  }, [onProjectReady, onRecentUpdate]);

  const openRecent = useCallback(
    async (p: string) => {
      setErr(null);
      setBusy(true);
      try {
        const ok = await api.pathExists(p);
        if (!ok) {
          setErr("That folder no longer exists. Pick another project.");
          setBusy(false);
          return;
        }
        await api.openProjectPath(p);
        await onProjectReady();
        const s = await api.loadSettings();
        onRecentUpdate((s.recentProjects as string[]) || []);
      } catch (e) {
        setErr(String((e as Error)?.message || e));
      } finally {
        setBusy(false);
      }
    },
    [onProjectReady, onRecentUpdate]
  );

  const pickParent = async () => {
    setErr(null);
    const p = await api.pickParentFolder();
    if (p) setParentPath(p);
  };

  const startWizard = () => {
    setErr(null);
    setStep(0);
    setSelectedId(null);
    setProjectName("MyApp");
    setParentPath(null);
    setWizardOpen(true);
  };

  const finishCreate = async () => {
    if (!selectedId || !parentPath?.trim()) {
      setErr("Choose a template and a parent folder.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.createProject({
        parentPath,
        projectName: projectName.trim() || "MyApp",
        templateId: selectedId,
      });
      setWizardOpen(false);
      await onProjectReady();
      const s = await api.loadSettings();
      onRecentUpdate((s.recentProjects as string[]) || []);
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hub">
      <div className="hub-bg" aria-hidden />
      <div className="hub-content">
        <header className="hub-header">
          <div className="hub-header-top">
            <div className="hub-brand">
              <img
                className="hub-logo-img"
                src="./encryptic-logo.png"
                alt=""
                width={56}
                height={56}
              />
              <div>
                <h1>Encryptic IDE</h1>
                <p className="hub-tagline">Code. Build. Secure.</p>
                <p>Start a new codebase or jump back into one you already have.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn-pill btn-pill-muted hub-settings-btn"
              title="Settings (Ctrl+,)"
              onClick={() => onOpenSettings()}
            >
              Settings
            </button>
          </div>
        </header>

        <div className="hub-stack-bar" role="group" aria-label="Preferred stack">
          {STACK_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`stack-chip ${stackFilter === c.id ? "active" : ""}`}
              onClick={() => void setStackAndPersist(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <section className="hub-actions">
          <button
            type="button"
            className="hub-card hub-card-primary"
            disabled={busy}
            onClick={() => void openExisting()}
          >
            <span className="hub-card-icon">📂</span>
            <span className="hub-card-title">Open existing project</span>
            <span className="hub-card-desc">
              Browse to any folder — C++, .NET, web, or anything else.
            </span>
          </button>
          <button
            type="button"
            className="hub-card hub-card-accent"
            disabled={busy}
            onClick={() => startWizard()}
          >
            <span className="hub-card-icon">✦</span>
            <span className="hub-card-title">Create new project</span>
            <span className="hub-card-desc">
              Pick a language stack and we scaffold files for you.
            </span>
          </button>
        </section>

        {recent.length > 0 && (
          <section className="hub-recent">
            <h2>Continue</h2>
            <ul>
              {recent.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className="hub-recent-row"
                    disabled={busy}
                    title={p}
                    onClick={() => void openRecent(p)}
                  >
                    <span className="hub-recent-name">{shortPath(p)}</span>
                    <span className="hub-recent-path">{p}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {err && <div className="hub-banner hub-banner-error">{err}</div>}
      </div>

      {wizardOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wiz-title"
        >
          <div className="modal">
            <div className="modal-head">
              <h2 id="wiz-title">New project</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => !busy && setWizardOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-steps">
              <span className={step >= 0 ? "on" : ""}>1 · Stack</span>
              <span className="sep">→</span>
              <span className={step >= 1 ? "on" : ""}>2 · Name</span>
              <span className="sep">→</span>
              <span className={step >= 2 ? "on" : ""}>3 · Location</span>
            </div>

            {step === 0 && (
              <div className="modal-body template-grid">
                {filteredTemplates.length === 0 ? (
                  <p className="wizard-empty-filter">
                    No templates for this stack filter. Switch the hub to All stacks
                    or pick another stack chip.
                  </p>
                ) : (
                  filteredTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`template-tile ${selectedId === t.id ? "selected" : ""}`}
                      onClick={() => setSelectedId(t.id)}
                    >
                      <span className="template-badge">{t.badge}</span>
                      <span className="template-label">{t.label}</span>
                      <span className="template-desc">{t.desc}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {step === 1 && (
              <div className="modal-body">
                <label className="field-label">Project / folder name</label>
                <input
                  className="field-input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="MyGame"
                  autoFocus
                />
                <p className="field-hint">
                  This becomes the folder name on disk (unsafe characters are
                  removed automatically).
                </p>
              </div>
            )}

            {step === 2 && (
              <div className="modal-body">
                <label className="field-label">Parent folder</label>
                <div className="field-row">
                  <input
                    className="field-input field-input-grow"
                    readOnly
                    value={parentPath || ""}
                    placeholder="Choose where the project folder will be created…"
                  />
                  <button type="button" className="btn-ghost" onClick={() => void pickParent()}>
                    Browse…
                  </button>
                </div>
              </div>
            )}

            {err && <div className="modal-error">{err}</div>}

            <div className="modal-footer">
              {step > 0 ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setErr(null);
                    setStep((s) => s - 1);
                  }}
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <div className="modal-footer-right">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => setWizardOpen(false)}
                >
                  Cancel
                </button>
                {step < 2 ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      busy || (step === 0 && !selectedId) || (step === 1 && !projectName.trim())
                    }
                    onClick={() => {
                      setErr(null);
                      if (step === 0 && !selectedId) return;
                      if (step === 1 && !projectName.trim()) return;
                      setStep((s) => s + 1);
                    }}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || !parentPath}
                    onClick={() => void finishCreate()}
                  >
                    {busy ? "Creating…" : "Create project"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shortPath(full: string): string {
  const parts = full.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || full;
}
