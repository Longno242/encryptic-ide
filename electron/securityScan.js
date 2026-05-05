const path = require("path");
const fs = require("fs/promises");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "bin",
  "obj",
  "dist",
  "release",
  "Library",
  "Temp",
  "packages",
  ".vs",
  ".nuget",
  "venv",
  ".venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".output",
  "target",
  "coverage",
  "Pods",
  ".yarn",
  ".pnpm-store",
  ".cache",
  ".parcel-cache",
  ".turbo",
  ".gradle",
  ".swc",
]);

/** Lowercase full filename (readdir entry) — Docker/Make, dotfiles with no useful extname(), etc. */
const SCAN_BASENAME_EXACT = new Set([
  "dockerfile",
  "containerfile",
  "makefile",
  "gemfile",
  "rakefile",
  "cargo.toml",
  "cmakelists.txt",
  "jenkinsfile",
  "vagrantfile",
  "podfile",
  "procfile",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".dockerignore",
  ".npmrc",
  ".yarnrc",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
]);

/** Skip obvious binary / asset extensions (everything else can still be rejected after read). */
const SKIP_EXT_BINARY = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".avif",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".lib",
  ".a",
  ".o",
  ".obj",
  ".pdb",
  ".ilk",
  ".exp",
  ".wasm",
  ".dex",
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".zip",
  ".7z",
  ".rar",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm",
  ".mkv",
  ".avi",
  ".mov",
  ".m4a",
  ".aac",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".mdb",
  ".pak",
  ".bin",
  ".dat",
  ".dmg",
  ".msi",
  ".apk",
  ".ipa",
  ".blend",
  ".fbx",
  ".psd",
  ".ai",
]);

function shouldScanFilename(name) {
  const ln = String(name || "").toLowerCase();
  if (!ln || ln.endsWith(".")) return false;
  const ext = path.extname(ln).toLowerCase();
  if (SKIP_EXT_BINARY.has(ext)) return false;
  if (SCAN_EXTENSIONS.has(ext)) return true;
  if (SCAN_BASENAME_EXACT.has(ln)) return true;
  if (ln.endsWith(".env.example")) return true;
  return false;
}

/**
 * UTF-8 by default; strip BOM; if NULs appear (UTF-16, binary), accept plausible UTF-16LE text.
 * @returns {string | null} null → treat as binary / skip
 */
function decodeLikelyUtfText(buf) {
  if (buf.length === 0) return "";
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    b = b.subarray(3);
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
    return b.subarray(2).toString("utf16le");
  }
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    return b.subarray(2).toString("utf16be");
  }
  if (!b.includes(0)) {
    return b.toString("utf8");
  }
  if (b.length % 2 !== 0) return null;
  const as16 = b.toString("utf16le");
  const sample = Math.min(as16.length, 12_000);
  let ctrl = 0;
  for (let i = 0; i < sample; i++) {
    const cp = as16.charCodeAt(i);
    if ((cp >= 1 && cp <= 8) || cp === 11 || cp === 12 || (cp >= 14 && cp <= 31)) ctrl += 1;
  }
  if (sample > 0 && ctrl / sample > 0.025) return null;
  return as16;
}

// Includes C#, C/C++ headers & sources, MSBuild, CMake — see also decodeLikelyUtfText() for UTF-16 sources.
const SCAN_EXTENSIONS = new Set([
  // JS / TS / web
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".vue",
  ".svelte",
  ".astro",
  // Scripts & shell
  ".ps1",
  ".psm1",
  ".psd1",
  ".bat",
  ".cmd",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".vbs",
  ".wsf",
  // Languages
  ".py",
  ".pyw",
  ".rb",
  ".php",
  ".pl",
  ".pm",
  ".lua",
  ".java",
  ".kt",
  ".kts",
  ".gradle",
  ".go",
  ".rs",
  ".swift",
  ".scala",
  ".clj",
  ".cljs",
  ".ex",
  ".exs",
  ".erl",
  ".hrl",
  ".dart",
  ".r",
  ".m",
  ".mm",
  // .NET / C-family (all common text source & MSBuild artifacts)
  ".cs",
  ".csx",
  ".fs",
  ".fsx",
  ".fsi",
  ".vb",
  ".vbx",
  ".cake",
  ".cshtml",
  ".razor",
  ".c",
  ".h",
  ".hpp",
  ".hh",
  ".hxx",
  ".h++",
  ".cc",
  ".cpp",
  ".cxx",
  ".c++",
  ".cppm",
  ".ixx",
  ".ccm",
  ".inl",
  ".ipp",
  ".tpp",
  ".tcc",
  ".pch",
  ".idl",
  ".odl",
  ".def",
  ".rc",
  ".rc2",
  ".manifest",
  ".asm",
  ".s",
  ".S",
  ".l",
  ".y",
  ".lex",
  ".yacc",
  ".cu",
  ".cuh",
  ".metal",
  ".cl",
  ".vert",
  ".frag",
  ".comp",
  ".geom",
  ".mesh",
  ".task",
  ".vcxproj",
  ".filters",
  ".sfproj",
  ".slnf",
  // Markup / data / IDE
  ".html",
  ".htm",
  ".xhtml",
  ".svg",
  ".xaml",
  ".axaml",
  ".resx",
  ".json",
  ".jsonc",
  ".xml",
  ".xsl",
  ".xslt",
  ".csproj",
  ".vbproj",
  ".fsproj",
  ".props",
  ".targets",
  ".nuspec",
  ".sln",
  ".slnx",
  ".yaml",
  ".yml",
  ".toml",
  ".cmake",
  ".reg",
  ".ini",
  ".cfg",
  ".conf",
  ".config",
  ".md",
  ".mdx",
  ".rst",
  ".txt",
  ".sql",
  ".graphql",
  ".erb",
  ".ejs",
]);

