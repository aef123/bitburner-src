/**
 * Tests for the invokeAction handler (Task GB-1).
 *
 * TDD: verifies the registry dispatch, argument validation, terminal echo,
 * and per-action game-side behavior (killScript, travel, joinFaction).
 */
jest.mock("../../../src/Netscript/killWorkerScript", () => ({
  killWorkerScriptByPid: jest.fn().mockReturnValue(true),
}));

jest.mock("../../../src/Faction/FactionHelpers", () => ({
  joinFaction: jest.fn(),
}));

import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Terminal } from "../../../src/Terminal";
import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { FactionName } from "../../../src/Enums";
import { killWorkerScriptByPid } from "../../../src/Netscript/killWorkerScript";
import { joinFaction } from "../../../src/Faction/FactionHelpers";
import { Factions } from "../../../src/Faction/Factions";
import { AddToAllServers, prestigeAllServers } from "../../../src/Server/AllServers";
import { Server } from "../../../src/Server/Server";
import type { IPAddress } from "../../../src/Types/strings";

function setupWorld(): void {
  prestigeAllServers();
  setPlayer(new PlayerObject());
  const home = new Server({ hostname: "home", ip: "10.0.0.1" as IPAddress, maxRam: 64, adminRights: true });
  home.purchasedByPlayer = true;
  AddToAllServers(home);
  Player.currentServer = "home";
}

function makeMsg(action: string, args: Record<string, unknown> = {}, id = 1): RFAMessage {
  return new RFAMessage({ method: "invokeAction", params: { action, args } as never, id });
}

/** Check that the terminal output history contains a [vscode] echo entry. */
function hasVscodeEcho(): boolean {
  return Terminal.outputHistory.some((entry) => "text" in entry && (entry as { text: string }).text.includes("[vscode]"));
}

describe("invokeAction — dispatch and error paths", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
  });

  afterEach(() => {
    Player.currentWork = null;
  });

  test("missing action param returns an error response (not ok:false)", async () => {
    const msg = new RFAMessage({ method: "invokeAction", id: 1 });
    const response = await invokeAction(msg);
    expect(response.error).toBeDefined();
    expect(response.result).toBeUndefined();
  });

  test("unknown action returns ok:false with a descriptive message", async () => {
    const response = await invokeAction(makeMsg("definitivelyNotARealAction"));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown action");
    expect(result.message).toContain("definitivelyNotARealAction");
  });

  test("unknown action does NOT append to terminal (echo only on success path)", async () => {
    await invokeAction(makeMsg("definitivelyNotARealAction"));
    expect(hasVscodeEcho()).toBe(false);
  });
});

describe("invokeAction — killScript", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
  });

  test("valid pid: calls killWorkerScriptByPid and returns ok:true", async () => {
    (killWorkerScriptByPid as jest.Mock).mockReturnValueOnce(true);
    const response = await invokeAction(makeMsg("killScript", { pid: 42 }));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(killWorkerScriptByPid).toHaveBeenCalledWith(42);
  });

  test("returns ok:false with message when PID is not found", async () => {
    (killWorkerScriptByPid as jest.Mock).mockReturnValueOnce(false);
    const response = await invokeAction(makeMsg("killScript", { pid: 999 }));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("999");
  });

  test("validation: non-numeric pid returns ok:false without calling kill", async () => {
    const spy = killWorkerScriptByPid as jest.Mock;
    spy.mockClear();
    const response = await invokeAction(makeMsg("killScript", { pid: "not-a-number" }));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  test("validation: missing pid returns ok:false", async () => {
    const response = await invokeAction(makeMsg("killScript", {}));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  test("echoes [vscode] to the terminal before executing", async () => {
    (killWorkerScriptByPid as jest.Mock).mockReturnValueOnce(true);
    await invokeAction(makeMsg("killScript", { pid: 1 }));
    expect(hasVscodeEcho()).toBe(true);
  });
});

describe("invokeAction — travel", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
  });

  test("moves player to city when they can afford it", async () => {
    Player.money = 1_000_000;
    const response = await invokeAction(makeMsg("travel", { city: "Aevum" }));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(Player.city).toBe("Aevum");
  });

  test("returns ok:false and player stays put when they cannot afford travel", async () => {
    const originalCity = Player.city;
    Player.money = 0;
    const response = await invokeAction(makeMsg("travel", { city: "Aevum" }));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("afford");
    expect(Player.city).toBe(originalCity);
  });

  test("echoes [vscode] to the terminal before travelling", async () => {
    Player.money = 1_000_000;
    await invokeAction(makeMsg("travel", { city: "Aevum" }));
    expect(hasVscodeEcho()).toBe(true);
  });

  test("validation: unknown city returns ok:false without moving player", async () => {
    Player.money = 1_000_000;
    const originalCity = Player.city;
    const response = await invokeAction(makeMsg("travel", { city: "NotARealCity" }));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(Player.city).toBe(originalCity);
  });

  test("validation: missing city returns ok:false", async () => {
    const response = await invokeAction(makeMsg("travel", {}));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(false);
  });
});

describe("invokeAction — joinFaction", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
    (joinFaction as jest.Mock).mockClear();
  });

  test("refuses with ok:false when player has no invitation", async () => {
    Player.factionInvitations = [];
    const response = await invokeAction(makeMsg("joinFaction", { faction: FactionName.CyberSec }));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("invitation");
    expect(joinFaction).not.toHaveBeenCalled();
  });

  test("calls joinFaction and returns ok:true when player has invitation", async () => {
    Player.factionInvitations = [FactionName.CyberSec];
    const response = await invokeAction(makeMsg("joinFaction", { faction: FactionName.CyberSec }));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(joinFaction).toHaveBeenCalledTimes(1);
  });

  test("echoes [vscode] to the terminal before joining", async () => {
    Player.factionInvitations = [FactionName.CyberSec];
    await invokeAction(makeMsg("joinFaction", { faction: FactionName.CyberSec }));
    expect(hasVscodeEcho()).toBe(true);
  });

  test("validation: missing faction param returns ok:false", async () => {
    const response = await invokeAction(makeMsg("joinFaction", {}));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  test("refuses ok:false for faction name not in player invitations", async () => {
    // Player has invitation to Sector-12 but not to Daedalus.
    Player.factionInvitations = [FactionName.Sector12];
    const response = await invokeAction(makeMsg("joinFaction", { faction: FactionName.Daedalus }));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(false);
    expect(joinFaction).not.toHaveBeenCalled();
  });

  test("refuses ok:false when faction is banned", async () => {
    Player.factionInvitations = [FactionName.CyberSec];
    Factions[FactionName.CyberSec].isBanned = true;
    try {
      const response = await invokeAction(makeMsg("joinFaction", { faction: FactionName.CyberSec }));
      const result = response.result as { ok: boolean; message: string };
      expect(result.ok).toBe(false);
      expect(result.message).toContain("banned");
      expect(joinFaction).not.toHaveBeenCalled();
    } finally {
      Factions[FactionName.CyberSec].isBanned = false;
    }
  });
});
