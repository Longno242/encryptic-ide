"use strict";

const { autoUpdater } = require("electron-updater");
const { dialog, app, BrowserWindow } = require("electron");

let sentryCapture;
try {
  sentryCapture = require("@sentry/electron/main").captureException;
} catch (_) {
  sentryCapture = () => {};
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("update-downloaded", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { response } = await dialog.showMessageBox(win ?? undefined, {
      type: "info",
      title: "Update ready",
      message: "A new version of Encryptic IDE has been downloaded.",
      detail: "Restart now to install the update.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
    });
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (err) => {
    sentryCapture(err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => sentryCapture(err));
  }, 8000);
}

async function checkForUpdatesInteractive() {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      message: "Updates are checked automatically in the installed app. Dev builds use the source tree.",
    });
    return;
  }
  const win = BrowserWindow.getFocusedWindow();
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    const cur = app.getVersion();
    if (latest && latest !== cur) {
      await dialog.showMessageBox(win ?? undefined, {
        type: "info",
        title: "Update available",
        message: `Version ${latest} is available (you have ${cur}). It will download in the background.`,
      });
    } else {
      await dialog.showMessageBox(win ?? undefined, {
        type: "info",
        title: "Encryptic IDE",
        message: "You are on the latest release channel version, or the update server could not be reached.",
      });
    }
  } catch (err) {
    sentryCapture(err);
    await dialog.showMessageBox(win ?? undefined, {
      type: "warning",
      title: "Update check failed",
      message: String(err?.message || err),
    });
  }
}

module.exports = { setupAutoUpdater, checkForUpdatesInteractive };
