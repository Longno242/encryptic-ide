require("./instrument");
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
} = require("electron");
const { setupAutoUpdater, checkForUpdatesInteractive } = require("./updater");
const path = require("path");
const fsSync = require("fs");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const {
  getTemplateFiles,
  TEMPLATE_CATALOG,
} = require("./projectTemplates");
const { analyzeProjectRoot } = require("./projectAnalyze");
const { resolveBuildPreset } = require("./buildPresets");
const {
  listFilesFlat,
  searchProject,
  gitSummary,
} = require("./workspaceExtras");
const {
  nugetSearch,
  findCsprojFiles,
  dotnetListPackages,
  dotnetAddPackage,
} = require("./nugetIpc");
const {
  listDllReferences,
  addDllReferences,
  removeDllReference,
  listDllPathsInDirectory,
} = require("./csprojRefsIpc");
const discordRpc = require("./discordRpc");
const { pathToFileURL } = require("url");

/** @type {Map<number, string>} */
const windowRoots = new Map();

function getPresenceProjectPath() {
  const wins = BrowserWindow.getAllWindows();
  const focused = wins.find((w) => !w.isDestroyed() && w.isFocused());
  const ordered = focused
    ? [focused, ...wins.filter((w) => w !== focused)]
    : [...wins];
  for (const w of ordered) {
    const r = windowRoots.get(w.id);
    if (r) return r;
  }
  return null;
}

discordRpc.setProjectResolver(getPresenceProjectPath);

/** @type {Map<number, import('child_process').ChildProcess | null>} */
const activeBuilds = new Map();

/** @type {Map<number, import('child_process').ChildProcess | null>} */
const activeShellLine = new Map();

function sendToWindow(win, channel, payload) {
  if (!win || win.isDestroyed()) return false;
  const wc = win.webContents;
  if (!wc || wc.isDestroyed()) return false;
  try {
    wc.send(channel, payload);
    return true;
  } catch (_) {
    return false;
  }
}

function killShellForWindow(win) {
  const c = activeShellLine.get(win.id);
  if (c) {
    try {
      c.kill("SIGTERM");
    } catch (_) {}
    activeShellLine.delete(win.id);
  }
}

function killAuxForWindow(win) {
  if (!win) return;
  const b = activeBuilds.get(win.id);
  if (b) {
    try {
      b.kill("SIGTERM");
    } catch (_) {}
    activeBuilds.set(win.id, null);
  }
  killShellForWindow(win);
}

function getRootForWindow(win) {
  if (!win) return null;
  return windowRoots.get(win.id) ?? null;
}

function safeJoin(root, rel) {
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = path.resolve(root, normalized);
  if (!full.startsWith(path.resolve(root))) {
    throw new Error("Path escapes project root");
  }
  return full;
}

async function listTreeRecursive(root, rel = "", maxDepth = 8, depth = 0) {
  if (depth > maxDepth) return [];
  const dir = rel ? safeJoin(root, rel) : root;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "release",
    ".next",
    "target",
    "__pycache__",
    "bin",
    "obj",
    ".vs",
  ]);
  const nodes = [];
  entries.sort((a, b) => {
    if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
    return a.isDirectory() ? -1 : 1;
  });
  for (const ent of entries) {
    if (skip.has(ent.name)) continue;
    const childRel = rel ? path.join(rel, ent.name) : ent.name;
    if (ent.isDirectory()) {
      nodes.push({
        name: ent.name,
        path: childRel.replace(/\\/g, "/"),
        kind: "dir",
        children: await listTreeRecursive(root, childRel, maxDepth, depth + 1),
      });
    } else {
      nodes.push({
        name: ent.name,
        path: childRel.replace(/\\/g, "/"),
        kind: "file",
      });
    }
  }
  return nodes;
}

async function readSettingsFile() {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeSettingsMerged(partial) {
  const cur = await readSettingsFile();
  const next = { ...cur, ...partial };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), "utf8");
}

async function pushRecentProject(projectPath) {
  const cur = await readSettingsFile();
  const recent = Array.isArray(cur.recentProjects) ? cur.recentProjects : [];
  const next = [projectPath, ...recent.filter((p) => p !== projectPath)].slice(
    0,
    12
  );
  await writeSettingsMerged({ recentProjects: next });
}

function setProjectRoot(win, folderPath) {
  if (!win) return;
  windowRoots.set(win.id, folderPath);
  void pushRecentProject(folderPath);
  void discordRpc.bumpPresence();
}

