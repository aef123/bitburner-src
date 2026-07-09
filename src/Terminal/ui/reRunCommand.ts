import { Player } from "@player";
import { Terminal } from "../../Terminal";
import { CommandBlockStart } from "../OutputTypes";

/**
 * Echo the command as a block start, then execute it — the same pair a typed command produces
 * (TerminalInput's Enter handler). Shared by the history panel's rows/↻ buttons and the target
 * panel's quick actions: without the echo, the command's output would group under the PREVIOUS
 * command block at render time (groupOutputHistory attaches output to the latest block start).
 */
export function reRunCommand(command: string): void {
  if (Terminal.action !== null) return;
  Terminal.append(new CommandBlockStart(command, Player.getCurrentServer().hostname, Terminal.cwd()));
  void Terminal.executeCommands(command); // Async function, errors will hit the uncaught handler
}
