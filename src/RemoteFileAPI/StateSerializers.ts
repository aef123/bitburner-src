/**
 * Pure, JSON-only serializers for the Remote File API subscription/state topics.
 *
 * Every function here returns plain JSON (no ReactNode, no Map, no class instances) and matches
 * docs/protocol.md field-for-field. These are additive read-only views of game state; they never
 * mutate anything and the game is fully playable without a connection.
 */
import { Player } from "@player";
import type { BaseServer } from "../Server/BaseServer";
import { GetServer } from "../Server/AllServers";
import { HacknetServer } from "../Hacknet/HacknetServer";
import { DarknetServer } from "../Server/DarknetServer";
import { SpecialServers } from "../Server/data/SpecialServers";
import { workerScripts } from "../Netscript/WorkerScripts";
import { CONSTANTS } from "../Constants";
import { Terminal } from "../Terminal";
import { Output, Link, RawOutput } from "../Terminal/OutputTypes";
import { isCrimeWork } from "../Work/CrimeWork";
import { isClassWork } from "../Work/ClassWork";
import { isCreateProgramWork } from "../Work/CreateProgramWork";
import { isGraftingWork } from "../Work/GraftingWork";
import { isFactionWork } from "../Work/FactionWork";
import { isCompanyWork } from "../Work/CompanyWork";
import { Factions } from "../Faction/Factions";
import { getFactionAugmentationsFiltered, hasAugmentationPrereqs } from "../Faction/FactionHelpers";
import { Augmentations } from "../Augmentation/Augmentations";
import { getAugCost, getGenericAugmentationPriceMultiplier } from "../Augmentation/AugmentationHelpers";
import { AugmentationName } from "@enums";

// --- Payload shapes (mirror docs/protocol.md) ---

export interface HudState {
  money: number;
  moneyRate: number | null;
  hackLevel: number;
  hp: { current: number; max: number };
  skills: {
    hacking: number;
    strength: number;
    defense: number;
    dexterity: number;
    agility: number;
    charisma: number;
    intelligence: number;
  };
  city: string;
  location: string;
  processCount: number;
  ramUsed: number;
  ramTotal: number;
  currentWork: { type: string; description: string; etaMs: number | null } | null;
  gangTerritory: number | null;
  numAugQueued: number;
}

export interface NetServer {
  hostname: string;
  parent: string | null;
  depth: number;
  purchasedByPlayer: boolean;
  hasAdminRights: boolean;
  backdoorInstalled: boolean | null;
  requiredHackingSkill: number | null;
  numOpenPortsRequired: number | null;
  maxRam: number;
  ramUsed: number;
  moneyAvailable: number | null;
  moneyMax: number | null;
  hackDifficulty: number | null;
  minDifficulty: number | null;
  organizationName: string;
}

export interface NetworkState {
  current: string;
  servers: NetServer[];
}

export interface RunningScriptInfo {
  pid: number;
  filename: string;
  server: string;
  args: (string | number | boolean)[];
  threads: number;
  ramUsage: number;
  incomePerSec: number;
  expPerSec: number;
  onlineRunningTimeSec: number;
  parentPid: number;
  temporary: boolean;
}

export interface ScriptsState {
  totalIncomePerSec: number;
  totalExpPerSec: number;
  processCount: number;
  scripts: RunningScriptInfo[];
}

export interface TerminalEntry {
  kind: "output" | "link" | "raw";
  text: string;
  color?: string;
}

export interface TerminalState {
  cwdServer: string;
  entries: TerminalEntry[];
  startIndex: number;
  busy: boolean;
}

export interface ScriptLogResult {
  pid: number;
  lines: string[];
  startLine: number;
  running: boolean;
}

// --- Helpers ---

/** Coerce non-finite numbers (NaN/Infinity) to 0 so payloads stay JSON-pure and stable. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Hostname of the currently connected server, falling back to home if unset/invalid. */
function currentServerName(): string {
  const server = GetServer(Player.currentServer);
  return server ? server.hostname : SpecialServers.Home;
}

