/**
 * Action handlers for the Remote File API (GA-3 / GB-1).
 *
 * These handlers perform game-side side effects (as opposed to the pure read-only serializers).
 * Each is an async RFARequestHandler-compatible function and must never throw — errors become
 * error-response RFAMessages so the connection stays alive.
 */
import { Terminal } from "../Terminal";
import { Output } from "../Terminal/OutputTypes";
import { mapTerminalEntry } from "./StateSerializers";
import { RFAMessage } from "./MessageDefinitions";
import { killWorkerScriptByPid } from "../Netscript/killWorkerScript";
import { Player } from "@player";
import { CONSTANTS } from "../Constants";
import { CityName } from "../Locations/Enums";
import {
  joinFaction,
  purchaseAugmentation,
  getFactionAugmentationsFiltered,
  hasAugmentationPrereqs,
} from "../Faction/FactionHelpers";
import { installAugmentations as doInstallAugmentations, getAugCost } from "../Augmentation/AugmentationHelpers";
import { Augmentations } from "../Augmentation/Augmentations";
import { Factions } from "../Faction/Factions";
import {
  AugmentationName,
  FactionName,
  FactionWorkType,
  PositionType,
  GoColor,
  GoValidity,
  BladeburnerActionType,
  LocationType,
  LocationName,
  CompanyName,
  JobName,
  CrimeType,
  UniversityClassType,
  GymType,
} from "@enums";
import type { ClassType } from "@enums";
import { Go } from "../Go/Go";
import { evaluateIfMoveIsValid } from "../Go/boardAnalysis/boardAnalysis";
import { makeMove, passTurn } from "../Go/boardState/boardState";
import { handleNextTurn } from "../Go/boardAnalysis/goAI";
import type { Augmentation } from "../Augmentation/Augmentation";
import type { Faction } from "../Faction/Faction";
import { GangMemberTasks } from "../Gang/GangMemberTasks";
import { GangMemberUpgrades } from "../Gang/GangMemberUpgrades";
import { RecruitmentResult } from "../Gang/Gang";
import {
  buyStock as buyStockFn,
  sellStock as sellStockFn,
  shortStock as shortStockFn,
  sellShort as sellShortFn,
} from "../StockMarket/BuyingAndSelling";
import { SymbolToStockMap } from "../StockMarket/StockMarket";
import { getBuyTransactionCost } from "../StockMarket/StockMarketHelpers";
import { HacknetNode } from "../Hacknet/HacknetNode";
import { HacknetServer } from "../Hacknet/HacknetServer";
import { GetServer, AddToAllServers, createUniqueRandomIp } from "../Server/AllServers";
import {
  hasHacknetServers,
  hasMaxNumberHacknetServers,
  getCostOfNextHacknetNode,
  getCostOfNextHacknetServer,
  purchaseHacknet,
  purchaseLevelUpgrade,
  purchaseRamUpgrade,
  purchaseCoreUpgrade,
  purchaseCacheUpgrade,
} from "../Hacknet/HacknetHelpers";
import { getEnumHelper } from "../utils/EnumHelper";
import {
  purchaseWarehouse as corpPurchaseWarehouseFn,
  hireAdVert as corpHireAdVertFn,
  buyTea as corpBuyTeaFn,
  research as corpResearchFn,
  makeProduct as corpMakeProductFn,
} from "../Corporation/Actions";
import type { CorpResearchName } from "@nsdefs";
import { FactionWork } from "../Work/FactionWork";
import { ClassWork } from "../Work/ClassWork";
import { CompanyWork } from "../Work/CompanyWork";
import { CrimeWork } from "../Work/CrimeWork";
import { Locations } from "../Locations/Locations";
import { FactionInfos } from "../Faction/FactionInfo";
import { Companies } from "../Company/Companies";
import { CompanyPositions } from "../Company/CompanyPositions";
import { Router } from "../ui/GameRoot";
import { ComplexPage } from "../ui/Enums";
import {
  purchaseRamForHomeComputer,
  getCloudServerCost,
  getCloudServerLimit,
  getCloudServerMaxRam,
} from "../Server/ServerPurchases";
import { safelyCreateUniqueServer, getTorRouter } from "../Server/ServerHelpers";
import { ServerConstants } from "../Server/data/Constants";

/** Resolve a player hacknet node/server by index, or null if the index is out of range/invalid. */
function resolveHacknetNode(index: unknown): HacknetNode | HacknetServer | null {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= Player.hacknetNodes.length) {
    return null;
  }
  const ref = Player.hacknetNodes[index];
  if (ref instanceof HacknetNode) return ref;
  const server = typeof ref === "string" ? GetServer(ref) : ref;
  return server instanceof HacknetServer ? server : null;
}

/** The upgrade kinds hacknetPurchase understands. */
const HACKNET_KINDS = new Set(["node", "level", "ram", "core", "cache"]);

/** Maps protocol-level action type strings to BladeburnerActionType enum values. */
const PROTOCOL_TYPE_TO_BB: Record<string, BladeburnerActionType | undefined> = {
  contract: BladeburnerActionType.Contract,
  operation: BladeburnerActionType.Operation,
  blackop: BladeburnerActionType.BlackOp,
  general: BladeburnerActionType.General,
};

/**
 * Run a terminal command string via Terminal.executeCommands and return the delta output.
 *
 * Protocol: runTerminalCommand { command: string } → TerminalRunResult
 *   - If Terminal.action !== null (busy), returns { ok: false, output: [], busyRejected: true }.
 *   - Otherwise records outputHistory.length, awaits executeCommands, then returns
 *     { ok: true, output: <new entries since start> }.
 *   - Any thrown exception is caught; the handler returns { ok: false, output: [] } rather than
 *     crashing the handler or leaving the connection in an undefined state.
 */
export async function runTerminalCommand(msg: RFAMessage): Promise<RFAMessage> {
  const params = msg.params as unknown as { command?: unknown } | undefined;
  const command = params && typeof params.command === "string" ? params.command : null;

  if (command === null) {
    return new RFAMessage({ error: "Missing or invalid params: command must be a string", id: msg.id });
  }

  // Busy check — Terminal.action !== null means an action is in progress.
  if (Terminal.action !== null) {
    return new RFAMessage({
      result: { ok: false, output: [], busyRejected: true } as unknown as Record<string, unknown>,
      id: msg.id,
    });
  }

  const start = Terminal.outputHistory.length;
  try {
    await Terminal.executeCommands(command);
  } catch {
    // A throwing command (e.g. an uncaught error in a command handler) must not crash the RFA
    // handler. Return whatever delta accumulated before the throw.
    const output = Terminal.outputHistory.slice(start).map(mapTerminalEntry);
    return new RFAMessage({
      result: { ok: false, output } as unknown as Record<string, unknown>,
      id: msg.id,
    });
  }

  const output = Terminal.outputHistory.slice(start).map(mapTerminalEntry);
  return new RFAMessage({
    result: { ok: true, output } as unknown as Record<string, unknown>,
    id: msg.id,
  });
}

// ─── invokeAction registry (GB-1) ────────────────────────────────────────────

