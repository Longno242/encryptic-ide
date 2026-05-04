const path = require("path");
const fs = require("fs/promises");

/** Skip heavy or irrelevant trees when scanning for .NET artifacts */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "bin",
  "obj",
  "packages",
  ".vs",
  ".nuget",
  "dist",
  "build",
  "Library",
  "Temp",
  "Logs",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  "coverage",
  ".turbo",
  ".next",
]);

/**
 * @param {string} projectRoot
 * @param {{ maxDepth?: number; maxCsproj?: number; maxSlns?: number }} [opts]
 * @returns {Promise<{ slns: string[]; csprojs: string[]; fsprojs: string[] }>}
 * Paths are relative to projectRoot with POSIX slashes.
 */
async function discoverDotnet(projectRoot, opts = {}) {
  const maxDepth = opts.maxDepth ?? 10;
  const maxCsproj = opts.maxCsproj ?? 60;
  const maxSlns = opts.maxSlns ?? 120;
  /** @type {{ slns: string[]; csprojs: string[]; fsprojs: string[] }} */
  const out = { slns: [], csprojs: [], fsprojs: [] };

  const sortRel = (a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  };

  const projFull = () => out.csprojs.length + out.fsprojs.length;

  /**
   * @param {string} absDir
   * @param {string} relPosix
   * @param {number} depth
   */
  async function walk(absDir, relPosix, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const name = ent.name;
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        if (name.startsWith(".")) continue;
        const subRel = relPosix ? `${relPosix}/${name}` : name;
        await walk(path.join(absDir, name), subRel, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      if (name.endsWith(".sln") || name.endsWith(".slnx")) {
        if (out.slns.length < maxSlns) {
          out.slns.push(relPosix ? `${relPosix}/${name}` : name);
        }
      } else if (name.endsWith(".csproj")) {
        if (projFull() < maxCsproj) {
          out.csprojs.push(relPosix ? `${relPosix}/${name}` : name);
        }
      } else if (name.endsWith(".fsproj")) {
        if (projFull() < maxCsproj) {
          out.fsprojs.push(relPosix ? `${relPosix}/${name}` : name);
        }
      }
    }
  }

  await walk(projectRoot, "", 0);
  out.slns.sort(sortRel);
  out.csprojs.sort(sortRel);
  out.fsprojs.sort(sortRel);
  return out;
}

/**
 * Prefer building a solution when present so all projects / TFMs in the tree are included.
 * @param {{ slns: string[]; csprojs: string[]; fsprojs: string[] }} d
 * @returns {{ kind: 'sln' | 'proj'; path: string } | null}
 */
function primaryDotnetTarget(d) {
  if (d.slns[0]) return { kind: "sln", path: d.slns[0] };
  const p = d.csprojs[0] || d.fsprojs[0];
  if (p) return { kind: "proj", path: p };
  return null;
}

module.exports = { discoverDotnet, primaryDotnetTarget, SKIP_DIRS };