interface DiscoveredNode {
  server: BaseServer;
  parent: string | null;
  depth: number;
}

/**
 * Discovery-safe BFS over the network, starting at home. This is THE discovery-critical traversal.
 *
 * - Starts at GetServer("home"); resolves neighbors via GetServer over `serversOnNetwork`.
 * - Visited set keyed on hostname (the darknet graph is cyclic + dynamic, so this prevents hangs).
 * - Excludes a neighbor when it is a HacknetServer, or a DarknetServer beyond the DarkWeb gateway,
 *   exactly like scan-analyze's ignoreServer.
 * - Records `parent` = the BFS-discovering server and `depth`. Home is included with parent: null.
 */
function discoverNetwork(): DiscoveredNode[] {
  const home = GetServer(SpecialServers.Home);
  const result: DiscoveredNode[] = [];
  if (!home) return result;

  const visited = new Set<string>([home.hostname]);
  const queue: DiscoveredNode[] = [{ server: home, parent: null, depth: 0 }];

  while (queue.length > 0) {
    const node = queue.shift() as DiscoveredNode;
    result.push(node);
    for (const neighborName of node.server.serversOnNetwork) {
      const neighbor = GetServer(neighborName);
      if (!neighbor) continue;
      if (visited.has(neighbor.hostname)) continue;
      if (neighbor instanceof HacknetServer) continue;
      if (neighbor instanceof DarknetServer && neighbor.hostname !== SpecialServers.DarkWeb) continue;
      visited.add(neighbor.hostname);
      queue.push({ server: neighbor, parent: node.server.hostname, depth: node.depth + 1 });
    }
  }
  return result;
}

function serializeNetServer(server: BaseServer, parent: string | null, depth: number): NetServer {
  return {
    hostname: server.hostname,
    parent,
    depth,
    purchasedByPlayer: server.purchasedByPlayer,
    hasAdminRights: server.hasAdminRights,
    backdoorInstalled: server.backdoorInstalled ?? null,
    requiredHackingSkill: server.requiredHackingSkill ?? null,
    numOpenPortsRequired: server.numOpenPortsRequired ?? null,
    maxRam: server.maxRam,
    ramUsed: server.ramUsed,
    moneyAvailable: server.moneyAvailable ?? null,
    moneyMax: server.moneyMax ?? null,
    hackDifficulty: server.hackDifficulty ?? null,
    minDifficulty: server.minDifficulty ?? null,
    organizationName: server.organizationName,
  };
}

/** Sum of script income per second across all running scripts (Active Scripts page math). */
function scriptIncomePerSec(): number {
  let total = 0;
  for (const ws of workerScripts.values()) {
    total += ws.scriptRef.onlineMoneyMade / ws.scriptRef.onlineRunningTime;
  }
  return finite(total);
}

function serializeCurrentWork(): HudState["currentWork"] {
  const work = Player.currentWork;
  if (!work) return null;
  let description = "";
  let etaMs: number | null = null;
  if (isCrimeWork(work)) description = `Committing ${work.crimeType}`;
  else if (isClassWork(work)) description = work.getClass().youAreCurrently;
  else if (isCreateProgramWork(work)) {
    description = `Creating ${work.programName}`;
    const remaining = work.unitNeeded() - work.unitCompleted;
    etaMs = work.unitRate > 0 ? Math.max(0, (remaining / work.unitRate) * CONSTANTS.MilliPerCycle) : null;
  } else if (isGraftingWork(work)) {
    description = `Grafting ${work.augmentation}`;
    const remaining = work.unitNeeded() - work.unitCompleted;
    etaMs = work.unitRate > 0 ? Math.max(0, (remaining / work.unitRate) * CONSTANTS.MilliPerCycle) : null;
  } else if (isFactionWork(work)) description = `Working for ${work.factionName}`;
  else if (isCompanyWork(work)) description = `Working at ${work.companyName}`;
  return { type: work.type, description, etaMs };
}

// --- Serializers ---

