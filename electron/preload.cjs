const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("encryptic", {
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  pickParentFolder: () => ipcRenderer.invoke("dialog:pickParentFolder"),
  openProjectPath: (folderPath) => ipcRenderer.invoke("project:openPath", folderPath),
  closeProject: () => ipcRenderer.invoke("project:close"),
  createProject: (payload) => ipcRenderer.invoke("project:create", payload),
  listTemplates: () => ipcRenderer.invoke("project:listTemplates"),
  listFilesFlat: () => ipcRenderer.invoke("project:listFilesFlat"),
  searchInProject: (query, maxResults) =>
    ipcRenderer.invoke("project:search", { query, maxResults }),
  gitSummary: () => ipcRenderer.invoke("git:summary"),
  pathExists: (absPath) => ipcRenderer.invoke("fs:pathExists", absPath),
  getRoot: () => ipcRenderer.invoke("project:getRoot"),
  readFile: (relPath) => ipcRenderer.invoke("fs:readFile", relPath),
  writeFile: (relPath, contents) =>
    ipcRenderer.invoke("fs:writeFile", { relPath, contents }),
  listTree: () => ipcRenderer.invoke("fs:listTree"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (data) => ipcRenderer.invoke("settings:save", data),
  pickWallpaperImage: () => ipcRenderer.invoke("dialog:pickWallpaperImage"),
  pathToFileUrl: (absPath) => ipcRenderer.invoke("app:pathToFileUrl", absPath),
  discordRpcVerify: () => ipcRenderer.invoke("discordRpc:verify"),
  aiStart: (payload) => ipcRenderer.send("ai:start", payload),
  shellRunLine: (line) => ipcRenderer.invoke("shell:runLine", { line }),
  shellAbort: () => ipcRenderer.invoke("shell:abort"),
  onShellData: (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on("shell:data", fn);
    return () => ipcRenderer.removeListener("shell:data", fn);
  },
  onShellDone: (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on("shell:done", fn);
    return () => ipcRenderer.removeListener("shell:done", fn);
  },
  nugetSearch: (query) => ipcRenderer.invoke("nuget:search", { query }),
  nugetListCsproj: () => ipcRenderer.invoke("nuget:listCsproj"),
  nugetListInstalled: (csprojRel) =>
    ipcRenderer.invoke("nuget:listInstalled", { csprojRel }),
  nugetAddPackage: (csprojRel, packageId, version) =>
    ipcRenderer.invoke("nuget:add", { csprojRel, packageId, version }),
  pickDllFiles: () => ipcRenderer.invoke("dialog:pickDlls"),
  pickDllFolder: () => ipcRenderer.invoke("dialog:pickDllFolder"),
  listDllsInFolder: (absPath, recurse) =>
    ipcRenderer.invoke("refs:listDllsInFolder", { absPath, recurse }),
  csprojListDllRefs: (csprojRel) =>
    ipcRenderer.invoke("csproj:listDllRefs", { csprojRel }),
  csprojAddDllRefs: (csprojRel, dllPaths, copyIntoProject) =>
    ipcRenderer.invoke("csproj:addDllRefs", {
      csprojRel,
      dllPaths,
      copyIntoProject,
    }),
  csprojRemoveDllRef: (csprojRel, rawBlock) =>
    ipcRenderer.invoke("csproj:removeDllRef", { csprojRel, rawBlock }),
  onAiToken: (cb) => {
    const fn = (_e, text) => cb(text);
    ipcRenderer.on("ai:token", fn);
    return () => ipcRenderer.removeListener("ai:token", fn);
  },
  onAiDone: (cb) => {
    const fn = (_e, data) => cb(data);
    ipcRenderer.on("ai:done", fn);
    return () => ipcRenderer.removeListener("ai:done", fn);
  },
  onAiError: (cb) => {
    const fn = (_e, message) => cb(message);
    ipcRenderer.on("ai:error", fn);
    return () => ipcRenderer.removeListener("ai:error", fn);
  },
  onMenuOpenFolder: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("menu:openFolder", fn);
    return () => ipcRenderer.removeListener("menu:openFolder", fn);
  },
  onMenuHome: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("menu:home", fn);
    return () => ipcRenderer.removeListener("menu:home", fn);
  },
  onMenuPreferences: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("menu:preferences", fn);
    return () => ipcRenderer.removeListener("menu:preferences", fn);
  },
  analyzeProject: () => ipcRenderer.invoke("project:analyze"),
  buildStart: (presetId) => ipcRenderer.invoke("build:start", { presetId }),
  buildStop: () => ipcRenderer.invoke("build:stop"),
  onBuildData: (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on("build:data", fn);
    return () => ipcRenderer.removeListener("build:data", fn);
  },
  onBuildDone: (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on("build:done", fn);
    return () => ipcRenderer.removeListener("build:done", fn);
  },
  onMenuBuildStop: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("menu:buildStop", fn);
    return () => ipcRenderer.removeListener("menu:buildStop", fn);
  },
});
