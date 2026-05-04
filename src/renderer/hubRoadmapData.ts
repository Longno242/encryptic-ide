/**
 * Edit this file to update the hub "To-go" tab (plans + known issues).
 * Keep ids stable if you later add links or ordering logic.
 */
export type RoadmapLine = { id: string; text: string };

/** Features and improvements you intend to add */
export const HUB_PLANNED: RoadmapLine[] = [
  { id: "p1", text: "Add items here — e.g. more project templates or stack presets." },
  { id: "p2", text: "Optional: language servers / format-on-save for common stacks." },
  { id: "p3", text: "Optional: command palette (Ctrl+Shift+P) for common actions." },
  { id: "p4", text: "Optional: Authenticode signing (CI secrets) for fewer SmartScreen prompts on Windows." },
];

/** Bugs or rough edges users might hit — keep this honest and update after fixes */
export const HUB_KNOWN_ISSUES: RoadmapLine[] = [
  {
    id: "k1",
    text: "Discord Rich Presence only works while the Discord desktop app is running; Settings shows a reminder if it cannot connect when you save.",
  },
];
