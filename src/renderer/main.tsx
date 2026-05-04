import * as Sentry from "@sentry/electron/renderer";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

if (typeof __SENTRY_RENDERER_DSN__ === "string" && __SENTRY_RENDERER_DSN__) {
  Sentry.init({
    dsn: __SENTRY_RENDERER_DSN__,
    release: `encryptic-ide@${__APP_VERSION__}`,
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
