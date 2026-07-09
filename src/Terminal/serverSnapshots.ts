/**
 * UI-layer server "revelation" snapshots (Task 9, 2A part 2).
 *
 * When `analyze` or `scan-analyze` completes, it captures the stats it just printed to the
 * terminal into this map. The terminal's target panel then renders money/security bars ONLY from
 * these snapshots — never from the live Server object — so the panel can only show what the
 * player has already been shown, frozen at the moment they saw it.
 *
 * Deliberately runtime-only and NOT saved: this is a derived-state cache of information that was
 * already printed to the (also unsaved) terminal output. Persisting it would mean inventing a new
 * save field for data the game never kept, and a stale post-reload snapshot would claim "as of
 * analyze · HH:MM" for an analyze that happened in a previous session. It dies on reload honestly,
 * and the panel falls back to its UNDISCOVERED state until the player runs analyze again.
 */

import type { Server } from "../Server/Server";

export interface ServerSnapshot {
  moneyAvailable: number;
  moneyMax: number;
  hackDifficulty: number;
  minDifficulty: number;
  requiredHackingSkill: number;
  numOpenPortsRequired: number;
  openPortCount: number;
  maxRam: number;
  /** Date.now() epoch ms at capture time; rendered as HH:mm in the target panel's stamp. */
  timestamp: number;
}

const snapshots = new Map<string, ServerSnapshot>();

/**
 * Capture a server's stats at analyze / scan-analyze completion. Values are copied, not
 * referenced: the snapshot must stay frozen while the live server keeps changing.
 */
export function recordServerSnapshot(server: Server, timestamp: number = Date.now()): void {
  snapshots.set(server.hostname, {
    moneyAvailable: server.moneyAvailable,
    moneyMax: server.moneyMax,
    hackDifficulty: server.hackDifficulty,
    minDifficulty: server.minDifficulty,
    requiredHackingSkill: server.requiredHackingSkill,
    numOpenPortsRequired: server.numOpenPortsRequired,
    openPortCount: server.openPortCount,
    maxRam: server.maxRam,
    timestamp,
  });
}

export function getServerSnapshot(hostname: string): ServerSnapshot | undefined {
  return snapshots.get(hostname);
}

/** Drop everything. Called on prestige (servers reset, so old snapshots would be lies) and by tests. */
export function clearServerSnapshots(): void {
  snapshots.clear();
}