function resolveWindowIcon() {
  const packaged = path.join(process.resourcesPath, "build", "icon.png");
  const dev = path.join(__dirname, "..", "build", "icon.png");
  const p = app.isPackaged ? packaged : dev;
  return fsSync.existsSync(p) ? p : undefined;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#05050c",
    title: "Encryptic IDE",
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.on("closed", () => {
    killAuxForWindow(win);
    windowRoots.delete(win.id);
  });

  return win;
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Project hub…",
          accelerator: "CmdOrCtrl+Shift+H",
          click: (_, win) => {
            const w = win ?? BrowserWindow.getFocusedWindow();
            if (w) w.webContents.send("menu:home");
          },
        },
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+O",
          click: (_, win) => {
            const w = win ?? BrowserWindow.getFocusedWindow();
            if (w) w.webContents.send("menu:openFolder");
          },
        },
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: (_, win) => {
            const w = win ?? BrowserWindow.getFocusedWindow();
            if (w) w.webContents.send("menu:preferences");
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Build",
      submenu: [
        {
          label: "Stop build",
          accelerator: "CmdOrCtrl+Shift+C",
          click: (_, win) => {
            const w = win ?? BrowserWindow.getFocusedWindow();
            if (w) w.webContents.send("menu:buildStop");
          },
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
    {
      label: "Help",
      submenu: [
        ...(app.isPackaged
          ? [
              {
                label: "Check for updates…",
                click: () => void checkForUpdatesInteractive(),
              },
              { type: "separator" },
            ]
          : []),
        {
          label: "Cursor SDK docs",
          click: () =>
            shell.openExternal("https://cursor.com/docs/api/sdk/typescript"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function settingsPath() {
  return path.join(app.getPath("userData"), "encryptic-settings.json");
}

app.whenReady().then(async () => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.encryptic.ide");
  }
  buildMenu();
  createWindow();
  try {
    const s = await readSettingsFile();
    await discordRpc.syncFromSettings(s);
  } catch (_) {}
  setupAutoUpdater();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  void discordRpc.shutdown();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("dialog:openFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (canceled || !filePaths[0]) return null;
  setProjectRoot(win, filePaths[0]);
  return filePaths[0];
});

ipcMain.handle("dialog:pickParentFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Choose parent folder for the new project",
  });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle("project:openPath", async (event, folderPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const resolved = path.resolve(String(folderPath || ""));
  const st = await fs.stat(resolved).catch(() => null);
  if (!st?.isDirectory()) throw new Error("That path is not a folder.");
  setProjectRoot(win, resolved);
  return resolved;
});

ipcMain.handle("project:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    killAuxForWindow(win);
    windowRoots.delete(win.id);
  }
  void discordRpc.bumpPresence();
  return true;
});

ipcMain.handle("project:listTemplates", () => TEMPLATE_CATALOG);

ipcMain.handle(
  "project:create",
  async (event, { parentPath, projectName, templateId }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const rawName = String(projectName || "").trim() || "NewProject";
    const safeFolder = rawName.replace(/[<>:"/\\|?*]/g, "_").slice(0, 80) || "NewProject";
    const parent = path.resolve(String(parentPath || ""));
    const pst = await fs.stat(parent).catch(() => null);
    if (!pst?.isDirectory()) throw new Error("Parent folder is not valid.");
    const projectPath = path.join(parent, safeFolder);
    const exists = await fs.stat(projectPath).catch(() => null);
    if (exists) throw new Error(`A folder named "${safeFolder}" already exists.`);

    const files = getTemplateFiles(String(templateId), safeFolder);
    if (!files) throw new Error("Unknown project template.");

    await fs.mkdir(projectPath, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(projectPath, ...rel.split("/"));
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf8");
    }
    setProjectRoot(win, projectPath);
    return projectPath;
  }
);

ipcMain.handle("project:getRoot", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return getRootForWindow(win);
});

ipcMain.handle("fs:readFile", async (event, relPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) throw new Error("No folder opened");
  const full = safeJoin(root, relPath);
  return fs.readFile(full, "utf8");
});

ipcMain.handle("fs:writeFile", async (event, { relPath, contents }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) throw new Error("No folder opened");
  const full = safeJoin(root, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, contents, "utf8");
  return true;
});

ipcMain.handle("fs:listTree", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) return [];
  return listTreeRecursive(root);
});

ipcMain.handle("fs:pathExists", async (_event, absPath) => {
  const resolved = path.resolve(String(absPath || ""));
  const st = await fs.stat(resolved).catch(() => null);
  return !!st;
});

