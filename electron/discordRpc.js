"use strict";

const path = require("path");
const { Client } = require("discord-rpc");

const CLIENT_ID = "1390807459328823297";

/** @type {any} */
let client = null;
let enabled = false;

/** @type {() => string | null} */
let getProjectPath = () => null;

function setProjectResolver(fn) {
  getProjectPath = typeof fn === "function" ? fn : () => null;
}

async function destroyClient() {
  if (!client) return;
  const c = client;
  client = null;
  try {
    await c.clearActivity();
  } catch (_) {}
  try {
    await c.destroy();
  } catch (_) {}
}

async function ensureClient() {
  if (client) return client;
  const c = new Client({ transport: "ipc" });
  await c.login({ clientId: CLIENT_ID });
  client = c;
  c.on("disconnected", () => {
    if (client === c) client = null;
  });
  return c;
}

async function pushActivity() {
  if (!enabled) return;
  let c;
  try {
    c = await ensureClient();
  } catch (_) {
    await destroyClient();
    return;
  }
  const projectPath = getProjectPath();
  const name = projectPath ? path.basename(projectPath) : null;
  const payload = projectPath
    ? {
        details: "Encryptic IDE",
        state: name ? `In ${name}` : "In workspace",
        startTimestamp: Date.now(),
      }
    : {
        details: "Encryptic IDE",
        state: "Welcome hub",
        startTimestamp: Date.now(),
      };
  try {
    await c.setActivity(payload);
  } catch (_) {
    await destroyClient();
  }
}

/**
 * @param {Record<string, unknown>} settings
 */
async function syncFromSettings(settings) {
  enabled = !!settings.discordRpcEnabled;
  if (!enabled) {
    await destroyClient();
    return;
  }
  await pushActivity();
}

async function bumpPresence() {
  if (!enabled) return;
  await pushActivity();
}

async function shutdown() {
  enabled = false;
  await destroyClient();
}

module.exports = {
  CLIENT_ID,
  setProjectResolver,
  syncFromSettings,
  bumpPresence,
  shutdown,
};
