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
import { FactionInfos } from "../Faction/FactionInfo";
import { Augmentations } from "../Augmentation/Augmentations";
import { getAugCost, getGenericAugmentationPriceMultiplier } from "../Augmentation/AugmentationHelpers";
import { AugmentationName, GoColor, CityName, BladeburnerActionType, LocationType, UniversityClassType, GymType, CrimeType, FactionWorkType, CompanyName } from "@enums";
import { AllGangs } from "../Gang/AllGangs";
import { Go } from "../Go/Go";
import { simpleBoardFromBoard, getPreviousMove } from "../Go/boardAnalysis/boardAnalysis";
import { getScore } from "../Go/boardAnalysis/scoring";
import { Cities } from "../Locations/Cities";
import { Locations } from "../Locations/Locations";
import { Crimes } from "../Crime/Crimes";
import { Classes } from "../Work/ClassWork";
import { calculateCost as calculateClassCost, calculateFactionRep, calculateFactionExp } from "../Work/Formulas";
import { getCloudServerCost, getCloudServerMaxRam } from "../Server/ServerPurchases";
import { GangMemberUpgrades } from "../Gang/GangMemberUpgrades";
import { StockMarket } from "../StockMarket/StockMarket";
import { Stock } from "../StockMarket/Stock";
import { HacknetNode } from "../Hacknet/HacknetNode";
import {
  hasHacknetServers,
  getCostOfNextHacknetNode,
  getCostOfNextHacknetServer,
} from "../Hacknet/HacknetHelpers";
import { calculateMoneyGainRate } from "../Hacknet/formulas/HacknetNodes";
import { calculateHashGainRate } from "../Hacknet/formulas/HacknetServers";
import { HacknetNodeConstants, HacknetServerConstants } from "../Hacknet/data/Constants";
import { ServerConstants } from "../Server/data/Constants";
import type { Sleeve } from "../PersonObjects/Sleeve/Sleeve";
import { SleeveWorkType } from "../PersonObjects/Sleeve/Work/Work";
import type { Division } from "../Corporation/Division";
import { Companies } from "../Company/Companies";
import { CompanyPositions } from "../Company/CompanyPositions";

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

// --- React node → plain text extractor ---

const REACT_TEXT_MAX_DEPTH = 15;
const REACT_TEXT_MAX_LEN = 8192;

/**
 * Recursively extract plain text from a React node (or any unknown value).
 *
 * - string/number → String(node)
 * - boolean/null/undefined → ""
 * - Array → map children, skip empty parts, join with " "
 * - React element (object with .props.children) → recurse into children
 * - Depth cap of 15 and total length cap of 8 192 chars prevent runaway traversal.
 * - Never throws; all branches are wrapped in try/catch.
 *
 * Used by mapTerminalEntry so that RawOutput entries (e.g. from `ls`/`scan` which
 * call Terminal.printRaw with SegmentGrid/span trees) produce readable plain text
 * for remote clients instead of empty strings.
 */
export function reactNodeToText(node: unknown, depth = 0): string {
  try {
    if (depth > REACT_TEXT_MAX_DEPTH) return "";
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string") return node.slice(0, REACT_TEXT_MAX_LEN);
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) {
      const parts: string[] = [];
      for (const child of node) {
        const part = reactNodeToText(child, depth + 1);
        if (part) parts.push(part);
      }
      return parts.join(" ").slice(0, REACT_TEXT_MAX_LEN);
    }
    // React element: plain object with a `props` property containing `children`.
    if (typeof node === "object" && "props" in (node as object)) {
      const props = (node as { props?: unknown }).props;
      if (props !== null && props !== undefined && typeof props === "object" && "children" in (props as object)) {
        return reactNodeToText((props as { children: unknown }).children, depth + 1);
      }
    }
    return "";
  } catch {
    return "";
  }
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

