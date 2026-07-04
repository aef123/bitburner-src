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
import { joinFaction } from "../Faction/FactionHelpers";
import { Factions } from "../Faction/Factions";
import { FactionName } from "@enums";

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