interface ActionImpl {
  /** Return a string error message if args are invalid, null otherwise. */
  validate(args: Record<string, unknown>): string | null;
  /** Human-readable description echoed to the terminal as [vscode] <describe>. */
  describe(args: Record<string, unknown>): string;
  /** Perform the action. Must mirror the exact calls the React UI makes. */
  execute(args: Record<string, unknown>): { ok: boolean; message?: string };
}

const actionRegistry: Record<string, ActionImpl> = {
  killScript: {
    validate(args) {
      if (typeof args.pid !== "number") return "Missing or invalid pid (must be a number)";
      return null;
    },
    describe(args) {
      return `Kill script with PID ${args.pid as number}`;
    },
    execute(args) {
      const pid = args.pid as number;
      const killed = killWorkerScriptByPid(pid);
      if (!killed) return { ok: false, message: `No running script with PID ${pid}` };
      return { ok: true };
    },
  },

  travel: {
    validate(args) {
      if (typeof args.city !== "string") return "Missing or invalid city (must be a string)";
      if (!Object.values(CityName).includes(args.city as CityName))
        return `Unknown city: ${args.city}. Valid cities: ${Object.values(CityName).join(", ")}`;
      return null;
    },
    describe(args) {
      return `Travel to ${args.city as string}`;
    },
    execute(args) {
      const city = args.city as CityName;
      // Mirror the Travel Agency page's money guard.
      if (!Player.canAfford(CONSTANTS.TravelCost)) {
        return { ok: false, message: `Cannot afford travel cost ($${CONSTANTS.TravelCost})` };
      }
      const success = Player.travel(city);
      if (!success) return { ok: false, message: "Travel failed" };
      return { ok: true };
    },
  },

  joinFaction: {
    validate(args) {
      if (typeof args.faction !== "string") return "Missing or invalid faction (must be a string)";
      const faction = Factions[args.faction as FactionName];
      if (faction?.isBanned) return `Faction ${args.faction as string} is banned`;
      return null;
    },
    describe(args) {
      return `Join faction ${args.faction as string}`;
    },
    execute(args) {
      const name = args.faction as FactionName;
      // Only join if the player has a pending invitation — same guard as the invitation modal.
      if (!Player.factionInvitations.includes(name)) {
        return { ok: false, message: `No pending invitation from faction: ${name}` };
      }
      const faction = Factions[name];
      if (!faction) return { ok: false, message: `Unknown faction: ${name}` };
      joinFaction(faction);
      return { ok: true };
    },
  },

  // ─── Augmentation actions (GC-2) ─────────────────────────────────────────

  queueAugmentation: {
    /**
     * Read-only pre-check — mirrors checkIfPlayerCanPurchaseAugmentation without mutating state.
     * Checks in order: faction exists, aug exists, membership, aug offered, not already
     * owned/queued (unless NFG), prereqs met, money sufficient, rep sufficient.
     */
    validate(args) {
      if (typeof args.faction !== "string") return "Missing or invalid faction (must be a string)";
      if (typeof args.augment !== "string") return "Missing or invalid augment (must be a string)";
      const factionName = args.faction as FactionName;
      const augName = args.augment as AugmentationName;
      const faction = Factions[factionName] as Faction | undefined;
      if (!faction) return `Unknown faction: ${args.faction as string}`;
      const aug = Augmentations[augName] as Augmentation | undefined;
      if (!aug) return `Unknown augmentation: ${args.augment as string}`;
      if (!Player.factions.includes(factionName)) {
        return `You are not a member of faction ${args.faction as string}`;
      }
      if (!getFactionAugmentationsFiltered(faction).includes(augName)) {
        return `Faction ${args.faction as string} does not offer augmentation ${args.augment as string}`;
      }
      if (augName !== AugmentationName.NeuroFluxGovernor) {
        if (Player.queuedAugmentations.some((a) => a.name === augName)) {
          return `You already queued augmentation ${args.augment as string}`;
        }
        if (Player.augmentations.some((a) => a.name === augName)) {
          return `You already installed augmentation ${args.augment as string}`;
        }
      }
      if (!hasAugmentationPrereqs(aug)) {
        return `Prerequisites not met for augmentation ${args.augment as string}`;
      }
      const costs = getAugCost(aug);
      if (costs.moneyCost !== 0 && Player.money < costs.moneyCost) {
        return `Insufficient money for augmentation ${args.augment as string} (need $${costs.moneyCost})`;
      }
      if (faction.playerReputation < costs.repCost) {
        return `Insufficient reputation for augmentation ${args.augment as string} (need ${costs.repCost})`;
      }
      return null;
    },
    describe(args) {
      return `queue augmentation "${args.augment as string}" from ${args.faction as string}`;
    },
    execute(args) {
      const faction = Factions[args.faction as FactionName];
      const aug = Augmentations[args.augment as AugmentationName];
      const result = purchaseAugmentation(faction, aug, true);
      return { ok: result.success, message: result.message };
    },
  },

  installAugmentations: {
    validate(_args) {
      return Player.queuedAugmentations.length > 0 ? null : "No augmentations queued";
    },
    describe(_args) {
      return `install ${Player.queuedAugmentations.length} augmentation(s) (soft reset)`;
    },
    execute(_args) {
      doInstallAugmentations(true);
      return { ok: true };
    },
  },

  // ─── Gang actions (GD-1) ─────────────────────────────────────────────────

  ascendGangMember: {
    validate(args) {
      if (typeof args.member !== "string") return "Missing or invalid member (must be a string)";
      const gang = Player.gang;
      if (!gang) return "Player is not in a gang";
      const member = gang.members.find((m) => m.name === (args.member as string));
      if (!member) return `Gang member not found: ${args.member as string}`;
      if (!member.canAscend()) return `Gang member ${args.member as string} cannot ascend (insufficient experience)`;
      return null;
    },
    describe(args) {
      return `Ascend gang member ${args.member as string}`;
    },
    execute(args) {
      const gang = Player.gang;
      if (!gang) return { ok: false, message: "Player is not in a gang" };
      const member = gang.members.find((m) => m.name === (args.member as string));
      if (!member) return { ok: false, message: `Gang member not found: ${args.member as string}` };
      gang.ascendMember(member);
      return { ok: true };
    },
  },

  setGangMemberTask: {
    validate(args) {
      if (typeof args.member !== "string") return "Missing or invalid member (must be a string)";
      if (typeof args.task !== "string") return "Missing or invalid task (must be a string)";
      const gang = Player.gang;
      if (!gang) return "Player is not in a gang";
      const member = gang.members.find((m) => m.name === (args.member as string));
      if (!member) return `Gang member not found: ${args.member as string}`;
      if (!Object.hasOwn(GangMemberTasks, args.task as string)) return `Unknown task: ${args.task as string}`;
      return null;
    },
    describe(args) {
      return `Set gang member ${args.member as string} task to ${args.task as string}`;
    },
    execute(args) {
      const gang = Player.gang;
      if (!gang) return { ok: false, message: "Player is not in a gang" };
      const member = gang.members.find((m) => m.name === (args.member as string));
      if (!member) return { ok: false, message: `Gang member not found: ${args.member as string}` };
      const success = member.assignToTask(args.task as string);
      if (!success) return { ok: false, message: `Failed to assign task: ${args.task as string}` };
      return { ok: true };
    },
  },

  recruitGangMember: {
    validate(args) {
      if (typeof args.name !== "string" || (args.name as string).length === 0)
        return "Missing or invalid name (must be a non-empty string)";
      const gang = Player.gang;
      if (!gang) return "Player is not in a gang";
      const canRecruit = gang.canRecruitMember();
      if (canRecruit !== RecruitmentResult.Success) return canRecruit;
      if (gang.members.some((m) => m.name === (args.name as string)))
        return `Name already in use: ${args.name as string}`;
      return null;
    },
    describe(args) {
      return `Recruit gang member named ${args.name as string}`;
    },
    execute(args) {
      const gang = Player.gang;
      if (!gang) return { ok: false, message: "Player is not in a gang" };
      const result = gang.recruitMember(args.name as string);
      if (result !== RecruitmentResult.Success) return { ok: false, message: result };
      return { ok: true };
    },
  },

  buyGangEquipment: {
    validate(args) {
      if (typeof args.member !== "string") return "Missing or invalid member (must be a string)";
      if (typeof args.equipment !== "string") return "Missing or invalid equipment (must be a string)";
      const gang = Player.gang;
      if (!gang) return "Player is not in a gang";
      const member = gang.members.find((m) => m.name === (args.member as string));
      if (!member) return `Gang member not found: ${args.member as string}`;
      const upg = GangMemberUpgrades[args.equipment as string];
      if (!upg) return `Unknown equipment: ${args.equipment as string}`;
      const cost = gang.getUpgradeCost(upg);
      if (Player.money < cost)
        return `Cannot afford equipment ${args.equipment as string} (costs $${cost.toFixed(0)})`;
      return null;
    },
    describe(args) {
      return `Buy equipment ${args.equipment as string} for gang member ${args.member as string}`;
    },
    execute(args) {
      const gang = Player.gang;
      if (!gang) return { ok: false, message: "Player is not in a gang" };
      const member = gang.members.find((m) => m.name === (args.member as string));
      if (!member) return { ok: false, message: `Gang member not found: ${args.member as string}` };
      const upg = GangMemberUpgrades[args.equipment as string];
      if (!upg) return { ok: false, message: `Unknown equipment: ${args.equipment as string}` };
      const success = member.buyUpgrade(upg);
      if (!success)
        return { ok: false, message: `Cannot buy ${args.equipment as string} (may already be owned or unaffordable)` };
      return { ok: true };
    },
  },

  // ─── Stock actions (GD-1) ─────────────────────────────────────────────────

  buyStock: {
    validate(args) {
      if (typeof args.symbol !== "string") return "Missing or invalid symbol (must be a string)";
      if (typeof args.shares !== "number" || args.shares <= 0) return "shares must be a positive number";
      if (!Player.hasWseAccount) return "Player does not have a WSE account";
      if (!Player.hasTixApiAccess) return "Player does not have TIX API access";
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return `Unknown stock symbol: ${args.symbol as string}`;
      const cost = getBuyTransactionCost(stock, args.shares as number, PositionType.Long);
      if (cost === null || Player.money < cost)
        return `Cannot afford to buy ${args.shares as number} shares of ${args.symbol as string}`;
      return null;
    },
    describe(args) {
      return `Buy ${args.shares as number} shares of ${args.symbol as string}`;
    },
    execute(args) {
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return { ok: false, message: `Unknown stock symbol: ${args.symbol as string}` };
      const ok = buyStockFn(stock, args.shares as number, null, { suppressDialog: true });
      if (!ok) return { ok: false, message: `Failed to buy shares of ${args.symbol as string}` };
      return { ok: true };
    },
  },

  sellStock: {
    validate(args) {
      if (typeof args.symbol !== "string") return "Missing or invalid symbol (must be a string)";
      if (typeof args.shares !== "number" || args.shares <= 0) return "shares must be a positive number";
      if (!Player.hasWseAccount) return "Player does not have a WSE account";
      if (!Player.hasTixApiAccess) return "Player does not have TIX API access";
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return `Unknown stock symbol: ${args.symbol as string}`;
      if (stock.playerShares <= 0) return `No long shares of ${args.symbol as string} to sell`;
      if (args.shares > stock.playerShares) return "Not enough shares to sell";
      return null;
    },
    describe(args) {
      return `Sell ${args.shares as number} shares of ${args.symbol as string}`;
    },
    execute(args) {
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return { ok: false, message: `Unknown stock symbol: ${args.symbol as string}` };
      const ok = sellStockFn(stock, args.shares as number, null, { suppressDialog: true });
      if (!ok) return { ok: false, message: `Failed to sell shares of ${args.symbol as string}` };
      return { ok: true };
    },
  },

  shortStock: {
    validate(args) {
      if (typeof args.symbol !== "string") return "Missing or invalid symbol (must be a string)";
      if (typeof args.shares !== "number" || args.shares <= 0) return "shares must be a positive number";
      if (!Player.hasWseAccount) return "Player does not have a WSE account";
      if (!Player.hasTixApiAccess) return "Player does not have TIX API access";
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return `Unknown stock symbol: ${args.symbol as string}`;
      const cost = getBuyTransactionCost(stock, args.shares as number, PositionType.Short);
      if (cost === null || Player.money < cost)
        return `Cannot afford to short ${args.shares as number} shares of ${args.symbol as string}`;
      return null;
    },
    describe(args) {
      return `Short ${args.shares as number} shares of ${args.symbol as string}`;
    },
    execute(args) {
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return { ok: false, message: `Unknown stock symbol: ${args.symbol as string}` };
      const ok = shortStockFn(stock, args.shares as number, null, { suppressDialog: true });
      if (!ok) return { ok: false, message: `Failed to short shares of ${args.symbol as string}` };
      return { ok: true };
    },
  },

  /** coverShort maps to sellShort per protocol.md. */
  coverShort: {
    validate(args) {
      if (typeof args.symbol !== "string") return "Missing or invalid symbol (must be a string)";
      if (typeof args.shares !== "number" || args.shares <= 0) return "shares must be a positive number";
      if (!Player.hasWseAccount) return "Player does not have a WSE account";
      if (!Player.hasTixApiAccess) return "Player does not have TIX API access";
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return `Unknown stock symbol: ${args.symbol as string}`;
      if (stock.playerShortShares <= 0) return `No short shares of ${args.symbol as string} to cover`;
      if (args.shares > stock.playerShortShares) return "Not enough short shares to cover";
      return null;
    },
    describe(args) {
      return `Cover short on ${args.shares as number} shares of ${args.symbol as string}`;
    },
    execute(args) {
      const stock = SymbolToStockMap[args.symbol as string];
      if (!stock) return { ok: false, message: `Unknown stock symbol: ${args.symbol as string}` };
      const ok = sellShortFn(stock, args.shares as number, null, { suppressDialog: true });
      if (!ok) return { ok: false, message: `Failed to cover short on ${args.symbol as string}` };
      return { ok: true };
    },
  },

  // ─── Hacknet actions (GD-2) ───────────────────────────────────────────────

  /**
   * hacknetPurchase { kind: "node"|"level"|"ram"|"core"|"cache", index?: number, qty?: number }.
   * Mirrors the Hacknet page buttons: purchaseHacknet / purchase{Level,Ram,Core,Cache}Upgrade.
   * qty (default 1) is passed as `levels` to the upgrade functions (which handle over-cap internally).
   * validate() is a read-only mirror of each purchase function's own guards (existence, affordability,
   * not-maxed, cache-only-in-server-mode); execute() calls the exact game function.
   */
  hacknetPurchase: {
    validate(args) {
      const kind = args.kind;
      if (typeof kind !== "string" || !HACKNET_KINDS.has(kind)) {
        return `Invalid kind: ${String(kind)}. Valid kinds: ${[...HACKNET_KINDS].join(", ")}`;
      }
      // qty is optional — default 1. Must be a positive integer if provided.
      const qty = args.qty === undefined ? 1 : args.qty;
      if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) {
        return "qty must be a positive integer";
      }
      const isServers = hasHacknetServers();

      if (kind === "node") {
        if (isServers) {
          if (hasMaxNumberHacknetServers()) return "Already at the maximum number of Hacknet Servers";
          const cost = getCostOfNextHacknetServer();
          if (!Number.isFinite(cost) || Player.money < cost) return "Cannot afford a new Hacknet Server";
        } else {
          const cost = getCostOfNextHacknetNode();
          if (!Number.isFinite(cost) || Player.money < cost) return "Cannot afford a new Hacknet Node";
        }
        return null;
      }

      const node = resolveHacknetNode(args.index);
      if (!node) return `No hacknet node/server at index: ${String(args.index)}`;

      if (kind === "cache") {
        if (!(node instanceof HacknetServer)) return "Cache upgrades are only available for Hacknet Servers";
        const cost = node.calculateCacheUpgradeCost(qty as number);
        if (!Number.isFinite(cost) || cost <= 0) return "Cache is already at maximum";
        if (Player.money < cost) return "Cannot afford the cache upgrade";
        return null;
      }

      let cost: number;
      if (kind === "level") cost = node.calculateLevelUpgradeCost(qty as number, Player.mults.hacknet_node_level_cost);
      else if (kind === "ram") cost = node.calculateRamUpgradeCost(qty as number, Player.mults.hacknet_node_ram_cost);
      else cost = node.calculateCoreUpgradeCost(qty as number, Player.mults.hacknet_node_core_cost);

      if (!Number.isFinite(cost) || cost <= 0) return `${kind} is already at maximum`;
      if (Player.money < cost) return `Cannot afford the ${kind} upgrade`;
      return null;
    },
    describe(args) {
      const kind = args.kind as string;
      const qty = typeof args.qty === "number" ? args.qty : 1;
      if (kind === "node") return hasHacknetServers() ? "Purchase a new Hacknet Server" : "Purchase a new Hacknet Node";
      return `Purchase ${kind}×${qty} upgrade for hacknet node #${args.index as number}`;
    },
    execute(args) {
      const kind = args.kind as string;
      const qty = typeof args.qty === "number" ? args.qty : 1;
      if (kind === "node") {
        const result = purchaseHacknet();
        if (result < 0) return { ok: false, message: "Failed to purchase a new hacknet node/server" };
        return { ok: true };
      }

      const node = resolveHacknetNode(args.index);
      if (!node) return { ok: false, message: `No hacknet node/server at index: ${String(args.index)}` };

      let ok: boolean;
      if (kind === "level") ok = purchaseLevelUpgrade(node, qty);
      else if (kind === "ram") ok = purchaseRamUpgrade(node, qty);
      else if (kind === "core") ok = purchaseCoreUpgrade(node, qty);
      else if (kind === "cache") {
        if (!(node instanceof HacknetServer)) return { ok: false, message: "Cache upgrades require a Hacknet Server" };
        ok = purchaseCacheUpgrade(node, qty);
      } else return { ok: false, message: `Unknown kind: ${kind}` };

      if (!ok) return { ok: false, message: `Failed to purchase ${kind} upgrade (unaffordable or maxed)` };
      return { ok: true };
    },
  },

  // ─── Corporation actions (GD-3) ──────────────────────────────────────────────

  /**
   * corpBuyWarehouse { division, city }
   * Mirrors the Corp page "Expand to new city" warehouse button.
   * Actions.purchaseWarehouse silently returns (no throw) on failure, so the validate() guard
   * (corp exists, division exists) is the primary check; rely on try/catch for edge cases.
   */
  corpBuyWarehouse: {
    validate(args) {
      if (typeof args.division !== "string") return "Missing or invalid division (must be a string)";
      if (typeof args.city !== "string") return "Missing or invalid city (must be a string)";
      const corp = Player.corporation;
      if (!corp) return "Player has no corporation";
      if (!corp.divisions.has(args.division as string)) return `Division not found: ${args.division as string}`;
      return null;
    },
    describe(args) {
      return `Buy warehouse in ${args.city as string} for division ${args.division as string}`;
    },
    execute(args) {
      try {
        const corp = Player.corporation;
        if (!corp) return { ok: false, message: "Player has no corporation" };
        const division = corp.divisions.get(args.division as string);
        if (!division) return { ok: false, message: `Division not found: ${args.division as string}` };
        corpPurchaseWarehouseFn(corp, division, args.city as CityName);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  /**
   * corpHireAdVert { division }
   * Mirrors the Corp page "Hire AdVert" button.
   * Actions.hireAdVert silently returns if the corp cannot afford it.
   */
  corpHireAdVert: {
    validate(args) {
      if (typeof args.division !== "string") return "Missing or invalid division (must be a string)";
      const corp = Player.corporation;
      if (!corp) return "Player has no corporation";
      if (!corp.divisions.has(args.division as string)) return `Division not found: ${args.division as string}`;
      return null;
    },
    describe(args) {
      return `Hire AdVert for division ${args.division as string}`;
    },
    execute(args) {
      try {
        const corp = Player.corporation;
        if (!corp) return { ok: false, message: "Player has no corporation" };
        const division = corp.divisions.get(args.division as string);
        if (!division) return { ok: false, message: `Division not found: ${args.division as string}` };
        corpHireAdVertFn(corp, division);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  /**
   * corpBuyTea { division, city }
   * Mirrors the Corp page "Buy Tea" button for a specific office.
   * Actions.buyTea returns boolean; we surface false as ok:false.
   */
  corpBuyTea: {
    validate(args) {
      if (typeof args.division !== "string") return "Missing or invalid division (must be a string)";
      if (typeof args.city !== "string") return "Missing or invalid city (must be a string)";
      const corp = Player.corporation;
      if (!corp) return "Player has no corporation";
      const division = corp.divisions.get(args.division as string);
      if (!division) return `Division not found: ${args.division as string}`;
      if (!division.offices[args.city as CityName])
        return `No office in ${args.city as string} for division ${args.division as string}`;
      return null;
    },
    describe(args) {
      return `Buy tea for office in ${args.city as string} (division ${args.division as string})`;
    },
    execute(args) {
      try {
        const corp = Player.corporation;
        if (!corp) return { ok: false, message: "Player has no corporation" };
        const division = corp.divisions.get(args.division as string);
        if (!division) return { ok: false, message: `Division not found: ${args.division as string}` };
        const office = division.offices[args.city as CityName];
        if (!office) return { ok: false, message: `No office in ${args.city as string}` };
        const ok = corpBuyTeaFn(corp, office);
        if (!ok) return { ok: false, message: "Could not buy tea (insufficient funds or tea already ordered)" };
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  /**
   * corpResearch { division, research }
   * Mirrors the Corp page "Research" button.
   * Actions.research throws on insufficient research points, invalid prereqs, etc.
   */
  corpResearch: {
    validate(args) {
      if (typeof args.division !== "string") return "Missing or invalid division (must be a string)";
      if (typeof args.research !== "string") return "Missing or invalid research (must be a string)";
      const corp = Player.corporation;
      if (!corp) return "Player has no corporation";
      if (!corp.divisions.has(args.division as string)) return `Division not found: ${args.division as string}`;
      return null;
    },
    describe(args) {
      return `Research ${args.research as string} for division ${args.division as string}`;
    },
    execute(args) {
      try {
        const corp = Player.corporation;
        if (!corp) return { ok: false, message: "Player has no corporation" };
        const division = corp.divisions.get(args.division as string);
        if (!division) return { ok: false, message: `Division not found: ${args.division as string}` };
        corpResearchFn(division, args.research as CorpResearchName);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  /**
   * corpMakeProduct { division, city, productName, designInvest, marketingInvest }
   * Mirrors the Corp page "Develop Product" button.
   * Actions.makeProduct throws on many conditions (no office in city, not a product industry,
   * insufficient funds, name collision, at max products). All caught and returned as ok:false.
   */
  corpMakeProduct: {
    validate(args) {
      if (typeof args.division !== "string") return "Missing or invalid division (must be a string)";
      if (typeof args.city !== "string") return "Missing or invalid city (must be a string)";
      if (typeof args.productName !== "string") return "Missing or invalid productName (must be a string)";
      const corp = Player.corporation;
      if (!corp) return "Player has no corporation";
      if (!corp.divisions.has(args.division as string)) return `Division not found: ${args.division as string}`;
      return null;
    },
    describe(args) {
      return `Develop product ${args.productName as string} in ${args.city as string} (division ${args.division as string})`;
    },
    execute(args) {
      try {
        const corp = Player.corporation;
        if (!corp) return { ok: false, message: "Player has no corporation" };
        const division = corp.divisions.get(args.division as string);
        if (!division) return { ok: false, message: `Division not found: ${args.division as string}` };
        corpMakeProductFn(
          corp,
          division,
          args.city as CityName,
          args.productName as string,
          typeof args.designInvest === "number" ? args.designInvest : 0,
          typeof args.marketingInvest === "number" ? args.marketingInvest : 0,
        );
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  // ─── IPvGo actions (GE-1) ─────────────────────────────────────────────────

  /**
   * goPlayMove { x, y } — place a black stone at (x, y) and trigger the AI response.
   *
   * Mirrors the NS makePlayerMove path: validate → makeMove → handleNextTurn (fire-and-forget).
   * Does NOT use the React clickHandler or Snackbar paths to avoid UI side effects.
   * validate() is read-only (same guards as validateMove in netscriptGoImplementation).
   * Player is always black.
   */
  goPlayMove: {
    validate(args) {
      if (typeof args.x !== "number" || !Number.isInteger(args.x)) return "Missing or invalid x (must be an integer)";
      if (typeof args.y !== "number" || !Number.isInteger(args.y)) return "Missing or invalid y (must be an integer)";
      const board = Go.currentGame;
      if (board.previousPlayer === null) return "Game is over. Start a new game.";
      if (board.previousPlayer === GoColor.black) return "It is not your turn (you play as black)";
      const x = args.x as number;
      const y = args.y as number;
      const size = board.board.length;
      if (x < 0 || x >= size || y < 0 || y >= size) {
        return `Coordinates (${x}, ${y}) are out of bounds for a ${size}x${size} board`;
      }
      const validity = evaluateIfMoveIsValid(board, x, y, GoColor.black);
      if (validity !== GoValidity.valid) return `Invalid move at (${x}, ${y}): ${validity}`;
      return null;
    },
    describe(args) {
      return `Play Go move at (${args.x as number}, ${args.y as number})`;
    },
    execute(args) {
      const boardState = Go.currentGame;
      const x = args.x as number;
      const y = args.y as number;
      if (boardState.previousPlayer === null) return { ok: false, message: "Game is over" };
      const validity = evaluateIfMoveIsValid(boardState, x, y, GoColor.black);
      if (validity !== GoValidity.valid) return { ok: false, message: `Invalid move: ${validity}` };
      const moved = makeMove(boardState, x, y, GoColor.black);
      if (!moved) return { ok: false, message: "Move could not be applied" };
      // Fire-and-forget AI response; handleNextTurn emits GoEvents internally.
      void handleNextTurn(boardState, true).catch(() => {});
      return { ok: true, message: `Played move at (${x}, ${y})` };
    },
  },

  /**
   * goPass {} — pass the current turn as black and trigger the AI response.
   * Mirrors passTurn + handleNextTurn from the NS path.
   */
  goPass: {
    validate(_args) {
      if (Go.currentGame.previousPlayer === null) return "Game is over. Start a new game.";
      if (Go.currentGame.previousPlayer === GoColor.black) return "It is not your turn (you play as black)";
      return null;
    },
    describe(_args) {
      return "Pass Go turn";
    },
    execute(_args) {
      const boardState = Go.currentGame;
      if (boardState.previousPlayer === null) return { ok: false, message: "Game is over" };
      passTurn(boardState, GoColor.black);
      void handleNextTurn(boardState, true).catch(() => {});
      return { ok: true, message: "Turn passed" };
    },
  },

  // ─── Bladeburner actions (GE-1) ──────────────────────────────────────────

  /**
   * bladeburnerStartAction { type, name } — start a Bladeburner action.
   *
   * type = "contract" | "operation" | "blackop" | "general" (protocol strings).
   * validate() is read-only: checks bladeburner exists, type/name resolves, and action is available.
   * execute() calls bladeburner.startAction(action.id) which mirrors the UI / NS path.
   */
  bladeburnerStartAction: {
    validate(args) {
      if (typeof args.type !== "string") return "Missing or invalid type (must be a string)";
      if (typeof args.name !== "string") return "Missing or invalid name (must be a string)";
      const bb = Player.bladeburner;
      if (!bb) return "Player is not in Bladeburner";
      const bbType = PROTOCOL_TYPE_TO_BB[args.type as string];
      if (!bbType) {
        return `Invalid action type: ${args.type as string}. Valid types: ${Object.keys(PROTOCOL_TYPE_TO_BB).join(", ")}`;
      }
      const action = bb.getActionFromTypeAndName(bbType, args.name as string);
      if (!action) return `Unknown action: ${args.name as string} (type: ${args.type as string})`;
      const avail = action.getAvailability(bb);
      if (!avail.available) return `Action unavailable: ${avail.error}`;
      return null;
    },
    describe(args) {
      return `Start Bladeburner action ${args.type as string}/${args.name as string}`;
    },
    execute(args) {
      const bb = Player.bladeburner;
      if (!bb) return { ok: false, message: "Player is not in Bladeburner" };
      const bbType = PROTOCOL_TYPE_TO_BB[args.type as string];
      if (!bbType) return { ok: false, message: `Invalid action type: ${args.type as string}` };
      const action = bb.getActionFromTypeAndName(bbType, args.name as string);
      if (!action) return { ok: false, message: `Unknown action: ${args.name as string}` };
      const attempt = bb.startAction(action.id);
      return { ok: attempt.success === true, message: attempt.message };
    },
  },

  /**
   * bladeburnerStopAction {} — stop the current Bladeburner action (reset to idle).
   * Calls bladeburner.startAction(null) which calls resetAction() internally.
   */
  bladeburnerStopAction: {
    validate(_args) {
      if (!Player.bladeburner) return "Player is not in Bladeburner";
      return null;
    },
    describe(_args) {
      return "Stop current Bladeburner action";
    },
    execute(_args) {
      const bb = Player.bladeburner;
      if (!bb) return { ok: false, message: "Player is not in Bladeburner" };
      const attempt = bb.startAction(null);
      return { ok: attempt.success === true, message: attempt.message };
    },
  },

  // ─── Player work/crime/study/purchase actions (GG-1) ─────────────────────

  /**
   * startFactionWork { faction, workType: "hacking"|"field"|"security" }
   * Mirrors the FactionRoot page: Player.startWork(new FactionWork({...})).
   * validate() checks membership, gang-faction guard, and that the faction offers
   * the requested work type (same flags the FactionRoot buttons check).
   * singularity: true suppresses the finish dialog (same as NS singularity API).
   */
  startFactionWork: {
    validate(args) {
      if (typeof args.faction !== "string") return "Missing or invalid faction (must be a string)";
      if (typeof args.workType !== "string") return "Missing or invalid workType (must be a string)";
      const validWorkTypes = Object.values(FactionWorkType);
      if (!validWorkTypes.includes(args.workType as FactionWorkType))
        return `Invalid workType: ${args.workType as string}. Valid: ${validWorkTypes.join(", ")}`;
      const factionName = args.faction as FactionName;
      const faction = Factions[factionName] as Faction | undefined;
      if (!faction) return `Unknown faction: ${args.faction as string}`;
      if (!Player.factions.includes(factionName))
        return `You are not a member of faction: ${args.faction as string}`;
      if (Player.gang && Player.getGangName() === faction.name)
        return `Cannot do faction work for your own gang faction`;
      const info = FactionInfos[factionName];
      const wt = args.workType as FactionWorkType;
      if (wt === FactionWorkType.hacking && !info.offerHackingWork)
        return `Faction ${args.faction as string} does not offer hacking work`;
      if (wt === FactionWorkType.field && !info.offerFieldWork)
        return `Faction ${args.faction as string} does not offer field work`;
      if (wt === FactionWorkType.security && !info.offerSecurityWork)
        return `Faction ${args.faction as string} does not offer security work`;
      return null;
    },
    describe(args) {
      return `Start ${args.workType as string} work for faction ${args.faction as string}`;
    },
    execute(args) {
      Player.startWork(
        new FactionWork({
          singularity: true,
          faction: args.faction as FactionName,
          factionWorkType: args.workType as FactionWorkType,
        }),
      );
      return { ok: true };
    },
  },

  /**
   * startCompanyWork { company }
   * Mirrors the CompanyLocation page: Player.startWork(new CompanyWork({...})).
   * validate() checks that the player has a job at the company.
   */
  startCompanyWork: {
    validate(args) {
      if (typeof args.company !== "string") return "Missing or invalid company (must be a string)";
      if (!getEnumHelper("CompanyName").isMember(args.company))
        return `Unknown company: ${args.company as string}`;
      if (!Player.jobs[args.company as CompanyName])
        return `You do not have a job at ${args.company as string}`;
      return null;
    },
    describe(args) {
      return `Start work at company ${args.company as string}`;
    },
    execute(args) {
      Player.startWork(
        new CompanyWork({
          singularity: true,
          companyName: args.company as CompanyName,
        }),
      );
      return { ok: true };
    },
  },

  /**
   * startClass { location, classType }
   * Mirrors UniversityLocation and GymLocation pages: Player.startWork(new ClassWork({...})).
   * location must be a University or Gym location in the player's current city.
   * classType must be a valid UniversityClassType (for universities) or GymType (for gyms).
   */
  startClass: {
    validate(args) {
      if (typeof args.location !== "string") return "Missing or invalid location (must be a string)";
      if (typeof args.classType !== "string") return "Missing or invalid classType (must be a string)";
      const loc = Locations[args.location as LocationName];
      if (!loc) return `Unknown location: ${args.location as string}`;
      const isUniversity = loc.types.includes(LocationType.University);
      const isGym = loc.types.includes(LocationType.Gym);
      if (!isUniversity && !isGym)
        return `Location ${args.location as string} is not a university or gym`;
      if (loc.city !== null && loc.city !== Player.city)
        return `Location ${args.location as string} is in ${loc.city as string}, but you are in ${Player.city}`;
      const isValidUniversityCourse = getEnumHelper("UniversityClassType").isMember(args.classType);
      const isValidGymExercise = getEnumHelper("GymType").isMember(args.classType);
      if (!isValidUniversityCourse && !isValidGymExercise)
        return `Invalid classType: ${args.classType as string}`;
      if (isGym && !isValidGymExercise)
        return `${args.classType as string} is not a valid gym exercise (valid: ${Object.values(GymType).join(", ")})`;
      if (isUniversity && !isValidUniversityCourse)
        return `${args.classType as string} is not a valid university course (valid: ${Object.values(UniversityClassType).join(", ")})`;
      return null;
    },
    describe(args) {
      return `Study ${args.classType as string} at ${args.location as string}`;
    },
    execute(args) {
      const classType = (
        getEnumHelper("UniversityClassType").isMember(args.classType)
          ? getEnumHelper("UniversityClassType").getMember(args.classType, { alwaysMatch: true })
          : getEnumHelper("GymType").getMember(args.classType, { alwaysMatch: true })
      ) as ClassType;
      Player.startWork(
        new ClassWork({
          singularity: true,
          classType,
          location: args.location as LocationName,
        }),
      );
      return { ok: true };
    },
  },

  /**
   * commitCrime { crime: CrimeType }
   * Mirrors the Slums page: Crime.commit() which calls Player.startWork(new CrimeWork({...})).
   */
  commitCrime: {
    validate(args) {
      if (!getEnumHelper("CrimeType").isMember(args.crime))
        return `Unknown crime: ${String(args.crime)}. Valid: ${Object.values(CrimeType).join(", ")}`;
      return null;
    },
    describe(args) {
      return `Commit crime: ${String(args.crime)}`;
    },
    execute(args) {
      const crimeType = getEnumHelper("CrimeType").getMember(args.crime, { alwaysMatch: true });
      Player.startWork(new CrimeWork({ crimeType, singularity: true }));
      return { ok: true };
    },
  },

  /**
   * stopWork {}
   * Mirrors the "Stop" button on the Work In Progress page: Player.finishWork(true).
   * Always succeeds (no-op if not working).
   */
  stopWork: {
    validate(_args) {
      return null;
    },
    describe(_args) {
      return "Stop current work";
    },
    execute(_args) {
      Player.finishWork(true);
      return { ok: true };
    },
  },

  /**
   * purchaseServer { hostname: string, ram: number }
   * Mirrors PurchaseServerModal → purchaseServer (ServerPurchases.ts).
   * execute() reimplements the core creation logic without dialogBoxCreate side-effects,
   * since the original function pops a dialog on both success and failure paths.
   */
  purchaseServer: {
    validate(args) {
      if (typeof args.hostname !== "string" || (args.hostname as string).length === 0)
        return "Missing or invalid hostname (must be a non-empty string)";
      if (typeof args.ram !== "number" || !Number.isInteger(args.ram as number) || (args.ram as number) <= 0)
        return "ram must be a positive integer";
      const hostname = args.hostname as string;
      const ram = args.ram as number;
      if (hostname.startsWith("hacknet-node-") || hostname.startsWith("hacknet-server-"))
        return `'${hostname}' is a reserved hostname`;
      if (GetServer(hostname)) return `Hostname '${hostname}' is already in use`;
      const cost = getCloudServerCost(ram);
      if (!Number.isFinite(cost))
        return `Invalid RAM: ${ram}. Must be a power of 2 within the server limit`;
      if (Player.purchasedServers.length >= getCloudServerLimit())
        return `Reached the maximum of ${getCloudServerLimit()} purchased servers`;
      if (!Player.canAfford(cost)) return `Cannot afford server with ${ram}GB RAM (costs $${cost.toFixed(0)})`;
      return null;
    },
    describe(args) {
      return `Purchase server "${args.hostname as string}" with ${args.ram as number}GB RAM`;
    },
    execute(args) {
      const hostname = args.hostname as string;
      const ram = args.ram as number;
      const cost = getCloudServerCost(ram);
      if (!Number.isFinite(cost)) return { ok: false, message: "Invalid RAM value" };
      if (!Player.canAfford(cost)) return { ok: false, message: "Insufficient funds" };
      if (Player.purchasedServers.length >= getCloudServerLimit())
        return { ok: false, message: "Maximum server count reached" };
      try {
        const newServ = safelyCreateUniqueServer({
          adminRights: true,
          hostname,
          ip: createUniqueRandomIp(),
          isConnectedTo: false,
          maxRam: ram,
          organizationName: "",
          purchasedByPlayer: true,
        });
        AddToAllServers(newServ);
        Player.purchasedServers.push(newServ.hostname);
        const homeComputer = Player.getHomeComputer();
        homeComputer.serversOnNetwork.push(newServ.hostname);
        newServ.serversOnNetwork.push(homeComputer.hostname);
        Player.loseMoney(cost, "servers");
        return { ok: true, message: `Server '${newServ.hostname}' purchased` };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  },

  /**
   * upgradeHomeRam {}
   * Mirrors RamButton → purchaseRamForHomeComputer (ServerPurchases.ts).
   * validate() catches all failure conditions so execute() never hits the dialogBoxCreate paths.
   */
  upgradeHomeRam: {
    validate(_args) {
      const home = Player.getHomeComputer();
      if (
        (Player.bitNodeOptions.restrictHomePCUpgrade && home.maxRam >= 128) ||
        home.maxRam >= ServerConstants.HomeComputerMaxRam
      ) {
        return "Home computer RAM is already at its maximum";
      }
      const cost = Player.getUpgradeHomeRamCost();
      if (!Player.canAfford(cost)) return `Cannot afford RAM upgrade (costs $${cost.toFixed(0)})`;
      return null;
    },
    describe(_args) {
      const home = Player.getHomeComputer();
      return `Upgrade home RAM from ${home.maxRam}GB to ${home.maxRam * 2}GB`;
    },
    execute(_args) {
      // validate() ensures this path never hits dialogBoxCreate.
      purchaseRamForHomeComputer();
      return { ok: true };
    },
  },

  /**
   * purchaseTor {}
   * Mirrors TorButton → purchaseTorRouter (TorButton.tsx).
   * execute() calls the underlying Player.loseMoney + getTorRouter() directly to avoid
   * the success dialog that purchaseTorRouter() pops.
   */
  purchaseTor: {
    validate(_args) {
      if (Player.hasTorRouter()) return "You already have a TOR Router";
      if (!Player.canAfford(CONSTANTS.TorRouterCost))
        return `Cannot afford TOR Router (costs $${CONSTANTS.TorRouterCost.toFixed(0)})`;
      return null;
    },
    describe(_args) {
      return "Purchase TOR Router";
    },
    execute(_args) {
      Player.loseMoney(CONSTANTS.TorRouterCost, "other");
      getTorRouter();
      return { ok: true };
    },
  },

  // ─── Sleeve actions (GD-2) ────────────────────────────────────────────────

  /**
   * setSleeveTask { index: number, task: SleeveTaskSpec } where SleeveTaskSpec is a tagged union:
   *   {type:"recovery"} | {type:"sync"} | {type:"crime", crime} | {type:"faction", faction, workType} |
   *   {type:"company", company} | {type:"gym", gym, stat} | {type:"university", uni, class} | {type:"idle"}.
   * Mirrors the Sleeves page: calls the matching sleeve.* method. validate() checks the index range and
   * that enum params (crime/workType/stat/class/company/faction) are members; the sleeve methods return
   * bool for the rest (e.g. wrong city, faction not offered), which becomes ok:false.
   */
  setSleeveTask: {
    validate(args) {
      if (typeof args.index !== "number" || !Number.isInteger(args.index)) return "Missing or invalid index";
      if (args.index < 0 || args.index >= Player.sleeves.length) return `No sleeve at index: ${String(args.index)}`;
      const task = args.task;
      if (typeof task !== "object" || task === null) return "Missing or invalid task spec";
      const spec = task as Record<string, unknown>;
      switch (spec.type) {
        case "recovery":
        case "sync":
        case "synchronize":
        case "idle":
          return null;
        case "crime":
          return getEnumHelper("CrimeType").isMember(spec.crime) ? null : `Invalid crime: ${String(spec.crime)}`;
        case "faction":
          if (!getEnumHelper("FactionName").isMember(spec.faction)) return `Invalid faction: ${String(spec.faction)}`;
          if (!getEnumHelper("FactionWorkType").isMember(spec.workType))
            return `Invalid workType: ${String(spec.workType)}`;
          return null;
        case "company":
          return getEnumHelper("CompanyName").isMember(spec.company)
            ? null
            : `Invalid company: ${String(spec.company)}`;
        case "gym":
          if (typeof spec.gym !== "string") return "Missing or invalid gym";
          return getEnumHelper("GymType").isMember(spec.stat) ? null : `Invalid stat: ${String(spec.stat)}`;
        case "university":
          if (typeof spec.uni !== "string") return "Missing or invalid uni";
          return getEnumHelper("UniversityClassType").isMember(spec.class)
            ? null
            : `Invalid class: ${String(spec.class)}`;
        default:
          return `Unknown task type: ${String(spec.type)}`;
      }
    },
    describe(args) {
      const spec = args.task as Record<string, unknown>;
      return `Set sleeve #${args.index as number} task to ${String(spec.type)}`;
    },
    execute(args) {
      const sleeve = Player.sleeves[args.index as number];
      if (!sleeve) return { ok: false, message: `No sleeve at index: ${String(args.index)}` };
      const spec = args.task as Record<string, unknown>;
      try {
        let ok: boolean;
        switch (spec.type) {
          case "recovery":
            ok = sleeve.shockRecovery();
            break;
          case "sync":
          case "synchronize":
            ok = sleeve.synchronize();
            break;
          case "idle":
            sleeve.stopWork();
            ok = true;
            break;
          case "crime":
            ok = sleeve.commitCrime(getEnumHelper("CrimeType").getMember(spec.crime, { alwaysMatch: true }));
            break;
          case "faction":
            ok = sleeve.workForFaction(
              getEnumHelper("FactionName").getMember(spec.faction, { alwaysMatch: true }),
              getEnumHelper("FactionWorkType").getMember(spec.workType, { alwaysMatch: true }),
            );
            break;
          case "company":
            ok = sleeve.workForCompany(getEnumHelper("CompanyName").getMember(spec.company, { alwaysMatch: true }));
            break;
          case "gym":
            ok = sleeve.workoutAtGym(
              spec.gym as string,
              getEnumHelper("GymType").getMember(spec.stat, { alwaysMatch: true }),
            );
            break;
          case "university":
            ok = sleeve.takeUniversityCourse(
              spec.uni as string,
              getEnumHelper("UniversityClassType").getMember(spec.class, { alwaysMatch: true }),
            );
            break;
          default:
            return { ok: false, message: `Unknown task type: ${String(spec.type)}` };
        }
        if (!ok) return { ok: false, message: `Sleeve refused task: ${String(spec.type)}` };
        return { ok: true };
      } catch (e) {
        return { ok: false, message: `Failed to set sleeve task: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  },

  // ─── GI-1: home cores, job application, navigate ─────────────────────────

  /**
   * upgradeHomeCores {}
   * Mirrors CoresButton (Locations/ui/CoresButton.tsx): Player.getUpgradeHomeCoresCost() + cpuCores++.
   * validate() catches all failure conditions so execute() never hits the UI dialog paths.
   */
  upgradeHomeCores: {
    validate(_args) {
      const home = Player.getHomeComputer();
      if (Player.bitNodeOptions.restrictHomePCUpgrade || home.cpuCores >= 8) {
        return "Home computer cores are already at maximum";
      }
      const cost = Player.getUpgradeHomeCoresCost();
      if (!Player.canAfford(cost)) return `Cannot afford core upgrade (costs $${cost.toFixed(0)})`;
      return null;
    },
    describe(_args) {
      const home = Player.getHomeComputer();
      return `Upgrade home cores from ${home.cpuCores} to ${home.cpuCores + 1}`;
    },
    execute(_args) {
      const home = Player.getHomeComputer();
      if (Player.bitNodeOptions.restrictHomePCUpgrade || home.cpuCores >= 8) {
        return { ok: false, message: "Home computer cores are already at maximum" };
      }
      const cost = Player.getUpgradeHomeCoresCost();
      if (!Player.canAfford(cost)) return { ok: false, message: "Cannot afford core upgrade" };
      Player.loseMoney(cost, "servers");
      home.cpuCores++;
      return { ok: true };
    },
  },

  /**
   * applyForJob { company: CompanyName, position: JobName }
   * Mirrors ApplyToJobButton (Company/ui/ApplyToJobButton.tsx): Player.applyForJob(company, position).
   * The `position` arg must be a JobName string (e.g. from canApply in getCityDetail).
   */
  applyForJob: {
    validate(args) {
      if (typeof args.company !== "string") return "Missing or invalid company (must be a string)";
      if (typeof args.position !== "string") return "Missing or invalid position (must be a string)";
      if (!getEnumHelper("CompanyName").isMember(args.company))
        return `Unknown company: ${args.company as string}`;
      const companyName = args.company as CompanyName;
      const comp = Companies[companyName];
      if (!comp) return `Unknown company: ${args.company as string}`;
      if (!getEnumHelper("JobName").isMember(args.position))
        return `Unknown position: ${args.position as string}`;
      const jobName = getEnumHelper("JobName").getMember(args.position, { alwaysMatch: true });
      const position = CompanyPositions[jobName];
      if (!position) return `Unknown position: ${args.position as string}`;
      if (!comp.hasPosition(position)) return `Company ${args.company as string} does not have position ${args.position as string}`;
      return null;
    },
    describe(args) {
      return `Apply for position ${args.position as string} at ${args.company as string}`;
    },
    execute(args) {
      const companyName = args.company as CompanyName;
      const comp = Companies[companyName];
      if (!comp) return { ok: false, message: `Unknown company: ${args.company as string}` };
      const jobName = getEnumHelper("JobName").getMember(args.position, { alwaysMatch: true });
      const position = CompanyPositions[jobName];
      if (!position) return { ok: false, message: `Unknown position: ${args.position as string}` };
      const result = Player.applyForJob(comp, position);
      return { ok: result.success, message: result.message };
    },
  },

  /**
   * openLocationInGame { location: LocationName }
   * Navigates the game UI to the given location page, mirroring a city-map click.
   * Mirrors City.tsx: Router.toPage(Page.Location, { location }).
   * The `[vscode]` terminal echo happens in the dispatcher before this runs.
   */
  openLocationInGame: {
    validate(args) {
      if (typeof args.location !== "string") return "Missing or invalid location (must be a string)";
      const loc = Locations[args.location as string];
      if (!loc) return `Unknown location: ${args.location as string}`;
      return null;
    },
    describe(args) {
      return `Open location ${args.location as string} in game`;
    },
    execute(args) {
      const loc = Locations[args.location as string];
      if (!loc) return { ok: false, message: `Unknown location: ${args.location as string}` };
      try {
        Router.toPage(ComplexPage.Location, { location: loc });
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
  },
};

/**
 * Invoke a named game action. Per protocol.md:
 *   1. Validates preconditions (same as the relevant UI page).
 *   2. Appends `[vscode] <describe>` to the game terminal.
 *   3. Executes the action using the exact function the React page calls.
 *
 * Protocol: invokeAction { action: string, args: object } → { ok: boolean, message?: string }
 * Game refusals return result: { ok: false, message } (not an error response) so the extension
 * can toast the message without treating the channel as broken.
 */
export async function invokeAction(msg: RFAMessage): Promise<RFAMessage> {
  const params = msg.params as unknown as { action?: unknown; args?: unknown } | undefined;
  const action = params && typeof params.action === "string" ? params.action : null;
  const args =
    params && typeof params.args === "object" && params.args !== null
      ? (params.args as Record<string, unknown>)
      : {};

  if (action === null) {
    return new RFAMessage({ error: "Missing or invalid params: action must be a string", id: msg.id });
  }

  const impl = actionRegistry[action];
  if (!impl) {
    return new RFAMessage({
      result: { ok: false, message: `Unknown action: ${action}` } as unknown as Record<string, unknown>,
      id: msg.id,
    });
  }

  const validationError = impl.validate(args);
  if (validationError !== null) {
    return new RFAMessage({
      result: { ok: false, message: validationError } as unknown as Record<string, unknown>,
      id: msg.id,
    });
  }

  // Echo to terminal before executing (per protocol).
  Terminal.append(new Output(`[vscode] ${impl.describe(args)}`, "info"));

  const result = impl.execute(args);
  return new RFAMessage({
    result: result as unknown as Record<string, unknown>,
    id: msg.id,
  });
}
