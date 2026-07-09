/**
 * Tests for the script-editor quick-open / full-text-search data layer (Task 12, 2C part 2).
 *
 * Everything here is pure and fixture-driven:
 * - collectSearchableFiles: flattens servers into the searchable file set. The HONESTY assertion
 *   lives here: files on servers that fail the explorer's access rule (not purchased, no backdoor,
 *   no admin) must never appear in the search space. Current server first, others alphabetical.
 * - quickOpenEntries + rankResults reuse: quick-open ranks file paths with the SAME
 *   substring-then-fuzzy helper the shell command palette uses (rankResults, now generic).
 * - searchFiles: plain-text (NOT regex) full-text search with a case-sensitivity toggle and an
 *   explicit match cap + capped flag (no silent truncation). Matches are 1-based line/column,
 *   non-overlapping within a line.
 */

import {
  collectSearchableFiles,
  quickOpenEntries,
  searchFiles,
  SEARCH_MATCH_CAP,
  type FileHost,
} from "../../../src/ScriptEditor/ui/editorSearch";
import { rankResults } from "../../../src/ui/Shell/CommandPalette";

function makeHost(
  hostname: string,
  files: [string, string][],
  access: Partial<Pick<FileHost, "purchasedByPlayer" | "hasAdminRights" | "backdoorInstalled">> = {},
): FileHost {
  return {
    hostname,
    purchasedByPlayer: false,
    hasAdminRights: false,
    backdoorInstalled: false,
    files,
    ...access,
  };
}

describe("collectSearchableFiles (honest multi-server file set)", () => {
  const hosts = [
    makeHost("pserv-3", [["proto-batch.js", "// proto"]], { purchasedByPlayer: true }),
    makeHost("home", [
      ["batcher.js", "// batcher"],
      ["shared/batch-helper.js", "// helper"],
    ]),
    makeHost("locked-server", [["secret.js", "const SECRET = 42;"]]),
    makeHost("rooted", [["hack.js", "// hack"]], { hasAdminRights: true }),
  ];

  it("never includes files from servers without file access (the honesty assertion)", () => {
    const files = collectSearchableFiles(hosts, "home");
    expect(files.some((f) => f.hostname === "locked-server")).toBe(false);
    expect(files.some((f) => f.path === "secret.js")).toBe(false);
  });

  it("puts the current server's files first, then accessible servers alphabetically", () => {
    const files = collectSearchableFiles(hosts, "home");
    expect(files.map((f) => `${f.hostname}:${f.path}`)).toEqual([
      "home:batcher.js",
      "home:shared/batch-helper.js",
      "pserv-3:proto-batch.js",
      "rooted:hack.js",
    ]);
  });

  it("includes the current server even when it would fail the access flags (you are editing on it)", () => {
    const files = collectSearchableFiles([makeHost("home", [["a.js", ""]])], "home");
    expect(files.map((f) => f.path)).toEqual(["a.js"]);
  });
});

describe("quickOpenEntries + rankResults reuse (quick-open ranking)", () => {
  const files = collectSearchableFiles(
    [
      makeHost("home", [
        ["batcher.js", ""],
        ["shared/batch-helper.js", ""],
        ["gang-manager.js", ""],
      ]),
      makeHost("pserv-3", [["proto-batch.js", ""]], { purchasedByPlayer: true }),
    ],
    "home",
  );

  it("builds one entry per file with the path as the ranking label", () => {
    const entries = quickOpenEntries(files);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ label: "batcher.js", hostname: "home", path: "batcher.js" });
    // navIndex is the stable collection order used by rankResults as its tie-break.
    expect(entries.map((e) => e.navIndex)).toEqual([0, 1, 2, 3]);
  });

  it("ranks with the shared palette helper: substring hits by match position, then fuzzy", () => {
    const ranked = rankResults(quickOpenEntries(files), "batch");
    // "batcher.js" (pos 0) before "shared/batch-helper.js" (pos 7) / "proto-batch.js" (pos 6).
    expect(ranked[0].path).toBe("batcher.js");
    const paths = ranked.map((r) => r.path);
    expect(paths).toContain("shared/batch-helper.js");
    expect(paths).toContain("proto-batch.js");
    expect(paths).not.toContain("gang-manager.js");
  });

  it("returns everything in collection order for an empty query", () => {
    const ranked = rankResults(quickOpenEntries(files), "");
    expect(ranked.map((r) => r.path)).toEqual([
      "batcher.js",
      "gang-manager.js",
      "shared/batch-helper.js",
      "proto-batch.js",
    ]);
  });
});

describe("searchFiles (plain-text full-text search)", () => {
  const files = collectSearchableFiles(
    [
      makeHost("home", [
        ["batcher.js", 'const target = "n00dles";\nawait ns.hack(target); // hack the target\n'],
        ["notes.txt", "Target list:\ntarget one\n"],
      ]),
      makeHost("pserv-3", [["proto-batch.js", "// no matches here"]], { purchasedByPlayer: true }),
    ],
    "home",
  );

  it("returns matches grouped by file with 1-based line/column and the line text", () => {
    const result = searchFiles(files, "target", { caseSensitive: true });
    expect(result.capped).toBe(false);
    expect(result.total).toBe(4);
    expect(result.files.map((f) => f.path)).toEqual(["batcher.js", "notes.txt"]);
    const batcher = result.files[0];
    expect(batcher.hostname).toBe("home");
    expect(batcher.matches).toEqual([
      { line: 1, column: 7, lineText: 'const target = "n00dles";' },
      { line: 2, column: 15, lineText: "await ns.hack(target); // hack the target" },
      { line: 2, column: 36, lineText: "await ns.hack(target); // hack the target" },
    ]);
    // Case-sensitive: "Target list:" does not match "target".
    expect(result.files[1].matches).toEqual([{ line: 2, column: 1, lineText: "target one" }]);
  });

  it("matches case-insensitively when the toggle is off", () => {
    const result = searchFiles(files, "target", { caseSensitive: false });
    expect(result.total).toBe(5);
    expect(result.files[1].matches[0]).toEqual({ line: 1, column: 1, lineText: "Target list:" });
  });

  it("is plain text, not regex: metacharacters are literal", () => {
    const result = searchFiles(files, "ns.hack(", { caseSensitive: true });
    expect(result.total).toBe(1);
    expect(result.files[0].matches[0]).toEqual({
      line: 2,
      column: 7,
      lineText: "await ns.hack(target); // hack the target",
    });
  });

  it("returns nothing for an empty query", () => {
    const result = searchFiles(files, "", { caseSensitive: false });
    expect(result).toEqual({ files: [], total: 0, capped: false });
  });

  it("caps total matches with an explicit capped flag (no silent truncation)", () => {
    const many = collectSearchableFiles([makeHost("home", [["spam.js", "x x x x x\nx x\n"]])], "home");
    const capped = searchFiles(many, "x", { caseSensitive: true, cap: 3 });
    expect(capped.capped).toBe(true);
    expect(capped.total).toBe(3);
    expect(capped.files[0].matches).toHaveLength(3);
  });

  it("does not report capped when the match count lands exactly on the cap", () => {
    const exact = collectSearchableFiles([makeHost("home", [["three.js", "y y y"]])], "home");
    const result = searchFiles(exact, "y", { caseSensitive: true, cap: 3 });
    expect(result.capped).toBe(false);
    expect(result.total).toBe(3);
  });

  it("exports the production cap of 500", () => {
    expect(SEARCH_MATCH_CAP).toBe(500);
  });
});
