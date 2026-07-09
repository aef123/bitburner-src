/**
 * Tests for the UI-layer session history module (Task 8, 2A part 1).
 *
 * Covers: push with timestamps, consecutive-dedupe rule (mirrors Terminal.commandHistory's rule,
 * but refreshes the timestamp), and the size cap.
 */

import {
  MAX_SESSION_HISTORY,
  clearSessionCommands,
  getSessionCommands,
  recordSessionCommand,
} from "../../../src/Terminal/sessionHistory";

beforeEach(() => {
  clearSessionCommands();
});

describe("sessionHistory", () => {
  it("records commands with timestamps in order", () => {
    recordSessionCommand("ls", 1000);
    recordSessionCommand("free", 2000);
    const entries = getSessionCommands();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ command: "ls", timestamp: 1000 });
    expect(entries[1]).toEqual({ command: "free", timestamp: 2000 });
  });

  it("defaults the timestamp to now", () => {
    const before = Date.now();
    recordSessionCommand("ls");
    const after = Date.now();
    const [entry] = getSessionCommands();
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });

  it("dedupes consecutive identical commands (same rule as Terminal.commandHistory), refreshing the timestamp", () => {
    recordSessionCommand("hack", 1000);
    recordSessionCommand("hack", 2000);
    const entries = getSessionCommands();
    expect(entries).toHaveLength(1);
    expect(entries[0].command).toBe("hack");
    expect(entries[0].timestamp).toBe(2000);
  });

  it("does NOT dedupe non-consecutive repeats", () => {
    recordSessionCommand("hack", 1000);
    recordSessionCommand("ls", 2000);
    recordSessionCommand("hack", 3000);
    expect(getSessionCommands().map((e) => e.command)).toEqual(["hack", "ls", "hack"]);
  });

  it("caps the number of entries, dropping the oldest", () => {
    for (let i = 0; i < MAX_SESSION_HISTORY + 10; i++) {
      recordSessionCommand(`cmd-${i}`, i);
    }
    const entries = getSessionCommands();
    expect(entries).toHaveLength(MAX_SESSION_HISTORY);
    expect(entries[0].command).toBe("cmd-10");
    expect(entries[entries.length - 1].command).toBe(`cmd-${MAX_SESSION_HISTORY + 9}`);
  });

  it("clearSessionCommands empties the list", () => {
    recordSessionCommand("ls");
    clearSessionCommands();
    expect(getSessionCommands()).toHaveLength(0);
  });
});
