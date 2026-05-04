const path = require("path");
const fs = require("fs/promises");

/** @type {Set<string>} */
const PRESET_IDS = new Set([
  "dotnet-restore",
  "dotnet-build",
  "dotnet-run",
  "dotnet-test",
  "msbuild-sln",
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

/**
 * @param {string} presetId
 * @param {string} projectRoot
 * @returns {Promise<{ program: string; args: string[]; shell: boolean }>}
 */
async function resolveBuildPreset(presetId, projectRoot) {
  if (!PRESET_IDS.has(presetId)) {
    throw new Error("Unknown build preset.");
  }

  const winShell = process.platform === "win32";

  switch (presetId) {
    case "dotnet-restore":
      return { program: "dotnet", args: ["restore"], shell: false };
    case "dotnet-build":
      return {
        program: "dotnet",
        args: ["build", "-c", "Release", "-v", "m"],
        shell: false,
      };
    case "dotnet-run":
      return {
        program: "dotnet",
        args: ["run", "-c", "Release"],
        shell: false,
      };
    case "dotnet-test":
      return {
        program: "dotnet",
        args: ["test", "-c", "Release", "-v", "m"],
        shell: false,
      };
    case "msbuild-sln": {
      const names = await fs.readdir(projectRoot);
      const sln = names.find((n) => n.endsWith(".sln"));
      if (!sln) throw new Error("No .sln file in project root.");
      const slnPath = path.join(projectRoot, sln);
      return {
        program: "msbuild",
        args: [slnPath, "/m", "/p:Configuration=Release"],
        shell: false,
      };
    }
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

module.exports = { resolveBuildPreset, PRESET_IDS };
