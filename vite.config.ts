import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function loadSentryDsnForRendererBundle(): string {
  const fromEnv = (process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const p = path.join(__dirname, "electron", "sentry-runtime.json");
    if (!fs.existsSync(p)) return "";
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j.dsn ? String(j.dsn).trim() : "";
  } catch {
    return "";
  }
}

function loadAppVersion(): string {
  try {
    const p = path.join(__dirname, "package.json");
    return JSON.parse(fs.readFileSync(p, "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  define: {
    __SENTRY_RENDERER_DSN__: JSON.stringify(loadSentryDsnForRendererBundle()),
    __APP_VERSION__: JSON.stringify(loadAppVersion()),
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
