const path = require("path");
const fs = require("fs/promises");

/**
 * @param {string} openTag
 */
function parseIncludeAttribute(openTag) {
  const d = openTag.match(/\bInclude\s*=\s*"([^"]*)"/i);
  if (d) return d[1].trim();
  const s = openTag.match(/\bInclude\s*=\s*'([^']*)'/i);
  if (s) return s[1].trim();
  return "";
}

/**
 * @param {string} inner
 */
function parseHintPath(inner) {
  const m = inner.match(/<HintPath>([^<]*)<\/HintPath>/i);
  return m ? m[1].trim() : "";
}

/**
 * @param {string} openTag
 * @param {string} inner
 */
function isFileDllReference(openTag, inner) {
  const inc = parseIncludeAttribute(openTag);
  const hint = parseHintPath(inner);
  if (hint && /\.dll$/i.test(hint.replace(/\\/g, "/"))) return true;
  if (/\.dll$/i.test(inc.replace(/\\/g, "/"))) return true;
  return false;
}

/**
 * @param {string} text
 * @returns {{ openTag: string; inner: string; full: string; start: number; end: number }[]}
 */
function extractReferenceBlocks(text) {
  /** @type {{ openTag: string; inner: string; full: string; start: number; end: number }[]} */
  const out = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("<Reference", i);
    if (start === -1) break;
    const gt = text.indexOf(">", start);
    if (gt === -1) break;
    const openTag = text.slice(start, gt + 1);
    const selfClose =
      /\/\s*>$/.test(openTag.trim()) || openTag.trim().endsWith("/>");
    if (selfClose) {
      i = gt + 1;
      continue;
    }
    const close = text.indexOf("</Reference>", gt);
    if (close === -1) break;
    const inner = text.slice(gt + 1, close);
    const end = close + "</Reference>".length;
    const full = text.slice(start, end);
    out.push({ openTag, inner, full, start, end });
    i = end;
  }
  return out;
}

/**
 * @param {string} root
 * @param {string} csprojRel
 */
async function listDllReferences(root, csprojRel) {
  const rel = String(csprojRel || "").replace(/\\/g, "/");
  if (!rel.endsWith(".csproj")) throw new Error("Select a .csproj file.");
  const abs = path.join(root, ...rel.split("/"));
  const raw = await fs.readFile(abs, "utf8");
  const blocks = extractReferenceBlocks(raw);
  /** @type {{ include: string; hintPath: string; rawBlock: string }[]} */
  const list = [];
  for (const b of blocks) {
    if (!isFileDllReference(b.openTag, b.inner)) continue;
    const include = parseIncludeAttribute(b.openTag);
    const hintPath = parseHintPath(b.inner) || include;
    list.push({
      include,
      hintPath,
      rawBlock: b.full,
    });
  }
  return list;
}

/**
 * @param {string} root
 * @param {string} csprojRel
 * @param {string[]} dllAbsPaths
 * @param {boolean} copyIntoProject
 */
async function addDllReferences(root, csprojRel, dllAbsPaths, copyIntoProject) {
  const rel = String(csprojRel || "").replace(/\\/g, "/");
  if (!rel.endsWith(".csproj")) throw new Error("Select a .csproj file.");
  const csprojAbs = path.join(root, ...rel.split("/"));
  const csprojDir = path.dirname(csprojAbs);
  const raw = await fs.readFile(csprojAbs, "utf8");

  /** @type {string[]} */
  const inserts = [];

  for (const dllAbs of dllAbsPaths) {
    const src = path.resolve(String(dllAbs || ""));
    const st = await fs.stat(src).catch(() => null);
    if (!st?.isFile() || !src.toLowerCase().endsWith(".dll")) {
      throw new Error(`Not a DLL file: ${dllAbs}`);
    }
    const base = path.basename(src);

    let hintRel;
    let destForInclude = src;
    if (copyIntoProject) {
      const destDir = path.join(csprojDir, "libs");
      await fs.mkdir(destDir, { recursive: true });
      const stem = base.replace(/\.dll$/i, "");
      let dest = path.join(destDir, base);
      let n = 0;
      while (await fs.stat(dest).catch(() => null)) {
        n += 1;
        if (n > 49) throw new Error("Too many DLL name collisions in libs/.");
        dest = path.join(destDir, `${stem}_${n}.dll`);
      }
      await fs.copyFile(src, dest);
      destForInclude = dest;
      hintRel = path
        .relative(csprojDir, dest)
        .split(path.sep)
        .join("\\");
    } else {
      hintRel = path
        .relative(csprojDir, src)
        .split(path.sep)
        .join("\\");
    }

    const asmName = path
      .basename(destForInclude)
      .replace(/\.dll$/i, "");
    const includeName = asmName.replace(/[^a-zA-Z0-9_.]/g, "_") || "Assembly";
    inserts.push(`  <ItemGroup>
    <Reference Include="${escapeXml(includeName)}">
      <HintPath>${escapeXml(hintRel)}</HintPath>
      <Private>True</Private>
    </Reference>
  </ItemGroup>`);
  }

  const toAppend = `\n${inserts.join("\n\n")}\n`;
  const trimmed = raw.replace(/\s*$/, "");
  const next = trimmed.replace(
    /\s*<\/Project>\s*$/i,
    `\n${toAppend.trimEnd()}\n</Project>`
  );
  await fs.writeFile(csprojAbs, next, "utf8");
  return { ok: true, added: inserts.length };
}

/**
 * @param {string} s
 */
function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} root
 * @param {string} csprojRel
 * @param {string} rawBlock
 */
async function removeDllReference(root, csprojRel, rawBlock) {
  const rel = String(csprojRel || "").replace(/\\/g, "/");
  if (!rel.endsWith(".csproj")) throw new Error("Select a .csproj file.");
  const csprojAbs = path.join(root, ...rel.split("/"));
  const raw = await fs.readFile(csprojAbs, "utf8");
  const block = String(rawBlock || "");
  if (!block.trim()) throw new Error("Nothing to remove.");
  if (!raw.includes(block)) throw new Error("That reference block was not found (file changed?).");
  const next = raw.replace(block, "").replace(/\n{3,}/g, "\n\n");
  await fs.writeFile(csprojAbs, next, "utf8");
  return { ok: true };
}

/**
 * @param {string} dirAbs
 * @param {{ recurse?: boolean; max?: number }} [options]
 * @returns {Promise<string[]>}
 */
async function listDllPathsInDirectory(dirAbs, options = {}) {
  const root = path.resolve(String(dirAbs || ""));
  const recurse = Boolean(options.recurse);
  const max = Math.min(Math.max(Number(options.max) || 350, 1), 500);
  const st = await fs.stat(root).catch(() => null);
  if (!st?.isDirectory()) throw new Error("Not a folder.");

  /** @type {string[]} */
  const dlls = [];

  async function walk(dir) {
    if (dlls.length >= max) return;
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    ents.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ents) {
      if (dlls.length >= max) return;
      const p = path.join(dir, e.name);
      if (e.isFile() && e.name.toLowerCase().endsWith(".dll")) {
        dlls.push(p);
      } else if (e.isDirectory() && recurse) {
        await walk(p);
      }
    }
  }

  await walk(root);
  dlls.sort((a, b) => a.localeCompare(b));
  return dlls;
}

module.exports = {
  listDllReferences,
  addDllReferences,
  removeDllReference,
  listDllPathsInDirectory,
};
