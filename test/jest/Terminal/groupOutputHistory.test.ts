/**
 * Tests for the pure render-time grouping of Terminal.outputHistory into command blocks (Task 8, 2A part 1).
 *
 * Covers:
 *   - banner/preamble items before the first CommandBlockStart render bare (no block)
 *   - N CommandBlockStarts produce N blocks, each owning the items that follow it
 *   - async prints (appends with no new CommandBlockStart) land in the latest block
 *   - MaxTerminalCapacity-style front-splice mid-block still groups sanely
 *     (orphaned tail items of a spliced block become preamble)
 */

import { CommandBlockStart, Output } from "../../../src/Terminal/OutputTypes";
import { groupOutputHistory } from "../../../src/Terminal/ui/groupOutputHistory";

function out(text: string): Output {
  return new Output(text, "primary");
}

describe("groupOutputHistory", () => {
  it("puts items before the first block into the preamble (banner case)", () => {
    const banner = out("Bitburner v3.0.0");
    const grouped = groupOutputHistory([banner]);
    expect(grouped.preamble).toEqual([banner]);
    expect(grouped.blocks).toHaveLength(0);
  });

  it("creates one block per CommandBlockStart with the items that follow it", () => {
    const banner = out("banner");
    const startA = new CommandBlockStart("ls", "home", "");
    const a1 = out("file1.js");
    const a2 = out("file2.js");
    const startB = new CommandBlockStart("free", "home", "");
    const b1 = out("RAM: 8GB");

    const grouped = groupOutputHistory([banner, startA, a1, a2, startB, b1]);

    expect(grouped.preamble).toEqual([banner]);
    expect(grouped.blocks).toHaveLength(2);
    expect(grouped.blocks[0].start).toBe(startA);
    expect(grouped.blocks[0].items).toEqual([a1, a2]);
    expect(grouped.blocks[1].start).toBe(startB);
    expect(grouped.blocks[1].items).toEqual([b1]);
  });

  it("appends async prints to the latest block", () => {
    const start = new CommandBlockStart("run script.js", "home", "");
    const history: (Output | CommandBlockStart)[] = [start, out("Running script...")];
    // Simulate a script printing to the terminal later, with no new command in between.
    history.push(out("async print from script"));
    const grouped = groupOutputHistory(history);
    expect(grouped.blocks).toHaveLength(1);
    expect(grouped.blocks[0].items).toHaveLength(2);
    expect((grouped.blocks[0].items[1] as Output).text).toContain("async print from script");
  });

  it("handles a capacity splice that removes a block start mid-block", () => {
    const startA = new CommandBlockStart("ls", "home", "");
    const a1 = out("orphan1");
    const a2 = out("orphan2");
    const startB = new CommandBlockStart("free", "home", "");
    const b1 = out("RAM: 8GB");
    const history = [startA, a1, a2, startB, b1];
    // Simulate Settings.MaxTerminalCapacity splice removing the oldest entries,
    // including startA but not all of its output.
    history.splice(0, 1);

    const grouped = groupOutputHistory(history);
    // startA's surviving outputs have no block; they must render bare as preamble.
    expect(grouped.preamble).toEqual([a1, a2]);
    expect(grouped.blocks).toHaveLength(1);
    expect(grouped.blocks[0].start).toBe(startB);
    expect(grouped.blocks[0].items).toEqual([b1]);
  });

  it("handles an empty history", () => {
    const grouped = groupOutputHistory([]);
    expect(grouped.preamble).toEqual([]);
    expect(grouped.blocks).toEqual([]);
  });

  it("handles a block with no output items", () => {
    const start = new CommandBlockStart("cd /scripts", "home", "");
    const grouped = groupOutputHistory([start]);
    expect(grouped.blocks).toHaveLength(1);
    expect(grouped.blocks[0].items).toEqual([]);
  });
});

describe("CommandBlockStart", () => {
  it("stores command, hostname, cwd, and a timestamp", () => {
    const before = Date.now();
    const start = new CommandBlockStart("scan-analyze 2", "run4theh111z", "scripts");
    const after = Date.now();
    expect(start.command).toBe("scan-analyze 2");
    expect(start.hostname).toBe("run4theh111z");
    expect(start.cwd).toBe("scripts");
    expect(start.timestamp).toBeGreaterThanOrEqual(before);
    expect(start.timestamp).toBeLessThanOrEqual(after);
  });

  it("exposes a legacy-format text line so text consumers (e.g. grep over terminal history) keep working", () => {
    const start = new CommandBlockStart("ls", "home", "");
    expect(start.text).toBe("[home /]> ls");
  });
});
