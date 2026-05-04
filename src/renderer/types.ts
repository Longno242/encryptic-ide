export type TemplateMeta = {
  id: string;
  label: string;
  desc: string;
  badge: string;
  stack: string;
};

export type BuildPresetRow = {
  id: string;
  label: string;
  group: string;
};

export type ProjectAnalyzeResult = {
  stacks: string[];
  summary: string;
  presets: BuildPresetRow[];
};

export type SearchHit = {
  path: string;
  line: number;
  preview: string;
};

export type GitSummary = {
  ok: boolean;
  branch: string | null;
  dirty: number;
  message?: string;
};

export type TreeNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: TreeNode[];
};

export type OpenTab = {
  path: string;
  content: string;
  savedContent: string;
  dirty: boolean;
};

export type NugetSearchRow = {
  id: string;
  version: string;
  description: string;
};

export type NugetInstalledRow = {
  id: string;
  version: string;
  requested?: string;
};

export type CsprojDllRefRow = {
  include: string;
  hintPath: string;
  rawBlock: string;
};
