/**
 * Optional: after a **portable** Windows build (`npm run electron:build:portable`),
 * keep only the standalone .exe in release/ and remove win-unpacked, etc.
 * Do not use after NSIS/DMG/deb builds.
 */
const fs = require("fs");
const path = require("path");

const release = path.join(__dirname, "..", "release");
if (!fs.existsSync(release)) {
  console.warn("prune-release: no release/ folder, skipping.");
  process.exit(0);
}

const entries = fs.readdirSync(release, { withFileTypes: true });
const exeFiles = entries.filter(
  (e) => e.isFile() && e.name.toLowerCase().endsWith(".exe")
);

/** @type {Set<string>} */
const keep = new Set();
if (exeFiles.length === 0) {
  console.warn("prune-release: no .exe in release/, skipping.");
  process.exit(0);
}
const exact = exeFiles.find((e) => e.name.toLowerCase() === "encryptic-ide.exe");
const portable = exeFiles.find((e) => /portable/i.test(e.name));
if (exact) keep.add(exact.name);
else if (portable) keep.add(portable.name);
else if (exeFiles.length === 1) keep.add(exeFiles[0].name);
else {
  keep.add(portableExeSort(exeFiles)[0].name);
}

function portableExeSort(list) {
  return [...list].sort(
    (a, b) =>
      fs.statSync(path.join(release, b.name)).size -
      fs.statSync(path.join(release, a.name)).size
  );
}

for (const ent of entries) {
  if (keep.has(ent.name)) continue;
  const full = path.join(release, ent.name);
  fs.rmSync(full, { recursive: true, force: true });
}

const finalExe = "Encryptic-IDE.exe";
const left = fs.readdirSync(release).filter((n) => n.toLowerCase().endsWith(".exe"));
if (left.length === 1 && left[0] !== finalExe) {
  fs.renameSync(path.join(release, left[0]), path.join(release, finalExe));
  console.log("prune-release: renamed to", finalExe);
} else if (left.length === 1) {
  console.log("prune-release: kept", finalExe);
} else {
  console.log("prune-release: kept", left.join(", "));
}
