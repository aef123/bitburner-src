/**
 * Tests for the bottom-panel pure list builders (Task 12, 2C part 2).
 *
 * - buildProblemRows: markers → Problems rows. Scope matches StatusBar2C's count exactly:
 *   active-model markers at Warning severity or above (monaco MarkerSeverity: Warning=4, Error=8;
 *   the module keeps local constants so it stays monaco-free and testable in jsdom).
 * - buildLogRows: workerScripts → Logs rows for the active file's server only (the simplest honest
 *   scope: scripts actually running on the server the player is editing).
 */

import { buildLogRows, buildProblemRows, type MarkerLike } from "../../../src/ScriptEditor/ui/bottomPanelData";

describe("buildProblemRows", () => {
  const marker = (overrides: Partial<MarkerLike>): MarkerLike => ({
    severity: 8,
    message: "problem",
    startLineNumber: 1,
    startColumn: 1,
    ...overrides,
  });

  it("keeps errors and warnings, drops hints/infos (same severity floor as the status-bar count)", () => {
    const rows = buildProblemRows([
      marker({ severity: 8, message: "err" }),
      marker({ severity: 4, message: "warn" }),
      marker({ severity: 2, message: "info" }),
      marker({ severity: 1, message: "hint" }),
    ]);
    expect(rows.map((r) => r.message)).toEqual(["err", "warn"]);
    expect(rows[0].severity).toBe("error");
    expect(rows[1].severity).toBe("warning");
  });

  it("sorts by line then column and carries the 1-based position", () => {
    const rows = buildProblemRows([
      marker({ startLineNumber: 9, startColumn: 2, message: "later" }),
      marker({ startLineNumber: 2, startColumn: 8, message: "line2-col8" }),
      marker({ startLineNumber: 2, startColumn: 3, message: "line2-col3" }),
    ]);
    expect(rows.map((r) => r.message)).toEqual(["line2-col3", "line2-col8", "later"]);
    expect(rows[0]).toMatchObject({ line: 2, column: 3 });
  });

  it("returns an empty list for no markers", () => {
    expect(buildProblemRows([])).toEqual([]);
  });
});

describe("buildLogRows", () => {
  const worker = (pid: number, server: string, filename = "loop.js", args: (string | number)[] = []) => ({
    scriptRef: { pid, filename, args, server },
  });

  it("lists only scripts running on the active file's server, sorted by pid", () => {
    const workers = [worker(30, "home"), worker(4, "pserv-1"), worker(7, "home", "batcher.js", ["n00dles", 8])];
    const rows = buildLogRows(workers, "home");
    expect(rows.map((r) => r.pid)).toEqual([7, 30]);
    expect(rows[0]).toMatchObject({ filename: "batcher.js", args: "n00dles 8" });
    expect(rows[1]).toMatchObject({ filename: "loop.js", args: "" });
  });

  it("keeps a reference to the worker so the click handler can emit its scriptRef", () => {
    const w = worker(1, "home");
    const rows = buildLogRows([w], "home");
    expect(rows[0].worker).toBe(w);
  });

  it("returns an empty list when there is no active server", () => {
    expect(buildLogRows([worker(1, "home")], null)).toEqual([]);
  });
});
