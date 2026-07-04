/**
 * Tests for the runTerminalCommand action handler (Task GA-3).
 *
 * TDD: this file was written BEFORE GameActionHandlers.ts existed — imports will fail until implementation.
 */
import { runTerminalCommand } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Terminal } from "../../../src/Terminal";
import { Output } from "../../../src/Terminal/OutputTypes";
import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { AddToAllServers, prestigeAllServers } from "../../../src/Server/AllServers";
import { Server } from "../../../src/Server/Server";
import type { IPAddress } from "../../../src/Types/strings";
import type { TerminalAction } from "../../../src/Terminal/TerminalAction";

function setupWorld(): void {
  prestigeAllServers();
  setPlayer(new PlayerObject());
  const home = new Server({ hostname: "home", ip: "10.0.0.1" as IPAddress, maxRam: 64, adminRights: true });
  home.purchasedByPlayer = true;
  AddToAllServers(home);
  Player.currentServer = "home";
}

function makeMsg(command: string, id = 1): RFAMessage {
  return new RFAMessage({ method: "runTerminalCommand", params: { command } as never, id });
}

describe("runTerminalCommand handler", () => {
  const savedAction = Terminal.action;
  const savedHistory = Terminal.outputHistory;

  beforeEach(() => {
    setupWorld();
    Terminal.action = null;
    Terminal.outputHistory = [];
  });

  afterEach(() => {
    Terminal.action = savedAction;
    Terminal.outputHistory = savedHistory;
    Player.currentWork = null;
  });

  test("help command returns ok:true with non-empty output array", async () => {
    const response = await runTerminalCommand(makeMsg("help"));
    expect(response.error).toBeUndefined();
    const result = response.result as { ok: boolean; output: unknown[] };
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.output)).toBe(true);
    expect(result.output.length).toBeGreaterThan(0);
  });

  test("busy path: Terminal.action non-null → ok:false, output:[], busyRejected:true", async () => {
    Terminal.action = { cancel: () => {}, finished: Promise.resolve(), getProgressText: () => "" } as TerminalAction;
    const response = await runTerminalCommand(makeMsg("help", 2));
    expect(response.error).toBeUndefined();
    const result = response.result as { ok: boolean; output: unknown[]; busyRejected?: boolean };
    expect(result.ok).toBe(false);
    expect(result.output).toEqual([]);
    expect(result.busyRejected).toBe(true);
  });

  test("delta slicing: output only contains entries produced after the command fires", async () => {
    // Pre-seed history with a line that should NOT appear in the result.
    Terminal.outputHistory = [new Output("pre-existing line", "primary")];
    const response = await runTerminalCommand(makeMsg("hostname", 3));
    const result = response.result as { ok: boolean; output: { kind: string; text: string }[] };
    expect(result.ok).toBe(true);
    // No entry should carry the pre-existing line text.
    expect(result.output.some((e) => e.text === "pre-existing line")).toBe(false);
    // At least the hostname echo should appear.
    expect(result.output.length).toBeGreaterThan(0);
  });

  test("output entries are JSON-pure TerminalEntry objects", async () => {
    const response = await runTerminalCommand(makeMsg("help", 4));
    const result = response.result as { ok: boolean; output: unknown[] };
    expect(result.ok).toBe(true);
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).toEqual(result);
    for (const entry of result.output as { kind: string; text: string }[]) {
      expect(["output", "link", "raw"]).toContain(entry.kind);
      expect(typeof entry.text).toBe("string");
    }
  });

  test("missing command param returns an error response", async () => {
    const badMsg = new RFAMessage({ method: "runTerminalCommand", id: 5 });
    const response = await runTerminalCommand(badMsg);
    expect(response.error).toBeDefined();
    expect(response.result).toBeUndefined();
  });
});
