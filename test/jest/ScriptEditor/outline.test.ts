/**
 * Tests for the script-editor OUTLINE extraction (Task 11, 2C part 1).
 *
 * Shipped implementation: regex over top-level (column-0) declarations — function/class/const.
 * The plan allows this as the documented v1 fallback; Monaco's TS worker (getNavigationTree) is
 * `any`-typed in monaco 0.55 and cannot run in jsdom, so the deterministic pure function won.
 */

import { extractOutline } from "../../../src/ScriptEditor/ui/outline";

const FIXTURE = `import { LogLevel } from "shared/logger";
// broke early game — auto-hack raises level
const HACK_COURSE = "Computer Science";
const COMBAT = ["str", "def", "dex", "agi"];

export async function main(ns) {
  function nested() {}
  const inner = 1;
  await nested();
}

export function log(ns, lvl, msg) {}

class GangManager {}

const arrowHelper = async (a) => a;

let counter = 0;
`;

describe("extractOutline", () => {
  const outline = extractOutline(FIXTURE);

  it("finds top-level functions with 1-based line numbers and signatures", () => {
    const main = outline.find((item) => item.name === "main");
    expect(main).toEqual({ kind: "function", name: "main", line: 6, signature: "main(ns)" });
    const log = outline.find((item) => item.name === "log");
    expect(log).toEqual({ kind: "function", name: "log", line: 12, signature: "log(ns, lvl, msg)" });
  });

  it("finds top-level constants and let bindings", () => {
    expect(outline.find((item) => item.name === "HACK_COURSE")).toEqual({
      kind: "const",
      name: "HACK_COURSE",
      line: 3,
      signature: "HACK_COURSE",
    });
    expect(outline.find((item) => item.name === "counter")?.kind).toBe("const");
  });

  it("classifies const-assigned arrow functions as functions", () => {
    expect(outline.find((item) => item.name === "arrowHelper")?.kind).toBe("function");
  });

  it("finds top-level classes", () => {
    expect(outline.find((item) => item.name === "GangManager")).toEqual({
      kind: "class",
      name: "GangManager",
      line: 14,
      signature: "GangManager",
    });
  });

  it("does NOT include nested declarations (top-level only, documented v1 limitation)", () => {
    expect(outline.find((item) => item.name === "nested")).toBeUndefined();
    expect(outline.find((item) => item.name === "inner")).toBeUndefined();
  });

  it("keeps document order", () => {
    expect(outline.map((item) => item.name)).toEqual([
      "HACK_COURSE",
      "COMBAT",
      "main",
      "log",
      "GangManager",
      "arrowHelper",
      "counter",
    ]);
  });

  it("falls back to an ellipsis signature when the parameter list spans lines", () => {
    const multi = extractOutline("export function big(\n  a,\n  b,\n) {}\n");
    expect(multi[0]).toEqual({ kind: "function", name: "big", line: 1, signature: "big(…)" });
  });

  it("returns an empty outline for plaintext-ish content", () => {
    expect(extractOutline("just some notes\nnothing declarative here")).toEqual([]);
  });
});
