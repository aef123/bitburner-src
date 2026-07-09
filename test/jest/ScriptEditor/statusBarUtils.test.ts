/**
 * Tests for the status-bar helpers (Task 11, 2C part 1): the RAM fits/exceeds clause and the
 * language label. Pure functions — the monaco-touching parts of StatusBar2C stay behind seams.
 */

import { describeRamFit, languageLabel } from "../../../src/ScriptEditor/ui/statusBarUtils";
import { formatRam } from "../../../src/ui/formatNumber";
import { initGameEnvironment } from "../Utilities";

beforeAll(() => {
  initGameEnvironment();
});

describe("describeRamFit", () => {
  it("reports fits with the mock's phrasing when the cost is under the server's max RAM", () => {
    const result = describeRamFit(55.8, "home", 128);
    expect(result.fits).toBe(true);
    expect(result.clause).toBe(`— fits home (${formatRam(128)})`);
  });

  it("reports fits when the cost exactly equals max RAM (a full-server script still runs)", () => {
    expect(describeRamFit(128, "home", 128).fits).toBe(true);
  });

  it("reports exceeds when the cost is over max RAM", () => {
    const result = describeRamFit(256, "n00dles", 4);
    expect(result.fits).toBe(false);
    expect(result.clause).toBe(`— exceeds n00dles (${formatRam(4)})`);
  });

  it("is silent when there is no RAM cost (text file / syntax error)", () => {
    const result = describeRamFit(null, "home", 128);
    expect(result.fits).toBeNull();
    expect(result.clause).toBe("");
  });

  it("is silent when the server is unknown", () => {
    const result = describeRamFit(12, null, null);
    expect(result.fits).toBeNull();
    expect(result.clause).toBe("");
  });
});

describe("languageLabel", () => {
  it.each([
    ["batcher.js", "JavaScript"],
    ["ui.jsx", "JavaScript (JSX)"],
    ["types.ts", "TypeScript"],
    ["panel.tsx", "TypeScript (TSX)"],
    ["legacy.script", "JavaScript (NS1)"],
    ["notes.txt", "Plain Text"],
    ["data.json", "JSON"],
    ["style.css", "CSS"],
  ])("labels %s as %s", (path, label) => {
    expect(languageLabel(path)).toBe(label);
  });
});
