# Encryptic IDE

Lightweight desktop editor shell: **Monaco**, project tools, and **Cursor AI** (SDK in the main process).

## Download

Windows installer and auto-update metadata are on **[Releases](https://github.com/Longno242/encryptic-ide/releases)**.

Tagged releases publish **`latest.yml`** next to the setup `.exe` so the in-app updater can find new versions. If a check fails (offline, etc.), install manually from Releases.

**SmartScreen:** new or unsigned builds may show “Windows protected your PC”. Use **More info → Run anyway**, or configure **Authenticode** signing via the `WINDOWS_PFX_*` secrets described in `GITHUB_RELEASE.txt`.

## Hub “To-go” tab

Planned work and known issues shown in the app are edited in `src/renderer/hubRoadmapData.ts`.

## Develop

```bash
npm ci
npm run electron:dev
```

Production UI build: `npm run build`. Full Windows installer (local): `npm run electron:build:win`.

## Release (maintainers)

Tag a version that matches `package.json` (e.g. `v0.1.2`). GitHub Actions builds the NSIS installer and publishes assets. See `GITHUB_RELEASE.txt` for secrets (Sentry, code signing) and details.
