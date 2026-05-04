"use strict";

/**
 * Load first from main.js so Sentry hooks run before other app code.
 * DSN: process.env.SENTRY_DSN or electron/sentry-runtime.json (see sentry-runtime.example.json).
 */
const { join } = require("path");
const { readFileSync, existsSync } = require("fs");
const { app } = require("electron");
const Sentry = require("@sentry/electron/main");

function getSentryDsn() {
  const fromEnv = process.env.SENTRY_DSN && String(process.env.SENTRY_DSN).trim();
  if (fromEnv) return fromEnv;
  try {
    const p = join(__dirname, "sentry-runtime.json");
    if (!existsSync(p)) return "";
    const j = JSON.parse(readFileSync(p, "utf8"));
    return j.dsn ? String(j.dsn).trim() : "";
  } catch (_) {
    return "";
  }
}

const dsn = getSentryDsn();
if (dsn) {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
    Sentry.init({
      dsn,
      release: `encryptic-ide@${pkg.version}`,
      environment: app.isPackaged ? "production" : "development",
    });
  } catch (err) {
    console.warn("Sentry init failed:", err && err.message);
  }
}

module.exports = { getSentryDsn };
