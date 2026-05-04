const path = require("path");
const fs = require("fs/promises");
const https = require("https");
const { spawn } = require("child_process");

const SKIP = new Set([
  "node_modules",
  ".git",
  "bin",
  "obj",
  "dist",
  "release",
  "Library",
  "Temp",
  "Packages",
]);

/**
 * @param {string} url
 * @returns {Promise<unknown>}
 */
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { "User-Agent": "Encryptic-IDE/1.0 (NuGet search)" },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

/**
 * @param {string} query
 */
async function nugetSearch(query) {
  const q = String(query || "")
    .trim()
    .slice(0, 120);
  if (!q) return [];
  const url = `https://azuresearch-usnc.nuget.org/query?q=${encodeURIComponent(q)}&take=30&prerelease=false`;
  const j = await httpGetJson(url);
  const data = Array.isArray(j.data) ? j.data : [];
  return data.map((x) => ({
    id: x.id,
    version: x.version,
    description: String(x.description || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 320),
  }));
}

/**
 * @param {string} root
 * @param {number} maxDepth
 * @param {number} maxFiles
 */
async function findCsprojFiles(root, maxDepth = 6, maxFiles = 40) {
  const rootResolved = path.resolve(root);
  /** @type {string[]} */
  const out = [];

  async function walk(rel, depth) {
    if (out.length >= maxFiles || depth > maxDepth) return;
    const dir = rel
      ? path.join(rootResolved, ...rel.split("/"))
      : rootResolved;
    if (!dir.startsWith(rootResolved)) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (out.length >= maxFiles) return;
      if (SKIP.has(ent.name)) continue;
      const nextRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(nextRel, depth + 1);
      else if (ent.name.toLowerCase().endsWith(".csproj"))
        out.push(nextRel.replace(/\\/g, "/"));
    }
  }

  await walk("", 0);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * @param {string} root
 * @param {string} csprojRel
 */
function dotnetListPackages(root, csprojRel) {
  const readLegacyPackagesConfig = async () => {
    const proj = path.join(root, ...csprojRel.split("/"));
    const pkgConfig = path.join(path.dirname(proj), "packages.config");
    let raw = "";
    try {
      raw = await fs.readFile(pkgConfig, "utf8");
    } catch {
      return null;
    }
    /** @type {{ id: string; version: string; requested?: string }[]} */
    const list = [];
    const rx = /<package\b[^>]*\bid=(["'])([^"']+)\1[^>]*\bversion=(["'])([^"']+)\3[^>]*>/gi;
    let m;
    while ((m = rx.exec(raw))) {
      list.push({ id: m[2], version: m[4], requested: m[4] });
    }
    list.sort((a, b) => a.id.localeCompare(b.id));
    return list;
  };

  return new Promise((resolve, reject) => {
    const proj = path.join(root, ...csprojRel.split("/"));
    const c = spawn(
      "dotnet",
      ["list", proj, "package", "--format", "json"],
      { cwd: root, windowsHide: true }
    );
    let out = "";
    let err = "";
    c.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    c.stderr.on("data", (d) => {
      err += d.toString("utf8");
    });
    c.on("error", () =>
      reject(new Error("dotnet not found on PATH. Install the .NET SDK."))
    );
    c.on("close", async (code) => {
      if (code !== 0) {
        const merged = `${out}\n${err}`.toLowerCase();
        if (merged.includes("package.config") || merged.includes("packages.config")) {
          const legacy = await readLegacyPackagesConfig();
          if (legacy) {
            resolve(legacy);
            return;
          }
        }
        reject(new Error(err.trim() || out.trim() || `dotnet exited ${code}`));
        return;
      }
      try {
        const j = JSON.parse(out);
        /** @type {{ id: string; version: string; requested?: string }[]} */
        const list = [];
        const projects = j.projects || [];
        for (const p of projects) {
          const fws = p.frameworks || {};
          for (const fw of Object.values(fws)) {
            const top = fw.topLevelPackages || [];
            for (const pkg of top) {
              list.push({
                id: pkg.id,
                version: pkg.resolvedVersion || pkg.requestedVersion || "",
                requested: pkg.requestedVersion,
              });
            }
          }
        }
        const seen = new Set();
        const dedup = [];
        for (const row of list) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          dedup.push(row);
        }
        dedup.sort((a, b) => a.id.localeCompare(b.id));
        resolve(dedup);
      } catch (e) {
        reject(new Error(`Could not parse dotnet list output: ${e.message}`));
      }
    });
  });
}

/**
 * @param {string} root
 * @param {string} csprojRel
 * @param {string} packageId
 * @param {string} [version]
 */
function dotnetAddPackage(root, csprojRel, packageId, version) {
  const proj = path.join(root, ...csprojRel.split("/"));
  const pkgConfigPath = path.join(path.dirname(proj), "packages.config");
  return new Promise((resolve, reject) => {
    const id = String(packageId || "").trim();
    if (!id) return reject(new Error("Missing package id."));
    fs
      .access(pkgConfigPath)
      .then(() => {
        reject(
          new Error(
            "This project uses packages.config (legacy NuGet format). Auto-add works only with PackageReference projects."
          )
        );
      })
      .catch(() => {
        const args = ["add", proj, "package", id];
        if (version && String(version).trim())
          args.push("--version", String(version).trim());
        const c = spawn("dotnet", args, { cwd: root, windowsHide: true });
        let out = "";
        let err = "";
        c.stdout.on("data", (d) => {
          out += d.toString("utf8");
        });
        c.stderr.on("data", (d) => {
          err += d.toString("utf8");
        });
        c.on("error", () =>
          reject(new Error("dotnet not found on PATH. Install the .NET SDK."))
        );
        c.on("close", (code) => {
          const log = (out + err).trim();
          if (code === 0) resolve({ ok: true, log });
          else reject(new Error(log || `dotnet add failed (${code})`));
        });
      });
  });
}

module.exports = {
  nugetSearch,
  findCsprojFiles,
  dotnetListPackages,
  dotnetAddPackage,
};
