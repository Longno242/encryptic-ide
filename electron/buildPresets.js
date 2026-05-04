const path = require("path");
const fs = require("fs/promises");
const { discoverDotnet, primaryDotnetTarget } = require("./dotnetDiscover");

/** Non-.NET presets (strict allowlist) */
const STATIC_PRESET_IDS = new Set([
  "cmake-configure",
  "cmake-build",
  "make-build",
  "cargo-build",
  "cargo-run",
  "go-build",
  "go-test",
  "npm-install",
  "npm-build",
  "npm-dev",
  "tsc",
  "python-main",
]);

/** Legacy .NET ids (no path suffix); resolved via discover + primary target */
const LEGACY_DOTNET_IDS = new Set([
  "dotnet-restore",
  "dotnet-build",
  "dotnet-run",
  "dotnet-test",
  "msbuild-sln",
]);

const DOTNET_WITH_PATH =
  /^(dotnet-restore|dotnet-build|dotnet-run|dotnet-test|msbuild-sln)@(.+)$/;

/**
 * @param {string} presetId
 * @param {string} projectRoot
 * @returns {Promise<{ program: string; args: string[]; shell: boolean }>}
 */
async function resolveDotnetPreset(presetId, projectRoot) {
  let rel = null;
  let cmd = /** @type {"restore"|"build"|"run"|"test"|null} */ (null);
  let msbuild = false;

  const m = presetId.match(DOTNET_WITH_PATH);
  if (m) {
    const kind = m[1];
    const enc = m[2];
    try {
      rel = decodeURIComponent(enc);
    } catch {
      throw new Error("Invalid build preset path.");
    }
    if (kind === "msbuild-sln") msbuild = true;
    else
      cmd = /** @type {"restore"|"build"|"run"|"test"} */ (
        kind.replace("dotnet-", "")
      );
  } else if (LEGACY_DOTNET_IDS.has(presetId)) {
    const d = await discoverDotnet(projectRoot);
    if (presetId === "msbuild-sln") {
      msbuild = true;
      const sln = d.slns[0];
      if (!sln) {
        throw new Error(
          "No .sln/.slnx file found for MSBuild (use .NET build on a .csproj instead)."
        );
      }
      rel = sln;
    } else {
      cmd = /** @type {"restore"|"build"|"run"|"test"} */ (
        presetId.replace("dotnet-", "")
      );
      const primary = primaryDotnetTarget(d);
      if (!primary) {
        throw new Error(
          "No .sln, .csproj, or .fsproj found under this folder (including subfolders)."
        );
      }
      rel = primary.path;
    }
  } else {
    throw new Error("Unknown .NET build preset.");
  }

  if (!rel) throw new Error("Missing project path for .NET build preset.");

  if (
    msbuild &&
    !rel.toLowerCase().endsWith(".sln") &&
    !rel.toLowerCase().endsWith(".slnx")
  ) {
    throw new Error("MSBuild preset requires a .sln or .slnx file.");
  }

  const targetAbs = path.join(projectRoot, rel.split("/").join(path.sep));
  try {
    await fs.access(targetAbs);
  } catch {
    throw new Error(`Build target not found: ${rel}`);
  }

  if (msbuild) {
    return {
      program: "msbuild",
      args: [targetAbs, "/m", "/p:Configuration=Release", "/clp:ErrorsOnly"],
      shell: false,
    };
  }

  /** No -f / TargetFramework: SDK builds every TFM in the project or solution. */
  const low = targetAbs.toLowerCase();
  const isSln = low.endsWith(".sln") || low.endsWith(".slnx");
  const runArgs = isSln
    ? ["run", "-c", "Release", targetAbs]
    : ["run", "-c", "Release", "--project", targetAbs];

  const argsByCmd = {
    restore: ["restore", targetAbs, "-v", "quiet"],
    build: [
      "build",
      targetAbs,
      "-c",
      "Release",
      "-v",
      "minimal",
      "-clp:ErrorsOnly",
    ],
    run: runArgs,
    test: [
      "test",
      targetAbs,
      "-c",
      "Release",
      "-v",
      "minimal",
      "-clp:ErrorsOnly",
    ],
  };
  const tail = argsByCmd[cmd];
  if (!tail) throw new Error("Unknown dotnet command.");
  return { program: "dotnet", args: tail, shell: false };
}

function isDotnetPresetId(presetId) {
  return LEGACY_DOTNET_IDS.has(presetId) || DOTNET_WITH_PATH.test(presetId);
}

/**
 * @param {string} presetId
 * @param {string} projectRoot
 * @returns {Promise<{ program: string; args: string[]; shell: boolean }>}
 */
async function resolveBuildPreset(presetId, projectRoot) {
  const id = String(presetId);
  if (isDotnetPresetId(id)) {
    return resolveDotnetPreset(id, projectRoot);
  }
  if (!STATIC_PRESET_IDS.has(id)) {
    throw new Error("Unknown build preset.");
  }

  const winShell = process.platform === "win32";

  switch (id) {
    case "cmake-configure":
      return {
        program: "cmake",
        args: ["-B", "build", "-DCMAKE_BUILD_TYPE=Release"],
        shell: false,
      };
    case "cmake-build":
      return {
        program: "cmake",
        args: ["--build", "build", "--config", "Release"],
        shell: false,
      };
    case "make-build":
      return {
        program: "make",
        args: [],
        shell: process.platform === "win32",
      };
    case "cargo-build":
      return {
        program: "cargo",
        args: ["build", "--release"],
        shell: false,
      };
    case "cargo-run":
      return {
        program: "cargo",
        args: ["run", "--release"],
        shell: false,
      };
    case "go-build":
      return { program: "go", args: ["build", "./..."], shell: false };
    case "go-test":
      return { program: "go", args: ["test", "./..."], shell: false };
    case "npm-install":
      return { program: "npm", args: ["install"], shell: winShell };
    case "npm-build":
      return { program: "npm", args: ["run", "build"], shell: winShell };
    case "npm-dev":
      return { program: "npm", args: ["run", "dev"], shell: winShell };
    case "tsc":
      return {
        program: "npx",
        args: ["--yes", "tsc", "-p", "."],
        shell: winShell,
      };
    case "python-main":
      return { program: "python", args: ["main.py"], shell: false };
    default:
      throw new Error("Unhandled preset.");
  }
}

/** @deprecated use isDotnetPresetId + STATIC_PRESET_IDS */
const PRESET_IDS = new Set([...STATIC_PRESET_IDS, ...LEGACY_DOTNET_IDS]);

module.exports = { resolveBuildPreset, PRESET_IDS, isDotnetPresetId };
