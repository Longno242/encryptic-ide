import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import React, { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

const api = window.encryptic;

export function TerminalPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lineBufRef = useRef("");
  const runningRef = useRef(false);
  const [cmd, setCmd] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      theme: {
        background: "#030305",
        foreground: "#c8cdd8",
        cursor: "#5b8cff",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    term.writeln("\x1b[38;2;91;140;255mEncryptic\x1b[0m shell — one command at a time (cwd = project).");
    term.writeln("Tip: try \x1b[33mdir\x1b[0m, \x1b[33mdotnet build\x1b[0m, or \x1b[33mgit status\x1b[0m.\r\n");
    term.write("\x1b[90m$ \x1b[0m");
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(el);

    const offD = api.onShellData((p: { stream: string; text: string }) => {
      term.write(p.text);
    });
    const offDone = api.onShellDone((p: { code: number }) => {
      setRunning(false);
      term.write(`\r\n\x1b[38;2;62;224;184m— exit ${p.code} —\x1b[0m\r\n`);
      lineBufRef.current = "";
      term.write("\x1b[90m$ \x1b[0m");
    });

    const executeLine = async (line: string) => {
      const text = line.trim();
      if (!text || runningRef.current) return;
      term.write(`\r\n\x1b[90m$ ${text}\x1b[0m\r\n`);
      setRunning(true);
      try {
        await api.shellRunLine(text);
      } catch (e) {
        setRunning(false);
        termRef.current?.write(
          `\r\n\x1b[38;2;255;107;107m${String((e as Error)?.message || e)}\x1b[0m\r\n`
        );
        termRef.current?.write("\x1b[90m$ \x1b[0m");
      }
    };

    const disposeInput = term.onData((data) => {
      if (runningRef.current) return;
      for (const ch of data) {
        if (ch === "\r") {
          const line = lineBufRef.current;
          lineBufRef.current = "";
          void executeLine(line);
          continue;
        }
        if (ch === "\u007f") {
          if (lineBufRef.current.length > 0) {
            lineBufRef.current = lineBufRef.current.slice(0, -1);
            term.write("\b \b");
          }
          continue;
        }
        if (ch >= " " && ch !== "\u007f") {
          lineBufRef.current += ch;
          term.write(ch);
        }
      }
    });

    return () => {
      ro.disconnect();
      offD();
      offDone();
      disposeInput.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  const run = async () => {
    const line = cmd.trim();
    if (!line || running) return;
    const term = termRef.current;
    if (term) term.write(`\r\n\x1b[90m$ ${line}\x1b[0m\r\n`);
    lineBufRef.current = "";
    setCmd("");
    setRunning(true);
    try {
      await api.shellRunLine(line);
    } catch (e) {
      setRunning(false);
      termRef.current?.write(
        `\r\n\x1b[38;2;255;107;107m${String((e as Error)?.message || e)}\x1b[0m\r\n`
      );
      termRef.current?.write("\x1b[90m$ \x1b[0m");
    }
  };

  return (
    <div className="terminal-panel">
      <div ref={hostRef} className="terminal-host" />
      <div className="terminal-cmd-row">
        <input
          className="field-input terminal-cmd-input"
          placeholder="Command (runs in project root with system shell)"
          value={cmd}
          disabled={running}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
        <button
          type="button"
          className="btn-primary btn-compact"
          disabled={running || !cmd.trim()}
          onClick={() => void run()}
        >
          Run
        </button>
        <button
          type="button"
          className="btn-ghost btn-compact"
          disabled={!running}
          onClick={() => void api.shellAbort()}
        >
          Stop
        </button>
      </div>
    </div>
  );
}