export function serializeHud(): HudState {
  let processCount = 0;
  let ramUsed = 0;
  let ramTotal = 0;
  for (const { server } of discoverNetwork()) {
    if (!server.hasAdminRights) continue;
    ramUsed += server.ramUsed;
    ramTotal += server.maxRam;
    for (const byPid of server.runningScriptMap.values()) {
      processCount += byPid.size;
    }
  }

  return {
    money: Player.money,
    moneyRate: scriptIncomePerSec(),
    hackLevel: Player.skills.hacking,
    hp: { current: Player.hp.current, max: Player.hp.max },
    skills: {
      hacking: Player.skills.hacking,
      strength: Player.skills.strength,
      defense: Player.skills.defense,
      dexterity: Player.skills.dexterity,
      agility: Player.skills.agility,
      charisma: Player.skills.charisma,
      intelligence: Player.skills.intelligence,
    },
    city: Player.city,
    location: Player.location,
    processCount,
    ramUsed,
    ramTotal,
    currentWork: serializeCurrentWork(),
    gangTerritory: Player.gang ? Player.gang.getTerritory() : null,
    numAugQueued: Player.queuedAugmentations.length,
  };
}

export function serializeNetwork(): NetworkState {
  const servers = discoverNetwork().map(({ server, parent, depth }) => serializeNetServer(server, parent, depth));
  return { current: currentServerName(), servers };
}

export function serializeRunningScripts(): ScriptsState {
  const scripts: RunningScriptInfo[] = [];
  let totalIncomePerSec = 0;
  let totalExpPerSec = 0;

  for (const ws of workerScripts.values()) {
    const rs = ws.scriptRef;
    const incomePerSec = finite(rs.onlineMoneyMade / rs.onlineRunningTime);
    const expPerSec = finite(rs.onlineExpGained / rs.onlineRunningTime);
    totalIncomePerSec += incomePerSec;
    totalExpPerSec += expPerSec;
    scripts.push({
      pid: ws.pid,
      filename: rs.filename,
      server: rs.server,
      args: rs.args.slice() as (string | number | boolean)[],
      threads: rs.threads,
      ramUsage: rs.ramUsage,
      incomePerSec,
      expPerSec,
      onlineRunningTimeSec: rs.onlineRunningTime,
      parentPid: rs.parent,
      temporary: rs.temporary,
    });
  }

  return {
    totalIncomePerSec: finite(totalIncomePerSec),
    totalExpPerSec: finite(totalExpPerSec),
    processCount: workerScripts.size,
    scripts,
  };
}

/**
 * Map a single terminal output-history item to a JSON-pure TerminalEntry.
 * Exported so GameActionHandlers can reuse it without duplicating the mapping logic.
 */
export function mapTerminalEntry(item: Output | Link | RawOutput): TerminalEntry {
  if (item instanceof Output) return { kind: "output", text: item.text, color: item.color };
  if (item instanceof Link) return { kind: "link", text: item.hostname };
  // RawOutput — never attempt to serialize the ReactNode.
  return { kind: "raw", text: "" };
}

export function serializeTerminal(afterIndex?: number): TerminalState {
  const history = Terminal.outputHistory;
  const start = afterIndex != null ? Math.max(0, Math.min(afterIndex, history.length)) : 0;
  const entries: TerminalEntry[] = history.slice(start).map(mapTerminalEntry);
  return {
    cwdServer: currentServerName(),
    entries,
    startIndex: start,
    busy: Terminal.action !== null,
  };
}

export function serializeScriptLog(pid: number, afterLine?: number): ScriptLogResult {
  const ws = workerScripts.get(pid);
  const logs = ws ? ws.scriptRef.logs : [];
  const start = afterLine != null ? Math.max(0, Math.min(afterLine, logs.length)) : 0;
  const lines = logs.slice(start).map((node) => (typeof node === "string" ? node : ""));
  return { pid, lines, startLine: start, running: ws != null };
}

// --- Factions state shapes (mirror docs/protocol.md) ---

export interface AugmentDto {
  name: string;
  owned: boolean;
  queued: boolean;
  repReq: number;
  price: number;
  basePrice: number;
  statsDescription: string;
  prereqs: string[];
  prereqsMet: boolean;
}