export function serializeCurrentWork(): HudState["currentWork"] {
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
  // RawOutput: extract plain text from the React node tree so remote clients see filenames
  // from `ls`/`scan` (which call Terminal.printRaw(<SegmentGrid>…</SegmentGrid>)) instead
  // of empty strings.
  return { kind: "raw", text: reactNodeToText(item.raw) };
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

/** Per-work-type gain rates for a faction, computed from the same formulas as the WIP screen. */
export interface FactionWorkRate {
  type: "hacking" | "field" | "security";
  /** Whether the faction offers this work type (FactionInfo.offer* flag). */
  available: boolean;
  /** Reputation gain per second (includes player multipliers and share bonus). */
  repPerSec: number;
  /** Exp gain per second for each stat. */
  expPerSec: {
    hacking: number;
    strength: number;
    defense: number;
    dexterity: number;
    agility: number;
    charisma: number;
  };
}

export interface FactionInfoDto {
  name: string;
  reputation: number;
  favor: number;
  augments: AugmentDto[];
  /** Work-type rates for each of the three faction work types (always all three entries). */
  workRates: FactionWorkRate[];
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
/** Cycles-per-second constant for converting per-cycle rates to per-second. */
const GAME_CPS = 1000 / CONSTANTS.MilliPerCycle;

/** The three faction work types in a stable order. */
const FACTION_WORK_TYPES = [FactionWorkType.hacking, FactionWorkType.field, FactionWorkType.security] as const;

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

    // Work rates per type: same formulas as FactionWork.getReputationRate/getExpRates.
    const info = FactionInfos[factionName];
    const workRates: FactionWorkRate[] = FACTION_WORK_TYPES.map((wt) => {
      const repPerCycle = calculateFactionRep(Player, wt, faction.favor);
      const expStats = calculateFactionExp(Player, wt);
      return {
        type: wt as "hacking" | "field" | "security",
        available:
          wt === FactionWorkType.hacking
            ? info.offerHackingWork
            : wt === FactionWorkType.field
            ? info.offerFieldWork
            : info.offerSecurityWork,
        repPerSec: finite(repPerCycle * GAME_CPS),
        expPerSec: {
          hacking: finite(expStats.hackExp * GAME_CPS),
          strength: finite(expStats.strExp * GAME_CPS),
          defense: finite(expStats.defExp * GAME_CPS),
          dexterity: finite(expStats.dexExp * GAME_CPS),
          agility: finite(expStats.agiExp * GAME_CPS),
          charisma: finite(expStats.chaExp * GAME_CPS),
        },
      };
    });

    return {
      name: factionName,
      reputation: finite(faction.playerReputation),
      favor: finite(faction.favor),
      augments,
      workRates,
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

// --- Gang state shapes (mirror docs/protocol.md) ---

export interface GangMemberDto {
  name: string;
  task: string;
  stats: Record<"hack" | "str" | "def" | "dex" | "agi" | "cha", number>;
  ascensionResults: Record<"hack" | "str" | "def" | "dex" | "agi" | "cha", number> | null;
  moneyRate: number;
  respectRate: number;
  equipment: string[];
}

export interface GangEquipmentEntry {
  name: string;
  cost: number;
  type: string;
}

export interface GangState {
  faction: string;
  isHacking: boolean;
  respect: number;
  respectRate: number;
  wanted: number;
  wantedRate: number;
  wantedPenalty: number;
  moneyRate: number;
  territory: number;
  territoryClashChance: number;
  power: number;
  members: GangMemberDto[];
  taskNames: string[];
  otherGangs: { name: string; territory: number; power: number }[];
  equipmentCatalog: GangEquipmentEntry[];
}

/**
 * Serialize the player's gang state per docs/protocol.md GangState shape.
 * Returns null if the player is not in a gang.
 *
 * Rates stored per-cycle are converted to per-second (×1000/MilliPerCycle).
 * Non-finite values are coerced to 0 via finite().
 */
export function serializeGang(): GangState | null {
  const gang = Player.gang;
  if (!gang) return null;

  const cycleToSec = 1000 / CONSTANTS.MilliPerCycle;

  const members: GangMemberDto[] = gang.members.map((member) => {
    const raw = member.canAscend() ? member.getAscensionResults() : null;
    const ascensionResults = raw
      ? {
          hack: finite(raw.hack),
          str: finite(raw.str),
          def: finite(raw.def),
          dex: finite(raw.dex),
          agi: finite(raw.agi),
          cha: finite(raw.cha),
        }
      : null;

    return {
      name: member.name,
      task: member.task,
      stats: {
        hack: member.hack,
        str: member.str,
        def: member.def,
        dex: member.dex,
        agi: member.agi,
        cha: member.cha,
      },
      ascensionResults,
      moneyRate: finite(member.calculateMoneyGain(gang) * cycleToSec),
      respectRate: finite(member.calculateRespectGain(gang) * cycleToSec),
      equipment: member.upgrades.slice(),
    };
  });

  const otherGangs = Object.entries(AllGangs)
    .filter(([name]) => name !== gang.facName)
    .map(([name, info]) => ({
      name,
      territory: finite(info.territory),
      power: finite(info.power),
    }));

  const equipmentCatalog: GangEquipmentEntry[] = Object.values(GangMemberUpgrades).map((upg) => ({
    name: upg.name,
    cost: finite(gang.getUpgradeCost(upg)),
    type: upg.getType(),
  }));

  return {
    faction: gang.facName,
    isHacking: gang.isHackingGang,
    respect: finite(gang.respect),
    respectRate: finite(gang.respectGainRate * cycleToSec),
    wanted: finite(gang.wanted),
    wantedRate: finite(gang.wantedGainRate * cycleToSec),
    wantedPenalty: finite(gang.getWantedPenalty()),
    moneyRate: finite(gang.moneyGainRate * cycleToSec),
    territory: finite(gang.getTerritory()),
    territoryClashChance: finite(gang.territoryClashChance),
    power: finite(gang.getPower()),
    members,
    taskNames: gang.getAllTaskNames(),
    otherGangs,
    equipmentCatalog,
  };
}

// --- Stocks state shapes (mirror docs/protocol.md) ---

export interface StockDto {
  symbol: string;
  org: string;
  price: number;
  askPrice: number;
  bidPrice: number;
  playerShares: number;
  playerAvgPx: number;
  playerShortShares: number;
  playerAvgShortPx: number;
  maxShares: number;
  /** null unless player has 4S Market Data (capability rule) */
  forecast: number | null;
  /** null unless player has 4S Market Data (capability rule) */
  volatility: number | null;
}

export interface StocksState {
  hasTixApi: boolean;
  has4S: boolean;
  portfolioValue: number;
  positions: StockDto[];
  watchable: StockDto[];
  /** Per-symbol price history ring (~30 entries), updated on each push. For sparklines. */
  history: Record<string, number[]>;
}

/** Bounded ring size for per-symbol price history. */
const PRICE_RING_SIZE = 30;

/**
 * Module-level price history rings keyed by symbol. Seeded lazily on first serialization call
 * for each symbol. Updated (price appended) on every serializeStocks() call, regardless of
 * whether the payload changed (the subscription layer de-dupes the sends).
 */
const _priceHistory = new Map<string, number[]>();

function recordStockPrice(symbol: string, price: number): void {
  let ring = _priceHistory.get(symbol);
  if (!ring) {
    ring = [];
    _priceHistory.set(symbol, ring);
  }
  ring.push(price);
  if (ring.length > PRICE_RING_SIZE) ring.shift();
}

/**
 * Serialize the stock market state per docs/protocol.md StocksState shape.
 * Returns null if the player does not have a WSE account.
 *
 * CAPABILITY RULE: forecast and volatility fields are null unless the player owns 4S Market Data.
 * The extension must never show forecast/volatility when has4S is false — do not strip on the
 * extension side.
 */
export function serializeStocks(): StocksState | null {
  if (!Player.hasWseAccount) return null;

  const has4S = Player.has4SData;
  const allStocks = (Object.values(StockMarket) as unknown[]).filter((v): v is Stock => v instanceof Stock);

  let portfolioValue = 0;
  const positions: StockDto[] = [];
  const watchable: StockDto[] = [];

  for (const stock of allStocks) {
    // Update price history ring on every serialization call (seeded lazily).
    recordStockPrice(stock.symbol, stock.price);

    const dto: StockDto = {
      symbol: stock.symbol,
      org: stock.name,
      price: finite(stock.price),
      askPrice: finite(stock.getAskPrice()),
      bidPrice: finite(stock.getBidPrice()),
      playerShares: stock.playerShares,
      playerAvgPx: finite(stock.playerAvgPx),
      playerShortShares: stock.playerShortShares,
      playerAvgShortPx: finite(stock.playerAvgShortPx),
      maxShares: stock.maxShares,
      // Capability rule: only expose forecast/volatility with 4S data.
      forecast: has4S ? finite(stock.getAbsoluteForecast()) : null,
      volatility: has4S ? finite(stock.mv) : null,
    };

    watchable.push(dto);

    if (stock.playerShares > 0 || stock.playerShortShares > 0) {
      positions.push(dto);
      // Long position value at current price; short position as invested principal.
      portfolioValue += finite(stock.playerShares * stock.price);
      if (stock.playerShortShares > 0) {
        portfolioValue += finite(stock.playerShortShares * stock.playerAvgShortPx);
      }
    }
  }

  // Snapshot current history rings into a plain Record for serialization.
  const history: Record<string, number[]> = {};
  for (const [symbol, ring] of _priceHistory) {
    history[symbol] = ring.slice();
  }

  return {
    hasTixApi: Player.hasTixApiAccess,
    has4S,
    portfolioValue: finite(portfolioValue),
    positions,
    watchable,
    history,
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

// --- Hacknet state shapes (mirror docs/protocol.md) ---

/** A purchase-quote for upgrading one axis of a hacknet node/server by qty steps. */
export interface HacknetUpgradeQuote {
  qty: number;
  /** Dollar cost for the upgrade. */
  cost: number;
  /** Production delta per second: $/s in node mode, hashes/s in server mode. */
  deltaPerSec: number;
}

export interface HacknetNodeDto {
  index: number;
  name: string;
  level: number;
  ram: number;
  cores: number;
  /** null in node mode; the server cache level in server mode. */
  cache: number | null;
  /** Money/sec (node mode) or hashes/sec (server mode). */
  productionPerSec: number;
  /**
   * Per-axis upgrade quotes for qty 1/5/10/max. null if the axis is already at cap (or
   * cache in node mode, which has no cache). Quotes are for the game-rule cap remaining —
   * max = levels-to-cap, regardless of player affordability.
   */
  upgrades: Record<"level" | "ram" | "core" | "cache", HacknetUpgradeQuote[] | null>;
}

export interface HacknetBuy {
  description: string;
  cost: number;
  /**
   * Cost / money-gain-per-second for the upgrade. null in server mode, where production is hashes
   * (not money) and a dollar payback is not meaningful — the capability/discovery rule keeps us
   * from fabricating a metric the game does not show.
   */
  paybackSeconds: number | null;
  action: { kind: "node" | "level" | "ram" | "core" | "cache"; index: number };
}

export interface HacknetState {
  isServers: boolean;
  totalProductionPerSec: number;
  hashes: { current: number; capacity: number } | null;
  nodes: HacknetNodeDto[];
  bestBuys: HacknetBuy[];
}

/** How many best-buy entries to expose (ROI-ranked). */
const MAX_BEST_BUYS = 8;

/**
 * Serialize the player's hacknet state per docs/protocol.md HacknetState shape.
 *
 * bestBuys is derived (the game has no ROI helper): for each node×axis (level/ram/core, +cache in
 * server mode) plus "buy new node", we compute the upgrade cost via the game's calculate*UpgradeCost
 * formulas and, in node mode, the money-gain delta via calculateMoneyGainRate. paybackSeconds =
 * cost / moneyDeltaPerSec, sorted ascending (best ROI first) and capped at MAX_BEST_BUYS. In server
 * mode paybackSeconds is null (production is hashes, not money) and buys are ordered by cost ascending.
 */
export function serializeHacknet(): HacknetState {
  const isServers = hasHacknetServers();
  const prodMult = Player.mults.hacknet_node_money;
  const levelCostMult = Player.mults.hacknet_node_level_cost;
  const ramCostMult = Player.mults.hacknet_node_ram_cost;
  const coreCostMult = Player.mults.hacknet_node_core_cost;

  const nodes: HacknetNodeDto[] = [];
  const buys: HacknetBuy[] = [];
  let totalProductionPerSec = 0;

  for (let index = 0; index < Player.hacknetNodes.length; index++) {
    const ref = Player.hacknetNodes[index];

    if (!isServers) {
      // Node mode: entries are HacknetNode objects.
      const node = ref instanceof HacknetNode ? ref : null;
      if (!node) continue;
      const current = node.moneyGainRatePerSecond;
      totalProductionPerSec += finite(current);

      // Upgrade quotes per axis (qty 1/5/10/max).
      const nodeLevelMax = HacknetNodeConstants.MaxLevel - node.level;
      const nodeRamMax = node.ram < HacknetNodeConstants.MaxRam
        ? Math.round(Math.log2(HacknetNodeConstants.MaxRam / node.ram)) : 0;
      const nodeCoreMax = HacknetNodeConstants.MaxCores - node.cores;

      const upgrades: HacknetNodeDto["upgrades"] = {
        level: buildUpgradeQuotes(
          nodeLevelMax,
          (q) => node.calculateLevelUpgradeCost(q, levelCostMult),
          (q) => calculateMoneyGainRate(node.level + q, node.ram, node.cores, prodMult) - current,
        ),
        ram: buildUpgradeQuotes(
          nodeRamMax,
          (q) => node.calculateRamUpgradeCost(q, ramCostMult),
          (q) => calculateMoneyGainRate(node.level, node.ram * Math.pow(2, q), node.cores, prodMult) - current,
        ),
        core: buildUpgradeQuotes(
          nodeCoreMax,
          (q) => node.calculateCoreUpgradeCost(q, coreCostMult),
          (q) => calculateMoneyGainRate(node.level, node.ram, node.cores + q, prodMult) - current,
        ),
        cache: null, // node mode has no cache
      };

      nodes.push({
        index,
        name: node.name,
        level: node.level,
        ram: node.ram,
        cores: node.cores,
        cache: null,
        productionPerSec: finite(current),
        upgrades,
      });

      // Upgrade candidates (skip maxed axes — those cost Infinity).
      if (node.level < HacknetNodeConstants.MaxLevel) {
        const cost = node.calculateLevelUpgradeCost(1, levelCostMult);
        const delta = calculateMoneyGainRate(node.level + 1, node.ram, node.cores, prodMult) - current;
        pushMoneyBuy(buys, `${node.name}: Level ${node.level} → ${node.level + 1}`, cost, delta, "level", index);
      }
      if (node.ram < HacknetNodeConstants.MaxRam) {
        const cost = node.calculateRamUpgradeCost(1, ramCostMult);
        const delta = calculateMoneyGainRate(node.level, node.ram * 2, node.cores, prodMult) - current;
        pushMoneyBuy(buys, `${node.name}: RAM ${node.ram} → ${node.ram * 2}GB`, cost, delta, "ram", index);
      }
      if (node.cores < HacknetNodeConstants.MaxCores) {
        const cost = node.calculateCoreUpgradeCost(1, coreCostMult);
        const delta = calculateMoneyGainRate(node.level, node.ram, node.cores + 1, prodMult) - current;
        pushMoneyBuy(buys, `${node.name}: Cores ${node.cores} → ${node.cores + 1}`, cost, delta, "core", index);
      }
    } else {
      // Server mode: entries are hostnames pointing at HacknetServer instances.
      const server = typeof ref === "string" ? GetServer(ref) : ref;
      if (!(server instanceof HacknetServer)) continue;
      const srvHashRate = server.hashRate;
      totalProductionPerSec += finite(srvHashRate);

      // Upgrade quotes per axis for server mode.
      const srvLevelMax = HacknetServerConstants.MaxLevel - server.level;
      const srvRamMax = server.maxRam < HacknetServerConstants.MaxRam
        ? Math.round(Math.log2(HacknetServerConstants.MaxRam / server.maxRam)) : 0;
      const srvCoreMax = HacknetServerConstants.MaxCores - server.cores;
      const srvCacheMax = HacknetServerConstants.MaxCache - server.cache;

      const srvUpgrades: HacknetNodeDto["upgrades"] = {
        level: buildUpgradeQuotes(
          srvLevelMax,
          (q) => server.calculateLevelUpgradeCost(q, levelCostMult),
          (q) => calculateHashGainRate(server.level + q, server.ramUsed, server.maxRam, server.cores, prodMult) - srvHashRate,
        ),
        ram: buildUpgradeQuotes(
          srvRamMax,
          (q) => server.calculateRamUpgradeCost(q, ramCostMult),
          (q) => calculateHashGainRate(server.level, server.ramUsed, server.maxRam * Math.pow(2, q), server.cores, prodMult) - srvHashRate,
        ),
        core: buildUpgradeQuotes(
          srvCoreMax,
          (q) => server.calculateCoreUpgradeCost(q, coreCostMult),
          (q) => calculateHashGainRate(server.level, server.ramUsed, server.maxRam, server.cores + q, prodMult) - srvHashRate,
        ),
        // Cache upgrade increases hash capacity, not production rate; deltaPerSec is 0.
        cache: buildUpgradeQuotes(
          srvCacheMax,
          (q) => server.calculateCacheUpgradeCost(q),
          (_q) => 0,
        ),
      };

      nodes.push({
        index,
        name: server.hostname,
        level: server.level,
        ram: server.maxRam,
        cores: server.cores,
        cache: server.cache,
        productionPerSec: finite(srvHashRate),
        upgrades: srvUpgrades,
      });

      // Server-mode buys: payback is null (hashes, not money); ordered by cost only.
      if (server.level < HacknetServerConstants.MaxLevel) {
        const cost = server.calculateLevelUpgradeCost(1, levelCostMult);
        pushCostBuy(buys, `${server.hostname}: Level ${server.level} → ${server.level + 1}`, cost, "level", index);
      }
      if (server.maxRam < HacknetServerConstants.MaxRam) {
        const cost = server.calculateRamUpgradeCost(1, ramCostMult);
        pushCostBuy(buys, `${server.hostname}: RAM ${server.maxRam} → ${server.maxRam * 2}GB`, cost, "ram", index);
      }
      if (server.cores < HacknetServerConstants.MaxCores) {
        const cost = server.calculateCoreUpgradeCost(1, coreCostMult);
        pushCostBuy(buys, `${server.hostname}: Cores ${server.cores} → ${server.cores + 1}`, cost, "core", index);
      }
      if (server.cache < HacknetServerConstants.MaxCache) {
        const cost = server.calculateCacheUpgradeCost(1);
        pushCostBuy(buys, `${server.hostname}: Cache ${server.cache} → ${server.cache + 1}`, cost, "cache", index);
      }
    }
  }

  // "Buy new node/server" candidate.
  if (isServers) {
    const cost = getCostOfNextHacknetServer();
    pushCostBuy(buys, "Buy new Hacknet Server", cost, "node", -1);
  } else {
    const cost = getCostOfNextHacknetNode();
    const delta = calculateMoneyGainRate(1, 1, 1, prodMult);
    pushMoneyBuy(buys, "Buy new Hacknet Node", cost, delta, "node", -1);
  }

  // Rank: by ascending payback in node mode (best ROI first), by ascending cost in server mode.
  buys.sort((a, b) => {
    if (a.paybackSeconds !== null && b.paybackSeconds !== null) return a.paybackSeconds - b.paybackSeconds;
    return a.cost - b.cost;
  });

  const hashes = isServers
    ? { current: finite(Player.hashManager.hashes), capacity: finite(Player.hashManager.capacity) }
    : null;

  return {
    isServers,
    totalProductionPerSec: finite(totalProductionPerSec),
    hashes,
    nodes,
    bestBuys: buys.slice(0, MAX_BEST_BUYS),
  };
}

/** Push a money-payback buy (node mode). Skips non-finite/zero cost or non-positive money delta. */
function pushMoneyBuy(
  buys: HacknetBuy[],
  description: string,
  cost: number,
  moneyDeltaPerSec: number,
  kind: HacknetBuy["action"]["kind"],
  index: number,
): void {
  if (!Number.isFinite(cost) || cost <= 0 || moneyDeltaPerSec <= 0) return;
  buys.push({ description, cost, paybackSeconds: finite(cost / moneyDeltaPerSec), action: { kind, index } });
}

/** Push a cost-only buy (server mode — no meaningful money payback). Skips non-finite/zero cost. */
function pushCostBuy(
  buys: HacknetBuy[],
  description: string,
  cost: number,
  kind: HacknetBuy["action"]["kind"],
  index: number,
): void {
  if (!Number.isFinite(cost) || cost <= 0) return;
  buys.push({ description, cost, paybackSeconds: null, action: { kind, index } });
}

/**
 * Build the upgrade-quote array for one hacknet axis (level/ram/core/cache).
 *
 * @param maxQty  Remaining steps to the game cap (e.g. MaxLevel − node.level).
 * @param computeCost  Returns the cost for a given qty (may return Infinity if capped).
 * @param computeDelta Returns the production-rate delta per second for a given qty.
 * @returns Array of quotes for qty in {1,5,10,maxQty} (deduped, filtered to valid range),
 *          or null if maxQty <= 0 (axis already at cap).
 */
function buildUpgradeQuotes(
  maxQty: number,
  computeCost: (qty: number) => number,
  computeDelta: (qty: number) => number,
): HacknetUpgradeQuote[] | null {
  if (maxQty <= 0) return null;
  // Unique candidates within range, sorted ascending.
  const seen = new Set<number>();
  const qtys: number[] = [];
  for (const q of [1, 5, 10, maxQty]) {
    if (q > 0 && q <= maxQty && !seen.has(q)) {
      seen.add(q);
      qtys.push(q);
    }
  }
  qtys.sort((a, b) => a - b);
  const quotes: HacknetUpgradeQuote[] = [];
  for (const qty of qtys) {
    const cost = computeCost(qty);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    quotes.push({ qty, cost: finite(cost), deltaPerSec: finite(computeDelta(qty)) });
  }
  return quotes.length > 0 ? quotes : null;
}

// --- Sleeve state shapes (mirror docs/protocol.md) ---

export interface SleeveDto {
  index: number;
  task: string;
  shock: number;
  sync: number;
  city: string;
  stats: Record<"hack" | "str" | "def" | "dex" | "agi" | "cha", number>;
}

/** Short, human-readable label for a sleeve's current work (discriminated by SleeveWorkType). */
function sleeveTaskLabel(sleeve: Sleeve): string {
  const work = sleeve.currentWork;
  if (!work) return "Idle";
  switch (work.type) {
    case SleeveWorkType.CRIME:
      return "Crime";
    case SleeveWorkType.CLASS:
      return "Class";
    case SleeveWorkType.COMPANY:
      return "Company";
    case SleeveWorkType.FACTION:
      return "Faction";
    case SleeveWorkType.RECOVERY:
      return "Recovery";
    case SleeveWorkType.SYNCHRO:
      return "Synchro";
    case SleeveWorkType.BLADEBURNER:
      return "Bladeburner";
    case SleeveWorkType.INFILTRATE:
      return "Infiltrate";
    case SleeveWorkType.SUPPORT:
      return "Support";
    default:
      return "Idle";
  }
}

/** Serialize the player's sleeves per docs/protocol.md SleeveDto[] shape (empty array if none). */
export function serializeSleeves(): SleeveDto[] {
  return Player.sleeves.map((sleeve, index) => ({
    index,
    task: sleeveTaskLabel(sleeve),
    shock: finite(sleeve.shock),
    sync: finite(sleeve.sync),
    city: sleeve.city,
    stats: {
      hack: sleeve.skills.hacking,
      str: sleeve.skills.strength,
      def: sleeve.skills.defense,
      dex: sleeve.skills.dexterity,
      agi: sleeve.skills.agility,
      cha: sleeve.skills.charisma,
    },
  }));
}

// --- Corporation state shapes (mirror docs/protocol.md) ---

export interface CorpProductDto {
  name: string;
  developmentProgress: number;
  /**
   * Aggregate rating (Division-weighted score). null for unfinished products
   * (product.finished === false, i.e. developmentProgress < 100).
   *
   * NOTE: the game also computes an effectiveRating per city (product.cityData[city].effectiveRating),
   * but product.rating is the representative aggregate value appropriate for summary views — it is
   * not per-city and this is intentional; the protocol sends the aggregate.
   */
  rating: number | null;
}

export interface DivisionDto {
  name: string;
  industry: string;
  makesProducts: boolean;
  cities: string[];
  products: CorpProductDto[];
  warehouses: { city: string; used: number; total: number }[];
  offices: { city: string; employees: number; maxEmployees: number }[];
}

export interface CorpState {
  name: string;
  funds: number;
  revenue: number;
  expenses: number;
  public: boolean;
  /**
   * Share price sent as a number always (it is 0 for private corporations).
   * Protocol.md types it as number | null; the game field always exists,
   * so we never send null — the extension should treat 0 as "private".
   */
  sharePrice: number | null;
  divisions: DivisionDto[];
  /** Per-division research points map. Keys are division names. */
  researchPoints: Record<string, number>;
}

/**
 * Serialize a single Division to DivisionDto. Exported for testing against structural stubs.
 *
 * Iterates products via division.products.values() (JSONMap), and warehouses/offices via
 * Object.entries (PartialRecord — values may be undefined and are skipped).
 * cities is the union of cities that have a warehouse or an office.
 */
export function serializeDivision(division: Division): DivisionDto {
  const products: CorpProductDto[] = [];
  for (const product of division.products.values()) {
    products.push({
      name: product.name,
      developmentProgress: finite(product.developmentProgress),
      rating: product.finished ? finite(product.rating) : null,
    });
  }

  const warehouses: DivisionDto["warehouses"] = [];
  for (const [city, warehouse] of Object.entries(division.warehouses)) {
    if (!warehouse) continue;
    warehouses.push({ city, used: finite(warehouse.sizeUsed), total: finite(warehouse.size) });
  }

  const offices: DivisionDto["offices"] = [];
  for (const [city, office] of Object.entries(division.offices)) {
    if (!office) continue;
    offices.push({ city, employees: office.numEmployees, maxEmployees: office.size });
  }

  const citySet = new Set<string>();
  for (const w of warehouses) citySet.add(w.city);
  for (const o of offices) citySet.add(o.city);

  return {
    name: division.name,
    industry: division.industry,
    makesProducts: division.makesProducts,
    cities: [...citySet],
    products,
    warehouses,
    offices,
  };
}

// --- Go state shapes (mirror docs/protocol.md) ---

export interface GoState {
  boardSize: number;
  /** string[] of columns — each column string encodes cells top-to-bottom: X=black O=white .=empty #=offline */
  board: string[];
  opponent: string;
  playerColor: "black" | "white";
  currentTurn: "black" | "white" | "none";
  komi: number;
  captures: { black: number; white: number };
  previousMove: [number, number] | null;
  gameOver: boolean;
}

/**
 * Serialize the current IPvGo board state per docs/protocol.md GoState shape.
 *
 * Player is always black. currentTurn = "none" when the game is over (previousPlayer === null).
 * board = simpleBoardFromBoard (columns as strings, each char X/O/./#).
 * captures = current piece counts from getScore (not cumulative; the game does not track cumulative captures).
 */
export function serializeGo(): GoState {
  const boardState = Go.currentGame;
  const score = getScore(boardState);
  // previousPlayer is who moved last; currentTurn is whoever goes next.
  const prev = boardState.previousPlayer;
  const currentTurn: "black" | "white" | "none" =
    prev === null ? "none" : prev === GoColor.black ? "white" : "black";

  return {
    boardSize: boardState.board.length,
    board: simpleBoardFromBoard(boardState.board),
    opponent: boardState.ai,
    playerColor: "black",
    currentTurn,
    komi: score[GoColor.white].komi,
    captures: {
      black: score[GoColor.black].pieces,
      white: score[GoColor.white].pieces,
    },
    previousMove: getPreviousMove(),
    gameOver: prev === null,
  };
}

// --- Bladeburner state shapes (mirror docs/protocol.md) ---

/**
 * Reverse of PROTOCOL_TYPE_TO_BB in GameActionHandlers.ts.
 * Maps BladeburnerActionType enum values (e.g. "Contracts") → protocol strings (e.g. "contract")
 * so currentAction.type in the serialized payload matches what bladeburnerStartAction expects.
 */
const BB_TYPE_TO_PROTOCOL: Record<BladeburnerActionType, string> = {
  [BladeburnerActionType.Contract]: "contract",
  [BladeburnerActionType.Operation]: "operation",
  [BladeburnerActionType.BlackOp]: "blackop",
  [BladeburnerActionType.General]: "general",
};

export interface BbActionDto {
  type: "contract" | "operation" | "blackop";
  name: string;
  countRemaining: number | null;
  successChance: [number, number];
  reqRank: number | null;
}

export interface BladeburnerState {
  rank: number;
  stamina: { current: number; max: number };
  cityChaos: number;
  skillPoints: number;
  currentAction: { type: string; name: string } | null;
  actions: BbActionDto[];
}

/**
 * Serialize the player's Bladeburner state per docs/protocol.md BladeburnerState shape.
 * Returns null if the player has not joined Bladeburner.
 *
 * successChance is the [min, max] range as returned by action.getSuccessRange().
 * countRemaining is LevelableAction.count for contracts/operations; null for blackops (done once).
 * All blackops are included (static data the UI shows) — they are not secret.
 */
export function serializeBladeburner(): BladeburnerState | null {
  const bb = Player.bladeburner;
  if (!bb) return null;

  const currentCity = bb.getCurrentCity();

  const contracts: BbActionDto[] = Object.values(bb.contracts).map((c) => {
    const range = c.getSuccessRange(bb, Player);
    return {
      type: "contract" as const,
      name: c.name,
      countRemaining: c.count,
      successChance: [finite(range[0]), finite(range[1])],
      reqRank: null,
    };
  });

  const operations: BbActionDto[] = Object.values(bb.operations).map((op) => {
    const range = op.getSuccessRange(bb, Player);
    return {
      type: "operation" as const,
      name: op.name,
      countRemaining: op.count,
      successChance: [finite(range[0]), finite(range[1])],
      reqRank: null,
    };
  });

  const blackOps: BbActionDto[] = Object.values(bb.blackOperations).map((blackOp) => {
    const range = blackOp.getSuccessRange(bb, Player);
    return {
      type: "blackop" as const,
      name: blackOp.name,
      countRemaining: null,
      successChance: [finite(range[0]), finite(range[1])],
      reqRank: blackOp.reqdRank,
    };
  });

  return {
    rank: finite(bb.rank),
    stamina: { current: finite(bb.stamina), max: finite(bb.maxStamina) },
    cityChaos: finite(currentCity.chaos),
    skillPoints: bb.skillPoints,
    currentAction: bb.action ? { type: BB_TYPE_TO_PROTOCOL[bb.action.type] ?? bb.action.type, name: bb.action.name } : null,
    actions: [...contracts, ...operations, ...blackOps],
  };
}

// --- City/World state shapes (see docs/protocol.md CityWorldState) ---

export interface CityLocationDto {
  name: string;
  types: string[];
}

export interface CityDto {
  name: string;
  current: boolean;
  locations: CityLocationDto[];
}

export interface CityWorldState {
  cities: CityDto[];
  travelCost: number;
}

// --- CityDetailState (getCityDetail) ─────────────────────────────────────────

/** Detailed info for a single location within a city, enriched with player state. */
export interface CityLocationDetail {
  name: string;
  /** LocationType enum string values. */
  types: string[];
  /**
   * Company info when this location has LocationType.Company. null otherwise.
   * canApply lists entry-level (isStartingJob) positions offered by this company
   * with ok=true when the player currently satisfies the requirements.
   */
  company: {
    hasJob: boolean;
    jobTitle: string | null;
    canApply: { position: string; ok: boolean }[];
    repRequirementNote: string | null;
  } | null;
  /**
   * Infiltration metadata when the location has infiltrationData. null otherwise.
   * reward is null: it is time-dependent and requires runtime game state.
   */
  infiltration: {
    difficulty: number;
    maxClearanceLevel: number;
    startingSecurityLevel: number;
    reward: { tradeRep: number; sellCash: number } | null;
  } | null;
  /**
   * Which purchasable things this location offers that the extension exposes.
   * Every TechVendor location offers all four: "tor", "homeRam", "homeCores", "servers".
   */
  purchases: ("tor" | "homeRam" | "homeCores" | "servers")[];
  /**
   * University or gym trainer info. null for non-trainer locations.
   * costMult is location.costMult (affects class/gym price).
   */
  trainer: { kind: "university" | "gym"; costMult: number } | null;
}

/** getCityDetail response. */
export interface CityDetailState {
  city: string;
  /** true when this city is the player's current city. */
  current: boolean;
  locations: CityLocationDetail[];
}

/**
 * Serialize the static city/world layout per docs/protocol.md CityWorldState shape.
 *
 * City geography (cities, locations, types) is static data the player sees in-game at all times.
 * travelCost = CONSTANTS.TravelCost. current = (cityName === Player.city).
 * Location types are serialized as their enum string values.
 */
export function serializeCity(): CityWorldState {
  const playerCity = Player.city;
  const cities: CityDto[] = Object.values(CityName).map((cityName) => {
    const city = Cities[cityName];
    const locations: CityLocationDto[] = city.locations.map((locName) => {
      const location = Locations[locName];
      return {
        name: locName,
        types: location ? location.types.map((t) => String(t)) : [],
      };
    });
    return {
      name: cityName,
      current: cityName === playerCity,
      locations,
    };
  });
  return { cities, travelCost: CONSTANTS.TravelCost };
}

/**
 * Serialize detailed city info for one city per docs/protocol.md CityDetailState shape.
 *
 * Defaults to the player's current city if `requestedCity` is absent or unrecognised.
 * Enriches each location with company job state, infiltration metadata, purchase flags,
 * and trainer info. Company lookup: location.name cast to CompanyName (mirroring the game's
 * CompanyLocation component). TechVendor locations always offer tor/homeRam/homeCores/servers.
 */
export function serializeCityDetail(requestedCity?: string): CityDetailState {
  const playerCity = Player.city;
  const cityName: CityName =
    requestedCity !== undefined && Object.values(CityName).includes(requestedCity as CityName)
      ? (requestedCity as CityName)
      : playerCity;

  const city = Cities[cityName];
  const locations: CityLocationDetail[] = city.locations.map((locName) => {
    const location = Locations[locName];
    if (!location) {
      return { name: locName, types: [], company: null, infiltration: null, purchases: [], trainer: null };
    }

    const types = location.types.map((t) => String(t));

    // Company info — mirrors CompanyLocation component: Companies[location.name].
    let company: CityLocationDetail["company"] = null;
    if (location.types.includes(LocationType.Company)) {
      const companyName = locName as unknown as CompanyName;
      const comp = Companies[companyName];
      if (comp) {
        const hasJob = Player.jobs[companyName] !== undefined;
        const jobTitle = (Player.jobs[companyName] as string | undefined) ?? null;
        // Expose isStartingJob positions (entry points per field track) that this company offers.
        const canApply = Object.values(CompanyPositions)
          .filter((pos) => pos.isStartingJob && comp.hasPosition(pos))
          .map((pos) => ({
            position: pos.name as string,
            ok: Player.isQualified(comp, pos),
          }));
        company = {
          hasJob,
          jobTitle,
          canApply,
          repRequirementNote: null,
        };
      }
    }

    // Infiltration metadata — reward is null (time-dependent, requires runtime game state).
    let infiltration: CityLocationDetail["infiltration"] = null;
    if (location.infiltrationData) {
      infiltration = {
        difficulty: finite(location.infiltrationData.startingSecurityLevel),
        maxClearanceLevel: location.infiltrationData.maxClearanceLevel,
        startingSecurityLevel: finite(location.infiltrationData.startingSecurityLevel),
        reward: null,
      };
    }

    // Purchases — every TechVendor offers all four.
    const purchases: CityLocationDetail["purchases"] = [];
    if (location.types.includes(LocationType.TechVendor)) {
      purchases.push("tor", "homeRam", "homeCores", "servers");
    }

    // Trainer info from costMult.
    let trainer: CityLocationDetail["trainer"] = null;
    if (location.types.includes(LocationType.University)) {
      trainer = { kind: "university", costMult: location.costMult };
    } else if (location.types.includes(LocationType.Gym)) {
      trainer = { kind: "gym", costMult: location.costMult };
    }

    return { name: locName, types, company, infiltration, purchases, trainer };
  });

  return { city: cityName, current: cityName === playerCity, locations };
}

/**
 * Serialize the player's corporation state per docs/protocol.md CorpState shape.
 * Returns null if the player has no corporation.
 *
 * Iterates corp.divisions via JSONMap.values(). researchPoints is a per-division
 * Record keyed by division name.
 */
export function serializeCorporation(): CorpState | null {
  const corp = Player.corporation;
  if (!corp) return null;

  const divisions: DivisionDto[] = [];
  const researchPoints: Record<string, number> = {};

  for (const division of corp.divisions.values()) {
    divisions.push(serializeDivision(division));
    researchPoints[division.name] = finite(division.researchPoints);
  }

  return {
    name: corp.name,
    funds: finite(corp.funds),
    revenue: finite(corp.revenue),
    expenses: finite(corp.expenses),
    public: corp.public,
    sharePrice: finite(corp.sharePrice),
    divisions,
    researchPoints,
  };
}

// ─── Work options state (GG-1) ───────────────────────────────────────────────

/** A university location with its available courses and cost information. */
export interface UniversityOptionDto {
  /** LocationName value, e.g. "Rothman University". */
  name: string;
  /** CityName this university is in. */
  city: string;
  /** Courses offered. costPerSec is negative (money consumed per second). */
  courses: { classType: string; costPerSec: number }[];
}

/** A gym location with its trainable stats and per-second cost. */
export interface GymOptionDto {
  /** LocationName value, e.g. "Powerhouse Gym". */
  name: string;
  /** CityName this gym is in. */
  city: string;
  /** The dollar cost per second (absolute value; deducted from player money). */
  costPerSec: number;
  /** GymType values available to train here ("str"|"def"|"dex"|"agi"). */
  stats: string[];
}

/** A crime option shown on the Slums page. */
export interface CrimeOptionDto {
  /** CrimeType key (used as the `crime` arg to commitCrime). */
  crimeType: string;
  /** Human-readable crime name shown on the Work screen ("to shoplift" etc.). */
  name: string;
  /** Karma lost on success. */
  karma: number;
  /** Money gained on success. */
  money: number;
  /** Time in milliseconds to attempt the crime. */
  timeMs: number;
  /** Probability of success given the player's current stats, 0..1. */
  successChance: number;
}

/** Server RAM tier cost entry. */
export interface ServerCostDto {
  /** RAM in GB (a power of 2). */
  ram: number;
  /** Dollar cost to purchase a server with this RAM. */
  cost: number;
}

/**
 * Work options state — per-city universities/gyms, global crimes, player jobs, and purchase costs.
 * Serialized by serializeWorkOptions (read-only, no mutations).
 */
export interface WorkOptionsState {
  /** Universities in the player's current city with course cost information. */
  universities: UniversityOptionDto[];
  /** Gyms in the player's current city. */
  gyms: GymOptionDto[];
  /** All crimes (available from any Slums location). */
  crimes: CrimeOptionDto[];
  /** Company names where the player currently holds a job. */
  companies: string[];
  /** Current work summary (mirrors hud.currentWork). null if not working. */
  currentWork: { type: string; description: string; etaMs: number | null } | null;
  /** Cost to double home computer RAM. 0 if already at max. */
  homeRamUpgradeCost: number;
  /**
   * Cost to add one core to the home computer. null when already at maximum
   * (cpuCores >= 8, or restrictHomePCUpgrade is on).
   */
  homeCoreUpgradeCost: number | null;
  /** Costs for purchasing a new cloud server at each valid RAM tier. */
  purchaseServerCosts: ServerCostDto[];
  /** TOR Router purchase cost (CONSTANTS.TorRouterCost). */
  torCost: number;
  /** Whether the player already has a TOR Router. */
  hasTor: boolean;
}

/** All gym stat types available at any gym. */
const ALL_GYM_TYPES = Object.values(GymType);

/** All university class types. */
const ALL_UNIVERSITY_TYPES = Object.values(UniversityClassType);

/**
 * Serialize the player's current work options per docs/protocol.md WorkOptionsState shape.
 *
 * Universities and gyms are filtered to the player's current city (loc.city === Player.city).
 * Crimes are global (Slums has city:null and is accessible from any city).
 * purchaseServerCosts covers all valid RAM tiers (positive powers of 2 up to the node-mult cap).
 */
export function serializeWorkOptions(): WorkOptionsState {
  const playerCity = Player.city;

  // Universities in player's city
  const universities: UniversityOptionDto[] = [];
  // Gyms in player's city
  const gyms: GymOptionDto[] = [];

  for (const loc of Object.values(Locations)) {
    if (loc.city !== playerCity) continue;
    if (loc.types.includes(LocationType.University)) {
      const courses = ALL_UNIVERSITY_TYPES.map((classType) => {
        const cls = Classes[classType];
        const costPerSec = finite(Math.abs(calculateClassCost(cls, loc)));
        return { classType, costPerSec };
      });
      universities.push({ name: loc.name, city: loc.city as string, courses });
    } else if (loc.types.includes(LocationType.Gym)) {
      // All gym exercises cost the same — compute from the first (strength).
      const strengthClass = Classes[GymType.strength];
      const costPerSec = finite(Math.abs(calculateClassCost(strengthClass, loc)));
      gyms.push({ name: loc.name, city: loc.city as string, costPerSec, stats: ALL_GYM_TYPES.slice() });
    }
  }

  // Crimes (global; success chance depends on player stats)
  const crimes: CrimeOptionDto[] = Object.values(Crimes).map((crime) => ({
    crimeType: crime.type,
    name: crime.workName,
    karma: crime.karma,
    money: finite(crime.money),
    timeMs: crime.time,
    successChance: finite(crime.successRate(Player)),
  }));

  // Companies where the player has a job
  const companies = Object.keys(Player.jobs);

  // Server costs for all valid RAM tiers (powers of 2, from 1 up to node-limited max)
  const maxRam = getCloudServerMaxRam();
  const purchaseServerCosts: ServerCostDto[] = [];
  for (let ram = 1; ram <= maxRam; ram *= 2) {
    const cost = getCloudServerCost(ram);
    if (Number.isFinite(cost) && cost > 0) {
      purchaseServerCosts.push({ ram, cost: finite(cost) });
    }
  }

  const home = Player.getHomeComputer();
  const atMaxRam =
    (Player.bitNodeOptions.restrictHomePCUpgrade && home.maxRam >= 128) ||
    home.maxRam >= ServerConstants.HomeComputerMaxRam;
  const homeRamUpgradeCost = atMaxRam ? 0 : finite(Player.getUpgradeHomeRamCost());

  // Home core upgrade cost: null when at maximum (cpuCores >= 8 or restricted).
  const atMaxCores = Player.bitNodeOptions.restrictHomePCUpgrade || home.cpuCores >= 8;
  const homeCoreUpgradeCost = atMaxCores ? null : finite(Player.getUpgradeHomeCoresCost());

  return {
    universities,
    gyms,
    crimes,
    companies,
    currentWork: serializeCurrentWork(),
    homeRamUpgradeCost,
    homeCoreUpgradeCost,
    purchaseServerCosts,
    torCost: CONSTANTS.TorRouterCost,
    hasTor: Player.hasTorRouter(),
  };
}
