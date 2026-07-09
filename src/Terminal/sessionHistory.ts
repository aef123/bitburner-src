/**
 * UI-layer session command history (Task 8, 2A part 1).
 *
 * Tracks the commands executed through Terminal.executeCommands during THIS app session, with
 * timestamps, for the terminal's history panel ("THIS SESSION" section). Deliberately NOT saved:
 * `Player.terminalCommandHistory` (50 entries, no timestamps) is the persistent record; this module
 * only exists so the panel can honestly show *when* something ran, and historical timestamps for
 * older sessions simply don't exist. Dies on reload by design.
 */

export interface SessionCommandEntry {
  command: string;
  timestamp: number;
}

/** Cap so a very long session can't grow memory unboundedly. */
export const MAX_SESSION_HISTORY = 200;

const entries: SessionCommandEntry[] = [];

/**
 * Record a command execution. Mirrors Terminal.commandHistory's consecutive-dedupe rule
 * (a command identical to the previous one is not appended), but refreshes the timestamp of the
 * existing entry so the panel shows the most recent run time.
 */
export function recordSessionCommand(command: string, timestamp: number = Date.now()): void {
  const last = entries[entries.length - 1];
  if (last && last.command === command) {
    last.timestamp = timestamp;
    return;
  }
  entries.push({ command, timestamp });
  if (entries.length > MAX_SESSION_HISTORY) {
    entries.splice(0, entries.length - MAX_SESSION_HISTORY);
  }
}

export function getSessionCommands(): readonly SessionCommandEntry[] {
  return entries;
}

export function clearSessionCommands(): void {
  entries.length = 0;
}
