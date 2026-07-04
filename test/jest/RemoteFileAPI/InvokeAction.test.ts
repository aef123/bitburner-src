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
  purchaseAugmentation: jest.fn(),
  getFactionAugmentationsFiltered: jest.fn(),
  hasAugmentationPrereqs: jest.fn(),
}));

jest.mock("../../../src/Augmentation/AugmentationHelpers", () => ({
  installAugmentations: jest.fn(),
  getAugCost: jest.fn(),
}));

import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Terminal } from "../../../src/Terminal";
import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { AugmentationName, FactionName } from "../../../src/Enums";
import { killWorkerScriptByPid } from "../../../src/Netscript/killWorkerScript";
import { joinFaction, purchaseAugmentation, getFactionAugmentationsFiltered, hasAugmentationPrereqs } from "../../../src/Faction/FactionHelpers";
import { installAugmentations, getAugCost } from "../../../src/Augmentation/AugmentationHelpers";
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

describe("invokeAction — queueAugmentation", () => {
  const FACTION = FactionName.CyberSec;
  const AUG = AugmentationName.BitWire;

  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
    // Reset faction state that persists across tests.
    Factions[FACTION].playerReputation = 0;
    Factions[FACTION].isMember = false;
    // Reset all mocks and configure defaults: aug is offered, prereqs met, normal costs.
    (getFactionAugmentationsFiltered as jest.Mock).mockReset().mockReturnValue([AUG]);
    (hasAugmentationPrereqs as jest.Mock).mockReset().mockReturnValue(true);
    (getAugCost as jest.Mock).mockReset().mockReturnValue({ moneyCost: 1e7, repCost: 3750 });
    (purchaseAugmentation as jest.Mock).mockReset();
  });

  afterEach(() => {
    Factions[FACTION].playerReputation = 0;
    Factions[FACTION].isMember = false;
  });

  test("refuses with ok:false when player is not a member of the faction", async () => {
    Player.factions = [];
    const response = await invokeAction(makeMsg("queueAugmentation", { faction: FACTION, augment: AUG }));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("member");
    expect(purchaseAugmentation).not.toHaveBeenCalled();
    expect(hasVscodeEcho()).toBe(false);
  });

  test("refuses with ok:false when player has insufficient reputation", async () => {
    Player.factions = [FACTION];
    Factions[FACTION].playerReputation = 100; // below repCost of 3750
    Player.money = 1e15; // money is fine — rep check must fail
    const response = await invokeAction(makeMsg("queueAugmentation", { faction: FACTION, augment: AUG }));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("reputation");
    expect(purchaseAugmentation).not.toHaveBeenCalled();
    expect(hasVscodeEcho()).toBe(false);
  });

  test("refuses with ok:false when player has insufficient money", async () => {
    Player.factions = [FACTION];
    Factions[FACTION].playerReputation = 1e9; // rep is fine — money check must fail
    Player.money = 0; // below moneyCost of 1e7
    const response = await invokeAction(makeMsg("queueAugmentation", { faction: FACTION, augment: AUG }));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("money");
    expect(purchaseAugmentation).not.toHaveBeenCalled();
    expect(hasVscodeEcho()).toBe(false);
  });

  test("succeeds: aug appears in queuedAugmentations and [vscode] echo is written", async () => {
    Player.factions = [FACTION];
    Factions[FACTION].playerReputation = 1e9;
    Player.money = 1e15;
    // Mock purchaseAugmentation to simulate the real side effect of queuing.
    (purchaseAugmentation as jest.Mock).mockImplementationOnce((_faction, aug) => {
      Player.queueAugmentation((aug as { name: AugmentationName }).name);
      return { success: true };
    });
    const response = await invokeAction(makeMsg("queueAugmentation", { faction: FACTION, augment: AUG }));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(hasVscodeEcho()).toBe(true);
    expect(Player.queuedAugmentations.some((a) => a.name === AUG)).toBe(true);
  });
});

describe("invokeAction — installAugmentations", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
    (installAugmentations as jest.Mock).mockReset();
  });

  test("refuses with ok:false when queue is empty", async () => {
    Player.queuedAugmentations = [];
    const response = await invokeAction(makeMsg("installAugmentations", {}));
    const result = response.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No augmentations queued");
    expect(installAugmentations).not.toHaveBeenCalled();
  });

  test("installs augmentations: clears the queue and returns ok:true", async () => {
    // Seed one queued aug so validate() passes.
    Player.queueAugmentation(AugmentationName.BitWire);
    expect(Player.queuedAugmentations.length).toBe(1);
    // Mock installAugmentations to simulate the real side effect of clearing the queue.
    (installAugmentations as jest.Mock).mockImplementationOnce(() => {
      Player.queuedAugmentations = [];
      return true;
    });
    const response = await invokeAction(makeMsg("installAugmentations", {}));
    const result = response.result as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(Player.queuedAugmentations.length).toBe(0);
  });
});
