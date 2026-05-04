const path = require("path");
const fs = require("fs/promises");
const { spawn } = require("child_process");

const SKIP_DIR = new Set([
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
  "coverage",
  ".idea",
  "build",
  "out",
]);

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|cs|fs|vb|cpp|c|h|hpp|hxx|cc|py|rs|go|java|kt|toml|yaml|yml|xml|txt|sql|sh|ps1|psm1|csproj|sln|props|targets)$/i;

/**
 * @param {string} root
 * @param {number} max
 * @returns {Promise<string[]>}
 */
async function listFilesFlat(root, max = 12000) {
  const rootResolved = path.resolve(root);
  const out = [];

  async function walk(rel) {
    if (out.length >= max) return;
    const full = rel
      ? path.join(rootResolved, ...rel.split("/"))
      : rootResolved;
    if (!full.startsWith(rootResolved)) return;
    let entries;
    try {
      entries = await fs.readdir(full, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (out.length >= max) return;
      if (SKIP_DIR.has(ent.name)) continue;
      const nextRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(nextRel);
      else out.push(nextRel.replace(/\\/g, "/"));
    }
  }

  await walk("");
  return out;
}

/**
 * @param {string} root
 * @param {string} query
 * @param {number} max
 */
async function searchFallback(root, query, max) {
  const rootResolved = path.resolve(root);
  const q = query.toLowerCase();
  const files = await listFilesFlat(root, 3500);
  /** @type {{ path: string; line: number; preview: string }[]} */
  const hits = [];
  for (const rel of files) {
    if (hits.length >= max) break;
    if (!TEXT_EXT.test(rel)) continue;
    const full = path.join(rootResolved, ...rel.split("/"));
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      continue;
    }
    if (st.size > 150_000) continue;
    let text;
    try {
      text = await fs.readFile(full, "utf8");
    } catch {
      continue;
    }
    const lower = text.toLowerCase();
    let pos = 0;
    while (hits.length < max) {
      const idx = lower.indexOf(q, pos);
      if (idx === -1) break;
      const lineNum = text.slice(0, idx).split("\n").length;
      const lineText = (text.split("\n")[lineNum - 1] || "").trim().slice(0, 240);
      hits.push({ path: rel, line: lineNum, preview: lineText });
      pos = idx + Math.max(1, query.length);
    }
  }
  return hits;
}

/**
 * @param {string} root
 * @param {string} query
 * @param {number} max
 */
function searchWithRgJson(root, query, max) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "rg",
      [
        "--json",
        "-S",
        "--max-count",
        String(max),
        "--glob",
        "!**/node_modules/**",
        "--glob",
        "!.git/**",
        "--glob",
        "!**/dist/**",
        "--glob",
        "!**/release/**",
        query,
        ".",
      ],
      { cwd: root, windowsHide: true }
    );
    /** @type {{ path: string; line: number; preview: string }[]} */
    const hits = [];
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (j.type === "match" && j.data) {
            const p = j.data.path?.text || j.data.path?.path || "";
            const ln = j.data.line_number || 1;
            const preview = (j.data.lines?.text || "").replace(/\r$/, "").trim().slice(0, 240);
            if (p) {
              const rel = p.split(path.sep).join("/");
              hits.push({ path: rel, line: ln, preview });
            }
            if (hits.length >= max) {
              try {
                child.kill("SIGTERM");
              } catch (_) {}
            }
          }
        } catch {
          /* skip bad json line */
        }
      }
    });
    child.on("error", () => reject(new Error("ENOENT")));
    child.on("close", () => {
      const rest = buf.trim();
      if (rest) {
        for (const line of rest.split("\n")) {
          if (!line.trim() || hits.length >= max) continue;
          try {
            const j = JSON.parse(line);
            if (j.type === "match" && j.data) {
              const p = j.data.path?.text || "";
              const ln = j.data.line_number || 1;
              const preview = (j.data.lines?.text || "")
                .replace(/\r$/, "")
                .trim()
                .slice(0, 240);
              if (p)
                hits.push({
                  path: p.split(path.sep).join("/"),
                  line: ln,
                  preview,
                });
            }
          } catch {
            /* ignore */
          }
        }
      }
      resolve(hits);
    });
  });
}

function safeSearchQuery(q) {
  const s = String(q || "")
    .trim()
    .slice(0, 120);
  if (!s) throw new Error("Enter text to search for.");
  if (/[\r\n\x00]/.test(s)) throw new Error("Invalid query.");
  return s;
}

/**
 * @param {string} root
 * @param {string} query
 * @param {number} maxResults
 */
async function searchProject(root, query, maxResults) {
  const q = safeSearchQuery(query);
  try {
    return await searchWithRgJson(root, q, maxResults);
  } catch {
    return searchFallback(root, q, maxResults);
  }
}

/**
 * @param {string} root
 */
function gitSummary(root) {
  return new Promise((resolve) => {
    const chunks = [];
    const git = spawn(
      "git",
      ["-c", "safe.directory=*", "status", "--porcelain", "-b"],
      { cwd: root, windowsHide: true }
    );
    git.stdout.on("data", (d) => chunks.push(d));
    git.stderr.on("data", () => {});
    git.on("error", () =>
      resolve({ ok: false, branch: null, dirty: 0, message: "Git not available" })
    );
    git.on("close", (code) => {
      const out = Buffer.concat(chunks).toString("utf8");
      const first = out.split("\n")[0] || "";
      const m = first.match(/^## (\S+)/);
      const branch = m ? m[1].split("...")[0] || m[1] : null;
      const dirty = out
        .split("\n")
        .filter((l) => l && !l.startsWith("##")).length;
      if (code !== 0 || !first.startsWith("##")) {
        resolve({
          ok: false,
          branch: null,
          dirty: 0,
          message: "Not a git repository",
        });
        return;
      }
      resolve({ ok: true, branch: branch || "main", dirty });
    });
  });
}

module.exports = {
  listFilesFlat,
  searchProject,
  gitSummary,
  safeSearchQuery,
};