export interface FactionInfoDto {
  name: string;
  reputation: number;
  favor: number;
  augments: AugmentDto[];
}

export interface QueuedAug {
  name: string;
  /** Best-effort: the faction this aug was queued from. The game does not store the origin faction,
   *  so this is the first joined faction that currently offers it, or "" if unknown. */
  faction: string;
}

export interface FactionsState {
  joined: FactionInfoDto[];
  invitations: string[];
  rumors: string[];
  augQueue: QueuedAug[];
  priceMultiplier: number;
}

export interface InstallPreview {
  augs: { name: string; faction: string; price: number }[];
  totalPrice: number;
  effectSummary: string[];
}

/**
 * Best-effort: return the first joined faction that currently offers this augmentation, or "" if none.
 * The game does not store which faction an aug was purchased from (no production cancel/pop helper),
 * so this is a heuristic based on current faction membership and offering lists.
 */
function resolveAugFaction(augName: AugmentationName): string {
  for (const factionName of Player.factions) {
    if (getFactionAugmentationsFiltered(Factions[factionName]).includes(augName)) {
      return factionName;
    }
  }
  return "";
}

/**
 * Serialize the player's faction state per docs/protocol.md FactionsState shape.
 *
 * NFG (NeuroFluxGovernor) is repeatable and never permanently "owned" — it is intentionally
 * not marked owned=true even when present in Player.augmentations, so it keeps appearing as
 * purchasable in the extension UI.
 */
export function serializeFactions(): FactionsState {
  const joined: FactionInfoDto[] = Player.factions.map((factionName) => {
    const faction = Factions[factionName];
    const augNames = getFactionAugmentationsFiltered(faction);
    const augments: AugmentDto[] = augNames.map((augName) => {
      const aug = Augmentations[augName];
      const costs = getAugCost(aug);
      // NFG is repeatable — do not mark it permanently owned; it must keep appearing as purchasable.
      const isNFG = augName === AugmentationName.NeuroFluxGovernor;
      const owned = isNFG ? false : Player.augmentations.some((a) => a.name === augName);
      const queued = Player.queuedAugmentations.some((a) => a.name === augName);
      return {
        name: augName,
        owned,
        queued,
        repReq: finite(costs.repCost),
        price: finite(costs.moneyCost),
        basePrice: finite(aug.baseCost),
        statsDescription: aug.stats,
        prereqs: aug.prereqs.slice(),
        prereqsMet: hasAugmentationPrereqs(aug),
      };
    });
    return {
      name: factionName,
      reputation: finite(faction.playerReputation),
      favor: finite(faction.favor),
      augments,
    };
  });

  // Best-effort faction lookup for each queued aug (origin faction not stored in save)
  const augQueue: QueuedAug[] = Player.queuedAugmentations.map((qa) => ({
    name: qa.name,
    faction: resolveAugFaction(qa.name),
  }));

  return {
    joined,
    invitations: Player.factionInvitations.slice(),
    rumors: [...Player.factionRumors],
    augQueue,
    priceMultiplier: finite(getGenericAugmentationPriceMultiplier()),
  };
}

/**
 * Build an install preview for the currently queued augmentations.
 *
 * Prices are recomputed via getAugCost at the time of the call — the game does not persist
 * the price paid at queue time, so the values shown reflect the current escalation order.
 * effectSummary is a simple concatenation of each aug's stats field (v1 implementation).
 */
export function serializeInstallPreview(): InstallPreview {
  const augs = Player.queuedAugmentations.map((qa) => {
    const aug = Augmentations[qa.name];
    const costs = getAugCost(aug);
    return {
      name: qa.name,
      faction: resolveAugFaction(qa.name),
      price: finite(costs.moneyCost),
    };
  });
  const totalPrice = finite(augs.reduce((sum, a) => sum + a.price, 0));
  const effectSummary = Player.queuedAugmentations.map((qa) => Augmentations[qa.name].stats);
  return { augs, totalPrice, effectSummary };
}
