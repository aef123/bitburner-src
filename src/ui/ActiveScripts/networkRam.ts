/**
 * Pure classification/aggregation module for the Active Scripts (1F) redesign.
 *
 * Everything here is plain data-in/data-out so the network-RAM math is unit-testable
 * without constructing real BaseServer/WorkerScript instances.
 *
 * Classification (per the 1F design notes / Stage 2 exploration facts):
 *   home      — hostname === SpecialServers.Home
 *   hacknet   — isHacknetServer (checked BEFORE purchased: hacknet servers are also
 *               purchasedByPlayer)
 *   purchased — purchasedByPlayer (excluding home/hacknet)
 *   rooted    — hasAdminRights on a foreign server
 *   null      — unrooted foreign servers: the player cannot run scripts there, so their
 *               RAM is not part of the usable network and is excluded from all totals.
 */

import { SpecialServers } from "../../Server/data/SpecialServers";

export type RamCategory = "home" | "purchased" | "rooted" | "hacknet";
export type RamSegmentKey = RamCategory | "free";

/** Structural subset of BaseServer that classification needs (keeps fixtures trivial). */
export interface NetworkRamServer {
  hostname: string;
  isHacknetServer?: boolean;
  purchasedByPlayer: boolean;
  hasAdminRights: boolean;
  ramUsed: number;
  maxRam: number;
}

/** Structural subset of RunningScript that the rate sums need. */
export interface ScriptRateSource {
  onlineMoneyMade: number;
  onlineExpGained: number;
  onlineRunningTime: number;
}

export interface NetworkRamTotals {
  used: Record<RamCategory, number>;
  totalUsed: number;
  totalMax: number;
  free: number;
}

export interface RamBarSegment {
  key: RamSegmentKey;
  fraction: number;
}

/**
 * The mock's stacked-bar palette (design-notes-1F). Only the brightest step has a theme
 * token — home = accentCyan (#4cc9e8), read from the theme at render time. The three
 * darker steps and the free-segment fill have no tokens; per the Stage 1 derivation
 * precedent they live in this ONE data module with their token mapping documented, and
 * never inline in components:
 *   purchased #3aa3c4 — mid-cyan step down from accentCyan (#4cc9e8), no token
 *   rooted    #2b7f9e — teal step down from accentCyan, no token
 *   hacknet   #226779 — darkest teal step down from accentCyan, no token
 *   free      #161e28 — near-empty fill, slightly darker than track (#1a232e), no token
 */
export const RAM_SEGMENT_HEXES: Record<Exclude<RamSegmentKey, "home">, string> = {
  purchased: "#3aa3c4",
  rooted: "#2b7f9e",
  hacknet: "#226779",
  free: "#161e28",
};

/** Mock's stacked-bar order: home → purchased → rooted → hacknet → free. */
const CATEGORY_ORDER: RamCategory[] = ["home", "purchased", "rooted", "hacknet"];

export function classifyServer(server: NetworkRamServer): RamCategory | null {
  if (server.hostname === SpecialServers.Home) return "home";
  if (server.isHacknetServer) return "hacknet";
  if (server.purchasedByPlayer) return "purchased";
  if (server.hasAdminRights) return "rooted";
  return null;
}

export function aggregateNetworkRam(servers: NetworkRamServer[]): NetworkRamTotals {
  const used: Record<RamCategory, number> = { home: 0, purchased: 0, rooted: 0, hacknet: 0 };
  let totalUsed = 0;
  let totalMax = 0;
  for (const server of servers) {
    const category = classifyServer(server);
    if (category === null) continue;
    used[category] += server.ramUsed;
    totalUsed += server.ramUsed;
    totalMax += server.maxRam;
  }
  return { used, totalUsed, totalMax, free: totalMax - totalUsed };
}

/**
 * Segment list for the stacked bar. Zero-width guard: a zero-RAM category yields NO
 * entry at all — rendering an empty segment still costs a 2px flex gap (the phantom-gap
 * bug class from the old dashboard branch).
 */
export function buildRamBarSegments(totals: NetworkRamTotals): RamBarSegment[] {
  if (totals.totalMax <= 0) return [];
  const segments: RamBarSegment[] = [];
  for (const category of CATEGORY_ORDER) {
    const ram = totals.used[category];
    if (ram > 0) segments.push({ key: category, fraction: ram / totals.totalMax });
  }
  if (totals.free > 0) segments.push({ key: "free", fraction: totals.free / totals.totalMax });
  return segments;
}

/** Per-script online rate with a non-positive-time guard (RunningScript floors at 0.01s). */
function rate(amount: number, seconds: number): number {
  return seconds > 0 ? amount / seconds : 0;
}

export function totalMoneyRate(scripts: Iterable<ScriptRateSource>): number {
  let sum = 0;
  for (const s of scripts) sum += rate(s.onlineMoneyMade, s.onlineRunningTime);
  return sum;
}

export function totalExpRate(scripts: Iterable<ScriptRateSource>): number {
  let sum = 0;
  for (const s of scripts) sum += rate(s.onlineExpGained, s.onlineRunningTime);
  return sum;
}
