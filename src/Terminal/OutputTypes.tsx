import React from "react";
import { Settings } from "../Settings/Settings";
import { formatTime } from "../utils/helpers/formatTime";

export class Output {
  text: string;
  color: "primary" | "error" | "success" | "info" | "warn";
  constructor(text: string, color: "primary" | "error" | "success" | "info" | "warn") {
    if (Settings.TimestampsFormat) text = "[" + formatTime(Settings.TimestampsFormat) + "] " + text;
    this.text = text;
    this.color = color;
  }
}

export class RawOutput {
  raw: React.ReactNode;
  constructor(node: React.ReactNode) {
    if (Settings.TimestampsFormat)
      node = (
        <>
          [{formatTime(Settings.TimestampsFormat)}] {node}
        </>
      );
    this.raw = node;
  }
}

export class Link {
  hostname: string;
  dashes: string;
  constructor(dashes: string, hostname: string) {
    if (Settings.TimestampsFormat) dashes = "[" + formatTime(Settings.TimestampsFormat) + "] " + dashes;
    this.hostname = hostname;
    this.dashes = dashes;
  }
}

/**
 * Marks the start of a command "block" in the terminal output history. Appended when a command is
 * echoed (typed into the input, or re-run from the history panel); the UI groups every subsequent
 * output item under the most recent CommandBlockStart at render time (see groupOutputHistory).
 *
 * `text` mirrors the legacy `[hostname /cwd]> command` echo line, so plain-text consumers of the
 * output history (e.g. `grep` over previous terminal output, which reads `.text` off each item)
 * keep working exactly as they did when the echo was a plain Output line.
 */
export class CommandBlockStart {
  command: string;
  hostname: string;
  cwd: string;
  /** Date.now() epoch ms at echo time; rendered as HH:mm in the block header and history panel. */
  timestamp: number;
  text: string;
  constructor(command: string, hostname: string, cwd: string) {
    this.command = command;
    this.hostname = hostname;
    this.cwd = cwd;
    this.timestamp = Date.now();
    let text = `[${hostname} /${cwd}]> ${command}`;
    if (Settings.TimestampsFormat) text = "[" + formatTime(Settings.TimestampsFormat) + "] " + text;
    this.text = text;
  }
}

/** Anything that can live in Terminal.outputHistory. */
export type TerminalHistoryItem = Output | Link | RawOutput | CommandBlockStart;