ipcMain.handle("project:analyze", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) {
    return { stacks: [], summary: "No project folder open", presets: [] };
  }
  return analyzeProjectRoot(root);
});

ipcMain.handle("build:start", async (event, { presetId }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) throw new Error("Open a project first.");
  const prev = activeBuilds.get(win.id);
  if (prev) {
    try {
      prev.kill("SIGTERM");
    } catch (_) {}
    activeBuilds.set(win.id, null);
  }
  const { program, args, shell } = await resolveBuildPreset(
    String(presetId),
    root
  );
  const child = spawn(program, args, {
    cwd: root,
    shell: shell === true,
    windowsHide: true,
    env: process.env,
  });
  activeBuilds.set(win.id, child);
  const sendData = (stream, text) => {
    sendToWindow(win, "build:data", { stream, text });
  };
  child.stdout?.on("data", (buf) => {
    sendData("stdout", buf.toString());
  });
  child.stderr?.on("data", (buf) => {
    sendData("stderr", buf.toString());
  });
  child.on("error", (err) => {
    sendData("stderr", String(err.message || err) + "\n");
    sendToWindow(win, "build:done", { code: 1, signal: null });
    if (activeBuilds.get(win.id) === child) activeBuilds.set(win.id, null);
  });
  child.on("close", (code, signal) => {
    sendToWindow(win, "build:done", {
      code: code ?? 0,
      signal: signal || null,
    });
    if (activeBuilds.get(win.id) === child) activeBuilds.set(win.id, null);
  });
  return { started: true };
});

ipcMain.handle("build:stop", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const c = activeBuilds.get(win.id);
  if (c) {
    try {
      c.kill("SIGTERM");
    } catch (_) {}
    setTimeout(() => {
      try {
        if (c && !c.killed) c.kill("SIGKILL");
      } catch (_) {}
    }, 3500);
    activeBuilds.set(win.id, null);
  }
  return true;
});

ipcMain.handle("settings:load", () => readSettingsFile());

ipcMain.handle("settings:save", async (_event, data) => {
  await writeSettingsMerged(data && typeof data === "object" ? data : {});
  try {
    const s = await readSettingsFile();
    await discordRpc.syncFromSettings(s);
  } catch (_) {}
  return true;
});

ipcMain.handle("discordRpc:verify", async () => {
  try {
    const s = await readSettingsFile();
    if (!s.discordRpcEnabled) return { ok: true, skipped: true };
    return await discordRpc.verifyOrExplain();
  } catch (_) {
    return {
      ok: false,
      message:
        "Could not connect to Discord. Make sure the Discord desktop app is running and you are logged in.",
    };
  }
});

ipcMain.handle("dialog:pickWallpaperImage", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Choose background image",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
      },
    ],
  });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle("app:pathToFileUrl", async (_event, absPath) => {
  const p = String(absPath || "").trim();
  if (!p) return "";
  const st = await fs.stat(p).catch(() => null);
  if (!st?.isFile()) return "";
  return pathToFileURL(p).href;
});

ipcMain.handle("project:listFilesFlat", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) return [];
  return listFilesFlat(root);
});

ipcMain.handle("project:search", async (event, { query, maxResults }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) return [];
  const cap = Math.min(400, Math.max(8, Number(maxResults) || 120));
  return searchProject(root, query, cap);
});

ipcMain.handle("git:summary", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) return { ok: false, branch: null, dirty: 0 };
  return gitSummary(root);
});

ipcMain.handle("shell:runLine", async (event, { line }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) throw new Error("Open a project first.");
  let cmd = String(line || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  if (!cmd) throw new Error("Empty command.");
  if (cmd.length > 4000) cmd = cmd.slice(0, 4000);
  killShellForWindow(win);
  const child = spawn(cmd, [], {
    cwd: root,
    shell: true,
    windowsHide: true,
    env: process.env,
  });
  activeShellLine.set(win.id, child);
  const send = (stream, text) => {
    sendToWindow(win, "shell:data", { stream, text });
  };
  child.stdout?.on("data", (d) => {
    send("stdout", d.toString("utf8"));
  });
  child.stderr?.on("data", (d) => {
    send("stderr", d.toString("utf8"));
  });
  child.on("error", (err) => {
    send("stderr", String(err.message || err) + "\n");
    sendToWindow(win, "shell:done", { code: 1 });
    if (activeShellLine.get(win.id) === child) activeShellLine.delete(win.id);
  });
  child.on("close", (code) => {
    sendToWindow(win, "shell:done", { code: code ?? 0 });
    if (activeShellLine.get(win.id) === child) activeShellLine.delete(win.id);
  });
  return { started: true };
});

