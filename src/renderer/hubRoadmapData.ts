/**
 * Edit this file to update the hub Roadmap tab (to-do + known issues).
 * Keep ids stable if you later add links or ordering logic.
 */
export type RoadmapLine = { id: string; text: string };

/** Features and improvements you intend to add */
export const HUB_PLANNED: RoadmapLine[] = [
  { id: "p1", text: "More project templates / stack presets and polish for the new-project wizard." },
  { id: "p2", text: "Language servers and format-on-save for common stacks (where practical)." },
  {
    id: "p3",
    text: "Assistant: mirror provider keys and base URL in Settings, plus an optional global keyboard shortcut for the panel.",
  },
  { id: "p4", text: "Optional: Authenticode signing (CI secrets) for fewer SmartScreen prompts on Windows." },
];

/** Bugs or rough edges users might hit — keep this honest and update after fixes */
export const HUB_KNOWN_ISSUES: RoadmapLine[] = [
  {
    id: "k1",
    text: "Discord Rich Presence only works while the Discord desktop app is running; Settings shows a reminder if it cannot connect when you save.",
  },
  {
    id: "k2",
    text: "Security Scan uses pattern heuristics only (not full malware analysis) — expect false positives and false negatives; always review context before acting.",
  },
  {
    id: "k3",
    text: "Assistant (Cursor / OpenAI / Anthropic / compatible APIs) needs valid keys and network access; quotas, rate limits, and provider outages show as errors in the panel.",
  },
];
