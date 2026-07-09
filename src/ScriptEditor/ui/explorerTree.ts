/**
 * Pure helpers for the script-editor explorer panel (Task 11, 2C part 1).
 *
 * Kept free of monaco/React imports so the tree building and the OTHER SERVERS access rule are
 * directly testable in jsdom (monaco is NullMock'd in jest).
 */

export interface FileTreeFolder {
  /** Display segment with a trailing slash, e.g. "shared/". */
  name: string;
  /** Full folder prefix from the root, e.g. "shared/utils/". */
  fullPath: string;
  folders: FileTreeFolder[];
  /** Full file paths (not basenames), sorted alphabetically. */
  files: string[];
}

/** Group a server's file paths (scripts + textFiles Map keys) into a nested folder tree. */
export function buildFileTree(paths: Iterable<string>): FileTreeFolder {
  const root: FileTreeFolder = { name: "", fullPath: "", folders: [], files: [] };
  for (const path of paths) {
    const segments = path.split("/");
    let node = root;
    for (let i = 0; i < segments.length - 1; ++i) {
      const name = segments[i] + "/";
      let child = node.folders.find((folder) => folder.name === name);
      if (!child) {
        child = { name, fullPath: node.fullPath + name, folders: [], files: [] };
        node.folders.push(child);
      }
      node = child;
    }
    node.files.push(path);
  }
  sortTree(root);
  return root;
}

function sortTree(node: FileTreeFolder): void {
  node.folders.sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.localeCompare(b));
  for (const folder of node.folders) {
    sortTree(folder);
  }
}

/** Structural subset of BaseServer/Server needed for the access rule (keeps the fn pure/testable). */
export interface ServerAccessInfo {
  hostname: string;
  purchasedByPlayer: boolean;
  hasAdminRights: boolean;
  /** Only normal Servers have this field; non-Server hosts (hacknet, etc.) simply lack it. */
  backdoorInstalled?: boolean;
}

/**
 * The honest OTHER SERVERS rule: list only servers where the player has real file access —
 * purchased by the player, backdoor installed, or admin rights.
 *
 * Precedent: addReachableServerNames in src/Terminal/getTabCompletionPossibilities.ts:117-129 uses
 * backdoored/purchased/adjacent for `connect` completion. The explorer deliberately swaps the
 * "adjacent on network" clause for hasAdminRights: adjacency is transient connectivity for the
 * connect command, while this panel claims file access, which admin rights actually grant
 * (run/nano/rm all gate on root).
 *
 * The current script's own server is excluded — it has the dedicated FILES section above.
 */
export function filterEditorAccessibleServers<T extends ServerAccessInfo>(servers: T[], excludeHostname: string): T[] {
  return servers.filter(
    (server) =>
      server.hostname !== excludeHostname &&
      (server.purchasedByPlayer || server.hasAdminRights || server.backdoorInstalled === true),
  );
}
