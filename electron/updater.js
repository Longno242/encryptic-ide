"use strict";

const { autoUpdater } = require("electron-updater");
const { dialog, app, BrowserWindow, Notification } = require("electron");

let sentryCapture;
try {
  sentryCapture = require("@sentry/electron/main").captureException;
} catch (_) {
  sentryCapture = () => {};
}

/** Offline, GitHub hiccups, or no matching release — not worth alarming Sentry. */
function isBenignUpdaterError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (!msg) return true;
  const hints = [
    "net::err",
    "failed to load",
    "404",
    "not found",
    "enotfound",
    "etimedout",
    "econnrefused",
    "econnreset",
    "socket hang up",
    "cancelled",
    "canceled",
    "aborted",
    "unable to find latest",
    "no published",
  ];
  return hints.some((h) => msg.includes(h));
}

function reportUpdaterError(err) {
  if (!isBenignUpdaterError(err)) sentryCapture(err);
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("update-available", (info) => {
    if (!Notification.isSupported()) return;
    try {
      new Notification({
        title: "Encryptic IDE update",
        body: `Version ${info?.version ?? ""} is downloading in the background.`,
      }).show();
    } catch (_) {}
  });

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
    reportUpdaterError(err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => reportUpdaterError(err));
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
    reportUpdaterError(err);
    const benign = isBenignUpdaterError(err);
    await dialog.showMessageBox(win ?? undefined, {
      type: benign ? "info" : "warning",
      title: benign ? "Could not check for updates" : "Update check failed",
      message: benign
        ? "The update server could not be reached (offline, firewall, or no newer release yet). You can always install the latest build from the project’s GitHub Releases page."
        : String(err?.message || err),
    });
  }
}

module.exports = { setupAutoUpdater, checkForUpdatesInteractive };
