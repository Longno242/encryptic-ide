import type {
  CsprojDllRefRow,
  NugetInstalledRow,
  NugetSearchRow,
} from "./types";

export {};

type TreeNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: TreeNode[];
};

type TemplateMeta = {
  id: string;
  label: string;
  desc: string;
  badge: string;
  stack: string;
};

type BuildPresetRow = {
  id: string;
  label: string;
  group: string;
};

type ProjectAnalyzeResult = {
  stacks: string[];
  summary: string;
  presets: BuildPresetRow[];
};

type SearchHit = {
  path: string;
  line: number;
  preview: string;
};

type GitSummary = {
  ok: boolean;
  branch: string | null;
  dirty: number;
  message?: string;
};

type EncrypticApi = {
  openFolder: () => Promise<string | null>;
  pickParentFolder: () => Promise<string | null>;
  openProjectPath: (folderPath: string) => Promise<string>;
  closeProject: () => Promise<boolean>;
  createProject: (payload: {
    parentPath: string;
    projectName: string;
    templateId: string;
  }) => Promise<string>;
  listTemplates: () => Promise<TemplateMeta[]>;
  listFilesFlat: () => Promise<string[]>;
  searchInProject: (query: string, maxResults?: number) => Promise<SearchHit[]>;
  gitSummary: () => Promise<GitSummary>;
  pathExists: (absPath: string) => Promise<boolean>;
  getRoot: () => Promise<string | null>;
  readFile: (relPath: string) => Promise<string>;
  writeFile: (relPath: string, contents: string) => Promise<boolean>;
  listTree: () => Promise<TreeNode[]>;
  loadSettings: () => Promise<{
    cursorApiKey?: string;
    modelId?: string;
    recentProjects?: string[];
    hubStackFilter?: string;
    editorFontSize?: number;
    editorTabSize?: number;
    editorWordWrap?: boolean;
    uiTheme?: string;
    customBackgroundPath?: string | null;
    discordRpcEnabled?: boolean;
  }>;
  saveSettings: (data: Record<string, unknown>) => Promise<boolean>;
  pickWallpaperImage: () => Promise<string | null>;
  pathToFileUrl: (absPath: string) => Promise<string>;
  discordRpcVerify: () => Promise<
    { ok: true; skipped?: boolean } | { ok: false; message: string }
  >;
  aiStart: (payload: {
    prompt: string;
    apiKey: string;
    modelId?: string;
  }) => void;
  shellRunLine: (line: string) => Promise<{ started: boolean }>;
  shellAbort: () => Promise<boolean>;
  onShellData: (cb: (payload: { stream: string; text: string }) => void) => () => void;
  onShellDone: (cb: (payload: { code: number }) => void) => () => void;
  onAiToken: (cb: (text: string) => void) => () => void;
  onAiDone: (cb: (data: { status: string; id?: string }) => void) => () => void;
  onAiError: (cb: (message: string) => void) => () => void;
  onMenuOpenFolder: (cb: () => void) => () => void;
  onMenuHome: (cb: () => void) => () => void;
  onMenuPreferences: (cb: () => void) => () => void;
  analyzeProject: () => Promise<ProjectAnalyzeResult>;
  buildStart: (presetId: string) => Promise<{ started: boolean }>;
  buildStop: () => Promise<boolean>;
  onBuildData: (cb: (payload: { stream: string; text: string }) => void) => () => void;
  onBuildDone: (cb: (payload: { code: number; signal: string | null }) => void) => () => void;
  onMenuBuildStop: (cb: () => void) => () => void;
  nugetSearch: (query: string) => Promise<NugetSearchRow[]>;
  nugetListCsproj: () => Promise<string[]>;
  nugetListInstalled: (csprojRel: string) => Promise<NugetInstalledRow[]>;
  nugetAddPackage: (
    csprojRel: string,
    packageId: string,
    version?: string
  ) => Promise<{ ok: boolean; log: string }>;
  pickDllFiles: () => Promise<string[]>;
  pickDllFolder: () => Promise<string | null>;
  listDllsInFolder: (absPath: string, recurse?: boolean) => Promise<string[]>;
  csprojListDllRefs: (csprojRel: string) => Promise<CsprojDllRefRow[]>;
  csprojAddDllRefs: (
    csprojRel: string,
    dllPaths: string[],
    copyIntoProject: boolean
  ) => Promise<{ ok: boolean; added: number }>;
  csprojRemoveDllRef: (
    csprojRel: string,
    rawBlock: string
  ) => Promise<{ ok: boolean }>;
};

declare global {
  interface Window {
    encryptic: EncrypticApi;
  }
}
