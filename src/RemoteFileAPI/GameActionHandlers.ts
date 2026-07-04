/**
 * Action handlers for the Remote File API (GA-3).
 *
 * These handlers perform game-side side effects (as opposed to the pure read-only serializers).
 * Each is an async RFARequestHandler-compatible function and must never throw — errors become
 * error-response RFAMessages so the connection stays alive.
 */
import { Terminal } from "../Terminal";
import { mapTerminalEntry } from "./StateSerializers";
import { RFAMessage } from "./MessageDefinitions";

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
