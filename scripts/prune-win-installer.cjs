/**
 * After an NSIS Windows build: remove win-unpacked and stray uninstaller.
 * Keeps latest.yml and *.blockmap (required for electron-updater / GitHub Releases).
 */
const fs = require("fs");
const path = require("path");

const release = path.join(__dirname, "..", "release");
if (!fs.existsSync(release)) {
  process.exit(0);
}

const names0 = fs.readdirSync(release);
const hasNsisSetup = names0.some((n) => /setup.*\.exe$/i.test(n));
const hasWinUnpacked = fs.existsSync(path.join(release, "win-unpacked"));
if (!hasNsisSetup && !hasWinUnpacked) {
  console.log("prune-win-installer: no Windows NSIS staging; skipping.");
  process.exit(0);
}

const unpacked = path.join(release, "win-unpacked");
if (fs.existsSync(unpacked)) {
  fs.rmSync(unpacked, { recursive: true, force: true });
}

for (const name of fs.readdirSync(release)) {
  const full = path.join(release, name);
  const st = fs.statSync(full, { throwIfNoEntry: false });
  if (!st) continue;
  if (st.isFile()) {
    const low = name.toLowerCase();
    if (low.startsWith("__uninstaller")) {
      fs.rmSync(full, { force: true });
    }
  }
}

const names = fs.readdirSync(release);
const hasSetup = names.some((n) => /setup.*\.exe$/i.test(n));
if (hasSetup) {
  const stray = path.join(release, "Encryptic-IDE.exe");
  if (fs.existsSync(stray)) {
    try {
      fs.rmSync(stray, { force: true });
    } catch (_) {}
  }
}

console.log("prune-win-installer: staging cleaned; keep Encryptic-IDE-Setup-*.exe for distribution.");
