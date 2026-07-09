/**
 * UI-layer server "revelation" snapshots (Task 9, 2A part 2).
 *
 * When `analyze` or `scan-analyze` completes, it captures the stats it just printed to the
 * terminal into this map. The terminal's target panel then renders money/security bars ONLY from
 * these snapshots — never from the live Server object — so the panel can only show what the
 * player has already been shown, frozen at the moment they saw it.
 *
 * The two commands print different things, so they record different snapshot shapes:
 * - `analyze` prints money and security → it records a FULL snapshot (source: "analyze").
 * - `scan-analyze` prints only root access / required skill / ports-to-NUKE / RAM → it records a
 *   PARTIAL snapshot (source: "scan-analyze") with NO money/security fields at all. Recording the
 *   full stats here would let the panel show values the player never saw — the exact leak this
 *   split exists to prevent.
 *
 * Overwrite semantics (chosen and tested): analyze always overwrites (it re-prints everything, so
 * a fresh full snapshot is always honest). scan-analyze overwrites nothing when a full snapshot
 * already exists — the panel renders no partial-only field from the snapshot (its always-known
 * facts come from the live server), so "merging" a scan into a full snapshot would either falsify
 * the full snapshot's timestamp or force per-field timestamps for zero rendered benefit. A partial
 * may replace another partial (same shape, fresher timestamp).
 *
 * Deliberately runtime-only and NOT saved: this is a derived-state cache of information that was
 * already printed to the (also unsaved) terminal output. Persisting it would mean inventing a new
 * save field for data the game never kept, and a stale post-reload snapshot would claim "as of
 * analyze · HH:MM" for an analyze that happened in a previous session. It dies on reload honestly,
 * and the panel falls back to its UNDISCOVERED state until the player runs analyze again.
 */

import type { Server } from "../Server/Server";

/** Fields both commands print (plus timestamp). */
interface BaseSnapshot {
  requiredHackingSkill: number;
  numOpenPortsRequired: number;
  openPortCount: number;
  maxRam: number;
  /** Date.now() epoch ms at capture time; rendered as HH:mm in the target panel's stamp. */
  timestamp: number;
}

/** Recorded by `analyze`, which prints money and security. */
export interface FullServerSnapshot extends BaseSnapshot {
  source: "analyze";
  moneyAvailable: number;
  moneyMax: number;
  hackDifficulty: number;
  minDifficulty: number;
}

/** Recorded by `scan-analyze`, which never prints money or security — so neither does this. */
export interface PartialServerSnapshot extends BaseSnapshot {
  source: "scan-analyze";
}

export type ServerSnapshot = FullServerSnapshot | PartialServerSnapshot;

const snapshots = new Map<string, ServerSnapshot>();

function baseFields(server: Server, timestamp: number): BaseSnapshot {
  return {
    requiredHackingSkill: server.requiredHackingSkill,
    numOpenPortsRequired: server.numOpenPortsRequired,
    openPortCount: server.openPortCount,
    maxRam: server.maxRam,
    timestamp,
  };
}

/**
 * Capture a server's full stats at `analyze` completion. Values are copied, not referenced: the
 * snapshot must stay frozen while the live server keeps changing. Always overwrites — analyze
 * re-prints everything, so the fresh snapshot is always at least as honest as what it replaces.
 */
export function recordServerSnapshot(server: Server, timestamp: number = Date.now()): void {
  snapshots.set(server.hostname, {
    source: "analyze",
    moneyAvailable: server.moneyAvailable,
    moneyMax: server.moneyMax,
    hackDifficulty: server.hackDifficulty,
    minDifficulty: server.minDifficulty,
    ...baseFields(server, timestamp),
  });
}

/**
 * Capture only what `scan-analyze` printed. Never downgrades: if the player already ran analyze
 * on this host, the full snapshot (and its honest stamp) stays untouched — see the overwrite
 * semantics in the file comment.
 */
export function recordPartialServerSnapshot(server: Server, timestamp: number = Date.now()): void {
  const existing = snapshots.get(server.hostname);
  if (existing !== undefined && existing.source === "analyze") return;
  snapshots.set(server.hostname, {
    source: "scan-analyze",
    ...baseFields(server, timestamp),
  });
}

export function getServerSnapshot(hostname: string): ServerSnapshot | undefined {
  return snapshots.get(hostname);
}

/** Drop everything. Called on prestige (servers reset, so old snapshots would be lies) and by tests. */
export function clearServerSnapshots(): void {
  snapshots.clear();
}
