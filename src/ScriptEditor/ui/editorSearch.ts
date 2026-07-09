/**
 * Data layer for the script editor's quick-open and full-text search (Task 12, 2C part 2).
 *
 * The searchable file space is the SAME honest server set the explorer panel shows
 * (filterEditorAccessibleServers: purchased / backdoored / admin — see explorerTree.ts for the
 * rule and its justification), plus the current script's server. The pure functions here take
 * structural fixtures so the honesty rule and the search mechanics are directly unit-testable;
 * getLiveSearchableFiles is the one thin adapter over live game state.
 *
 * Search is plain-text, NOT regex (v1 — documented in the plan): metacharacters are literal,
 * matches within a line are non-overlapping, and positions are 1-based line/column to match
 * monaco's conventions. Results are capped (SEARCH_MATCH_CAP) with an explicit `capped` flag so
 * the UI can say so — no silent truncation.
 */

import type { BaseServer } from "../../Server/BaseServer";

import { GetAllServers, GetServer } from "../../Server/AllServers";
import { allContentFiles } from "../../Paths/ContentFile";
import { filterEditorAccessibleServers, type ServerAccessInfo } from "./explorerTree";

// ─── Types ────────────────────────────────────────────────────────────────

/** A server plus its content files, in the structural shape the pure collectors need. */
export interface FileHost extends ServerAccessInfo {
  /** [path, content] pairs for every content file (scripts + text files) on the server. */
  files: Iterable<readonly [string, string]>;
}

export interface SearchableFile {
  hostname: string;
  path: string;
  content: string;
}

/** One quick-open row; `label`/`navIndex` are the shape the shared rankResults helper ranks on. */
export interface QuickOpenEntry {
  label: string;
  navIndex: number;
  hostname: string;
  path: string;
}

export interface SearchMatch {
  /** 1-based, matching monaco positions. */
  line: number;
  /** 1-based, matching monaco positions. */
  column: number;
  /** The full text of the matched line (for the preview row). */
  lineText: string;
}

export interface FileSearchResult {
  hostname: string;
  path: string;
  matches: SearchMatch[];
}

export interface SearchResults {
  files: FileSearchResult[];
  total: number;
  /** true = the cap was hit and at least one further match exists (say so in the UI). */
  capped: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Hard ceiling on total matches per search; the UI shows an explicit "capped" notice. */
export const SEARCH_MATCH_CAP = 500;

// ─── Pure functions ───────────────────────────────────────────────────────

/**
 * Flatten servers into the ordered searchable file set: the current server's files first (you are
 * editing on it — it is accessible by definition, whatever its flags say), then every server that
 * passes the explorer's honest access rule, alphabetically (filterEditorAccessibleServers sorts).
 * Files within each server are sorted alphabetically too: server Maps iterate in file-creation
 * order, which is meaningless to the player.
 */
export function collectSearchableFiles(hosts: FileHost[], currentHostname: string): SearchableFile[] {
  const current = hosts.find((host) => host.hostname === currentHostname);
  const ordered = [...(current ? [current] : []), ...filterEditorAccessibleServers(hosts, currentHostname)];
  const out: SearchableFile[] = [];
  for (const host of ordered) {
    const files: SearchableFile[] = [];
    for (const [path, content] of host.files) {
      files.push({ hostname: host.hostname, path, content });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    out.push(...files);
  }
  return out;
}

/** Map the searchable file set to quick-open rows; navIndex = collection order (rank tie-break). */
export function quickOpenEntries(files: SearchableFile[]): QuickOpenEntry[] {
  return files.map((file, index) => ({
    label: file.path,
    navIndex: index,
    hostname: file.hostname,
    path: file.path,
  }));
}

/**
 * Plain-text search over the file set. Non-overlapping matches per line, 1-based positions.
 * Stops scanning as soon as it can prove the cap was exceeded (finds cap + 1 matches), keeping the
 * first `cap` — so `capped` is only true when a further match really exists.
 */
export function searchFiles(
  files: SearchableFile[],
  query: string,
  { caseSensitive, cap = SEARCH_MATCH_CAP }: { caseSensitive: boolean; cap?: number },
): SearchResults {
  if (query === "") {
    return { files: [], total: 0, capped: false };
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  const results: FileSearchResult[] = [];
  let total = 0;

  for (const file of files) {
    let fileResult: FileSearchResult | null = null;
    const lines = file.content.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
      const haystack = caseSensitive ? lines[lineIndex] : lines[lineIndex].toLowerCase();
      let matchIndex = haystack.indexOf(needle);
      while (matchIndex !== -1) {
        if (total === cap) {
          return { files: results, total, capped: true };
        }
        if (fileResult === null) {
          fileResult = { hostname: file.hostname, path: file.path, matches: [] };
          results.push(fileResult);
        }
        fileResult.matches.push({ line: lineIndex + 1, column: matchIndex + 1, lineText: lines[lineIndex] });
        ++total;
        matchIndex = haystack.indexOf(needle, matchIndex + needle.length);
      }
    }
  }
  return { files: results, total, capped: false };
}

// ─── Live adapter ─────────────────────────────────────────────────────────

/** Adapt live game servers to FileHost and collect the searchable file set. */
export function getLiveSearchableFiles(currentHostname: string): SearchableFile[] {
  const toFileHost = (server: BaseServer): FileHost => ({
    hostname: server.hostname,
    purchasedByPlayer: server.purchasedByPlayer,
    hasAdminRights: server.hasAdminRights,
    // Only normal Servers have backdoorInstalled; structurally optional, exactly like the explorer.
    backdoorInstalled: (server as { backdoorInstalled?: boolean }).backdoorInstalled,
    files: (function* () {
      for (const [path, file] of allContentFiles(server)) {
        yield [String(path), file.content] as const;
      }
    })(),
  });
  // GetAllServers() already contains the current server; mapping it once is enough — collect
  // reorders it to the front. Guard for a missing current server (deleted pserv edge case).
  const hosts = GetAllServers().map(toFileHost);
  if (GetServer(currentHostname) === null) {
    return collectSearchableFiles(
      hosts.filter((host) => host.hostname !== currentHostname),
      currentHostname,
    );
  }
  return collectSearchableFiles(hosts, currentHostname);
}