const MAX_FILES = 2500;
const MAX_DEPTH = 22;
const MAX_FILE_BYTES = 400 * 1024;
const MAX_FINDINGS = 80;

/**
 * Walk every non-overlapping match (non-global rules would otherwise repeat the first match forever).
 * @param {RegExp} re
 * @param {string} content
 * @param {(m: RegExpExecArray) => boolean | void} fn — return false to stop early
 */
function forEachMatch(re, content, fn) {
  const flags = re.global ? re.flags : `${re.flags}g`;
  const gRe = new RegExp(re.source, flags);
  gRe.lastIndex = 0;
  let m;
  let guard = 0;
  while ((m = gRe.exec(content))) {
    if (fn(m) === false) return;
    guard += 1;
    if (guard > 50_000) return;
    if (m[0].length === 0) gRe.lastIndex++;
  }
}

/**
 * @typedef {{ id: string; severity: "high" | "medium"; title: string }} Rule
 * @typedef {{ id: string; severity: "high" | "medium"; title: string; path: string; line: number; snippet: string }} Finding
 */

/** @type {Rule[]} */
const RULES = [
  {
    id: "powershell-iex",
    severity: "high",
    title: "PowerShell Invoke-Expression / IEX (often used to run decoded payloads)",
    re: /\b(?:Invoke-Expression|IEX\s*\(|IEX\s|,?\s*iex\b)/i,
  },
  {
    id: "powershell-b64-run",
    severity: "high",
    title: "PowerShell runs Base64-encoded command (-EncodedCommand / -enc)",
    re: /\b(?:-EncodedCommand|--EncodedCommand|\s-enc\b|\s\/ep\b|\s\/exec\b\s)/i,
  },
  {
    id: "frombase64",
    severity: "high",
    title: "Decoded Base64 transformed into runnable code (.NET/PowerShell pattern)",
    re: /\.FromBase64String\s*\(|Convert\.FromBase64String\s*\(/i,
  },
  {
    id: "bitsadmin-certutil",
    severity: "high",
    title: "Download/decode helper often abused by droppers (bitsadmin / certutil)",
    re: /\b(?:bitsadmin|certutil)\b.{0,120}(?:\/transfer|decode|urlcache|encode)/i,
  },
  {
    id: "amsi-bypass",
    severity: "high",
    title: "AMSI bypass markers (often present in malicious PowerShell)",
    re: /\b(?:AmsiScanBuffer|amsiInitFailed)\b/i,
  },
  {
    id: "js-dynamic-code",
    severity: "medium",
    title: "JavaScript dynamic evaluation (eval / Function constructor)",
    re: /\beval\s*\(|new\s+Function\s*\(|constructor\s*\(\s*['\"]return\b/i,
  },
  {
    id: "node-child-process-exec",
    severity: "medium",
    title: "Node opens a subprocess or shell (child_process / spawn / exec / fork)",
    re: /require\s*\(\s*['"](?:node:)?child_process['"]\s*\)|from\s+['"](?:node:)?child_process['"]|import\s*\(\s*['"](?:node:)?child_process['"]\s*\)|\bchild_process\.(?:spawn(?:Sync)?|exec(?:Sync)?|execFile(?:Sync)?|fork)\s*\(/i,
  },
  {
    id: "remote-download-shell",
    severity: "high",
    title: "Downloads then pipes to shell (curl|wget combined with bash/sh execution)",
    re: /\b(?:curl|wget|Invoke-WebRequest|iwr\b|curl\.exe)[^|\n]{0,200}\|\s*(?:bash|sh|powershell|pwsh)/i,
  },
  {
    id: "mshta-scriptlet",
    severity: "high",
    title: "mshta / wscript / rundll abuse pattern",
    re: /\b(?:mshta\.exe|rundll32\.exe|wscript\.exe|cscript\.exe)\b/i,
  },
  {
    id: "schtasks-registry-run",
    severity: "medium",
    title: "Persistence primitives (scheduled task or Run key manipulation)",
    re: /\b(?:schtasks|reg\s+add).{0,80}(?:\\Run\\|\x2FRunOnce|\\RunOnce)/i,
  },
  {
    id: "dotnet-process-start",
    severity: "medium",
    title: ".NET starts an external process (Process.Start / ProcessStartInfo)",
    re: /\b(?:System\.Diagnostics\.)?Process\.Start\s*\(|ProcessStartInfo\b/i,
  },
  {
    id: "win32-exec-apis",
    severity: "high",
    title: "Win32 launches a program or URL handler (CreateProcess / ShellExecute / WinExec)",
    re: /\b(?:CreateProcess[A-Z]?|ShellExecute[A-Z]?|ShellExecuteEx[A-Z]?|WinExec)\s*\(/i,
  },
  {
    id: "powershell-start-process",
    severity: "medium",
    title: "PowerShell starts another process (Start-Process / ::Start)",
    re: /\bStart-Process\b|\[System\.Diagnostics\.Process\]::Start\b/i,
  },
  {
    id: "python-subprocess-os",
    severity: "medium",
    title: "Python runs a shell or child process (subprocess / os.system / os.popen)",
    re: /\bsubprocess\.(?:run|call|Popen|check(?:_call|_output))\s*\(|\bos\.(?:system|popen|spawnv?[pe]?|exec\w+)\s*\(/i,
  },
  {
    id: "java-runtime-exec",
    severity: "medium",
    title: "Java executes another program (Runtime.exec / ProcessBuilder)",
    re: /\.getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(|\bnew\s+ProcessBuilder\s*\(/i,
  },
  {
    id: "go-exec-command",
    severity: "medium",
    title: "Go runs an external command (exec.Command / CommandContext)",
    re: /\bexec\.(?:Command|CommandContext)\s*\(/i,
  },
  {
    id: "rust-command-new",
    severity: "medium",
    title: "Rust invokes std::process::Command / Command::new",
    re: /\b(?:std\s*::\s*process\s*::\s*Command|tokio\s*::\s*process\s*::\s*Command|Command::new)\s*\(/i,
  },
  {
    id: "php-proc-shell",
    severity: "medium",
    title: "PHP invokes shell or external program (shell_exec / proc_open / passthru)",
    re: /\b(?:shell_exec|proc_open|passthru|pcntl_exec)\s*\(/i,
  },
  {
    id: "c-posix-popen-system",
    severity: "medium",
    title: "C/C++ may run a shell command (popen / system with string)",
    re: /\b(?:popen|_popen|wpopen)\s*\(\s*["']|\bsystem\s*\(\s*["']/i,
  },
  {
    id: "electron-shell-open-uri",
    severity: "medium",
    title: "Electron opens a URL or path in the OS (shell.openExternal / openPath / app.openExternal)",
    re: /\b(?:shell\.)?(?:openExternal|openPath)\s*\(|\bapp\.openExternal\s*\(/i,
  },
  {
    id: "url-dangerous-scheme",
    severity: "high",
    title: "Link uses javascript:, vbscript:, or data: with HTML/script MIME (risky URLs)",
    re: /\b(?:javascript|vbscript)\s*:[^\s"'<>]{1,400}|\bdata\s*:[^\s"'<>]{0,140}(?:text\/html|application\/(?:javascript|x-javascript))/i,
  },
  {
    id: "url-file-scheme-exe",
    severity: "high",
    title: "file: URL references a script or installer (possible local execution vector)",
    re: /\bfile\s*:\/{2,3}[^\s"'<>]{0,400}\.(?:exe|bat|cmd|ps1|vbs|msi|scr)\b/i,
  },
  {
    id: "url-remote-installer",
    severity: "medium",
    title: "HTTP(S) URL points to a downloadable executable or script",
    re: /https?:\/\/[^\s"'<>)]{1,480}\.(?:exe|msi|scr|bat|cmd|ps1)\b/i,
  },
  {
    id: "batch-call-start",
    severity: "medium",
    title: "Batch/cmd may launch another program (CALL / START)",
    re: /^\s*(?:call|start)\s+(?:\/[a-z]\s+|\/(?:min|b|wait|w)\s+)*[^\s%/][^\n\r]{1,260}/im,
  },
  {
    id: "cmd-powershell-invoke",
    severity: "medium",
    title: "Cmd chains into PowerShell or cmd /c (nested shell / downloader pattern)",
    re: /\b(?:cmd(?:\.exe)?)\b[^\n\r]{0,160}\/[kc]\b|\b(?:powershell|pwsh)\.exe\b|\bpowershell\b[^\n\r]{0,120}-\s*(?:[ec]|encodedcommand)\b/i,
  },
];

function scanContent(content, relPath) {
  /** @type {Finding[]} */
  const out = [];
  const longB64Script = /\.(?:ps1|bat|cmd|vbs|sh)$/i.test(relPath);

  const b64SeenLines = new Set();
  if (longB64Script) {
    const b64Rx = /[A-Za-z0-9+/]{260,}={0,2}/g;
    let bm;
    while ((bm = b64Rx.exec(content))) {
      const line = content.slice(0, bm.index).split(/\r?\n/).length;
      if (b64SeenLines.has(line)) continue;
      b64SeenLines.add(line);
      const snippet =
        bm[0].length > 96 ? bm[0].slice(0, 96) + "…" + ` (${bm[0].length} chars)` : bm[0];
      out.push({
        id: "long-base64-string",
        severity: "medium",
        title: "Very long Base64-looking string in a script file (possible obfuscation)",
        path: relPath,
        line,
        snippet,
      });
      if (out.length >= 25) break;
    }
  }

  for (const rule of RULES) {
    const seenLines = new Set();
    forEachMatch(rule.re, content, (m) => {
      if (out.length >= 40) return false;
      const before = content.slice(0, m.index);
      const line = before.split(/\r?\n/).length;
      if (seenLines.has(line)) return undefined;
      seenLines.add(line);
      let snippet = "";
      const linesAround = content.split(/\r?\n/);
      const idx = line - 1;
      if (linesAround[idx] != null) {
        snippet = linesAround[idx].trim().slice(0, 200);
      }
      out.push({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        path: relPath,
        line,
        snippet: snippet || String(m[0]).slice(0, 200),
      });
      return undefined;
    });
    if (out.length >= 40) return out;
  }

  return out;
}

/**
 * @param {string} projectRoot
 * @param {{ onProgress?: (p: { scannedFiles: number; lastPath: string }) => void }} [opts]
 * @returns {Promise<{ scannedFiles: number; findings: Finding[]; truncated: boolean }>}
 */
async function scanProject(projectRoot, opts = {}) {
  const onProgress = opts.onProgress;
  const resolved = path.resolve(projectRoot);
  /** @type {Finding[]} */
  let findings = [];
  let scannedFiles = 0;
  let truncatedFiles = false;

  /** @type {number} */
  let lastProgressEmit = 0;
  function emitProgress(lastPath, force = false) {
    if (!onProgress) return;
    const now = Date.now();
    if (
      !force &&
      scannedFiles > 0 &&
      now - lastProgressEmit < 110 &&
      scannedFiles % 6 !== 0
    ) {
      return;
    }
    lastProgressEmit = now;
    onProgress({ scannedFiles, lastPath });
  }

  async function scanOneFile(relPath, full) {
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      return;
    }
    if (st.size > MAX_FILE_BYTES) return;
    let buf;
    try {
      buf = await fs.readFile(full);
    } catch {
      return;
    }
    const text = decodeLikelyUtfText(buf);
    if (text === null) return;
    scannedFiles += 1;
    emitProgress(relPath);
    const fileFindings = scanContent(text, relPath);
    findings = findings.concat(fileFindings);
    if (findings.length >= MAX_FINDINGS) {
      findings = findings.slice(0, MAX_FINDINGS);
      truncatedFiles = true;
    }
  }

  async function walk(rel, depth) {
    if (scannedFiles >= MAX_FILES || findings.length >= MAX_FINDINGS) {
      truncatedFiles = true;
      return;
    }
    if (depth > MAX_DEPTH) return;
    const dir = rel ? path.join(resolved, ...rel.split(path.sep)) : resolved;
    if (!dir.startsWith(resolved)) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (scannedFiles >= MAX_FILES || findings.length >= MAX_FINDINGS) {
        truncatedFiles = true;
        return;
      }
      const name = ent.name;
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        const nextRel = rel ? `${rel}${path.sep}${name}` : name;
        await walk(nextRel, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!shouldScanFilename(name)) continue;
      const relPath = rel ? `${rel}/${name}`.replace(/\\/g, "/") : name;
      const full = path.join(resolved, ...relPath.split("/"));
      await scanOneFile(relPath, full);
    }
  }

  if (onProgress) {
    onProgress({ scannedFiles: 0, lastPath: "Walking project tree…" });
    lastProgressEmit = Date.now();
  }

  await walk("", 0);

  emitProgress("Finishing…", true);

  findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return a.path.localeCompare(b.path) || a.line - b.line;
  });

  return { scannedFiles, findings, truncated: truncatedFiles };
}

module.exports = { scanProject };
