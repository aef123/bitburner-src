/**
 * Tests for the script-editor explorer tree builder (Task 11, 2C part 1).
 *
 * Two pure pieces are covered:
 * - buildFileTree: groups a server's file paths (scripts Map keys + textFiles Map keys) into a
 *   nested folder tree with deterministic ordering (folders first, then files, both alphabetical).
 * - filterEditorAccessibleServers: the honest "OTHER SERVERS" filter. Rule: a server appears only
 *   if the player has guaranteed file access — purchased by player, backdoor installed, or admin
 *   rights. This is a conservative proxy: in-game file access is actually broader (nano/rm work on
 *   any connected server without root; only `run` gates on admin rights), so the filter can only
 *   under-represent — it never shows a server the player can't touch. Output is sorted
 *   alphabetically by hostname.
 */

import {
  buildFileTree,
  filterEditorAccessibleServers,
  type ServerAccessInfo,
} from "../../../src/ScriptEditor/ui/explorerTree";

describe("buildFileTree", () => {
  it("returns an empty root for no files", () => {
    const tree = buildFileTree([]);
    expect(tree.files).toEqual([]);
    expect(tree.folders).toEqual([]);
  });

  it("groups files by folder, keeping full paths on the leaves", () => {
    const tree = buildFileTree([
      "bootstrap.js",
      "shared/logger.js",
      "shared/batch-helper.js",
      "batcher.js",
      "notes.txt",
    ]);
    expect(tree.files).toEqual(["batcher.js", "bootstrap.js", "notes.txt"]);
    expect(tree.folders).toHaveLength(1);
    const shared = tree.folders[0];
    expect(shared.name).toBe("shared/");
    expect(shared.fullPath).toBe("shared/");
    expect(shared.files).toEqual(["shared/batch-helper.js", "shared/logger.js"]);
  });

  it("supports nested folders", () => {
    const tree = buildFileTree(["a/b/deep.js", "a/top.js", "root.js"]);
    expect(tree.files).toEqual(["root.js"]);
    const a = tree.folders[0];
    expect(a.name).toBe("a/");
    expect(a.files).toEqual(["a/top.js"]);
    expect(a.folders).toHaveLength(1);
    expect(a.folders[0].name).toBe("b/");
    expect(a.folders[0].fullPath).toBe("a/b/");
    expect(a.folders[0].files).toEqual(["a/b/deep.js"]);
  });

  it("sorts folders alphabetically before files", () => {
    const tree = buildFileTree(["z.js", "beta/x.js", "alpha/y.js"]);
    expect(tree.folders.map((f) => f.name)).toEqual(["alpha/", "beta/"]);
    expect(tree.files).toEqual(["z.js"]);
  });
});

describe("filterEditorAccessibleServers (honest OTHER SERVERS rule)", () => {
  function makeServer(overrides: Partial<ServerAccessInfo> & { hostname: string }): ServerAccessInfo {
    return {
      purchasedByPlayer: false,
      hasAdminRights: false,
      backdoorInstalled: false,
      ...overrides,
    };
  }

  it("includes purchased, backdoored, and admin servers; excludes everything else; sorts by hostname", () => {
    const servers = [
      makeServer({ hostname: "pserv-1", purchasedByPlayer: true }),
      makeServer({ hostname: "backdoored", backdoorInstalled: true }),
      makeServer({ hostname: "rooted", hasAdminRights: true }),
      makeServer({ hostname: "locked" }),
    ];
    const result = filterEditorAccessibleServers(servers, "home");
    expect(result.map((s) => s.hostname)).toEqual(["backdoored", "pserv-1", "rooted"]);
  });

  it("excludes the current server (it has its own FILES section)", () => {
    const servers = [
      makeServer({ hostname: "home", purchasedByPlayer: true }),
      makeServer({ hostname: "pserv-1", purchasedByPlayer: true }),
    ];
    const result = filterEditorAccessibleServers(servers, "home");
    expect(result.map((s) => s.hostname)).toEqual(["pserv-1"]);
  });

  it("treats a missing backdoorInstalled field (non-Server hosts) as no backdoor", () => {
    const hacknet: ServerAccessInfo = { hostname: "hacknet-node-0", purchasedByPlayer: false, hasAdminRights: false };
    expect(filterEditorAccessibleServers([hacknet], "home")).toEqual([]);
  });
});