ipcMain.handle("shell:abort", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  killShellForWindow(win);
  return true;
});

ipcMain.handle("nuget:search", async (_event, { query }) => {
  return nugetSearch(query);
});

ipcMain.handle("nuget:listCsproj", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) return [];
  return findCsprojFiles(root);
});

ipcMain.handle("nuget:listInstalled", async (event, { csprojRel }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) return [];
  const rel = String(csprojRel || "").replace(/\\/g, "/");
  if (!rel.endsWith(".csproj")) throw new Error("Select a .csproj file.");
  return dotnetListPackages(root, rel);
});

ipcMain.handle("nuget:add", async (event, { csprojRel, packageId, version }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) throw new Error("No project open.");
  const rel = String(csprojRel || "").replace(/\\/g, "/");
  if (!rel.endsWith(".csproj")) throw new Error("Select a .csproj file.");
  return dotnetAddPackage(root, rel, packageId, version);
});

ipcMain.handle("dialog:pickDlls", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Select DLL assemblies",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Assemblies", extensions: ["dll"] }],
  });
  if (canceled || !filePaths?.length) return [];
  return filePaths;
});

ipcMain.handle("dialog:pickDllFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Folder containing DLLs (e.g. game Managed)",
    properties: ["openDirectory"],
  });
  if (canceled || !filePaths[0]) return null;
  return filePaths[0];
});

ipcMain.handle("refs:listDllsInFolder", async (_event, { absPath, recurse }) => {
  return listDllPathsInDirectory(String(absPath || ""), {
    recurse: Boolean(recurse),
    max: 400,
  });
});

ipcMain.handle("csproj:listDllRefs", async (event, { csprojRel }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) return [];
  return listDllReferences(root, csprojRel);
});

ipcMain.handle("csproj:addDllRefs", async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) throw new Error("No project open.");
  const csprojRel = String(payload?.csprojRel || "").replace(/\\/g, "/");
  const dllPaths = Array.isArray(payload?.dllPaths) ? payload.dllPaths : [];
  const copyIntoProject = Boolean(payload?.copyIntoProject);
  if (!dllPaths.length) throw new Error("No DLL files selected.");
  return addDllReferences(root, csprojRel, dllPaths, copyIntoProject);
});

ipcMain.handle("csproj:removeDllRef", async (event, { csprojRel, rawBlock }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) throw new Error("No project open.");
  return removeDllReference(root, csprojRel, rawBlock);
});

ipcMain.on("ai:start", async (event, { prompt, apiKey, modelId }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const root = getRootForWindow(win);
  if (!root) {
    win.webContents.send("ai:error", "Open a project folder first.");
    return;
  }
  const key = (apiKey || "").trim() || process.env.CURSOR_API_KEY;
  if (!key) {
    win.webContents.send("ai:error", "Set your Cursor API key in the AI panel.");
    return;
  }
  try {
    const { Agent, CursorAgentError } = await import("@cursor/sdk");
    const agent = Agent.create({
      apiKey: key,
      model: { id: modelId || "composer-2" },
      local: { cwd: root },
    });
    try {
      const run = await agent.send(prompt);
      if (typeof run.supports === "function" && run.supports("stream")) {
        try {
          for await (const ev of run.stream()) {
            if (ev.type === "assistant" && ev.message?.content) {
              for (const block of ev.message.content) {
                if (block.type === "text" && block.text) {
                  win.webContents.send("ai:token", block.text);
                }
              }
            }
          }
        } catch (streamErr) {
          win.webContents.send(
            "ai:error",
            `Stream ended: ${streamErr?.message || streamErr}`
          );
        }
      }
      const result = await run.wait();
      win.webContents.send("ai:done", {
        status: result.status,
        id: result.id,
      });
    } catch (err) {
      if (err instanceof CursorAgentError) {
        win.webContents.send("ai:error", err.message);
      } else {
        win.webContents.send("ai:error", String(err?.message || err));
      }
    } finally {
      try {
        await agent[Symbol.asyncDispose]();
      } catch (disposeErr) {
        win.webContents.send(
          "ai:error",
          String(disposeErr?.message || disposeErr)
        );
      }
    }
  } catch (err) {
    win.webContents.send(
      "ai:error",
      `Failed to load Cursor SDK: ${err?.message || err}`
    );
  }
});
