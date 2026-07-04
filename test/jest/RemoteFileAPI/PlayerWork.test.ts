/**
 * Tests for GG-1: player work/crime/study/purchase actions + work-options serializer.
 *
 * Covers:
 *   - invokeAction validation (refusals for wrong city/poor/no-invite/no-job)
 *   - Happy-path execution for commitCrime, startClass, startFactionWork, stopWork,
 *     purchaseServer, upgradeHomeRam, purchaseTor
 *   - serializeWorkOptions shape + JSON purity
 *
 * Uses jest.mock for dialog-creating helpers (purchaseTorRouter, purchaseRamForHomeComputer,
 * dialogBoxCreate) so no UI calls leak into the test environment.
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Prevent dialogBoxCreate from throwing / doing DOM work
jest.mock("../../../src/ui/React/DialogBox", () => ({
  dialogBoxCreate: jest.fn(),
}));

// getTorRouter connects the TOR server — stub it out to avoid AllServers/network side effects
jest.mock("../../../src/Server/ServerHelpers", () => {
  const actual = jest.requireActual<typeof import("../../../src/Server/ServerHelpers")>(
    "../../../src/Server/ServerHelpers",
  );
  return {
    ...actual,
    getTorRouter: jest.fn(),
    // safelyCreateUniqueServer must still be the real function so purchaseServer works
  };
});

// ─── Imports ─────────────────────────────────────────────────────────────────

import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { serializeWorkOptions } from "../../../src/RemoteFileAPI/StateSerializers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Terminal } from "../../../src/Terminal";
import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { FactionName, CrimeType, FactionWorkType, LocationName, CompanyName } from "../../../src/Enums";
import { Factions } from "../../../src/Faction/Factions";
import { AddToAllServers, GetServer, prestigeAllServers } from "../../../src/Server/AllServers";
import { Server } from "../../../src/Server/Server";
import { getTorRouter } from "../../../src/Server/ServerHelpers";
import type { IPAddress } from "../../../src/Types/strings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Set up a minimal world: prestige servers, fresh Player, home server. */
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

function hasVscodeEcho(): boolean {
  return Terminal.outputHistory.some((e) => "text" in e && (e as { text: string }).text.includes("[vscode]"));
}

async function invoke(action: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; message?: string }> {
  const resp = await invokeAction(makeMsg(action, args));
  return resp.result as { ok: boolean; message?: string };
}

// ─── commitCrime ─────────────────────────────────────────────────────────────

describe("invokeAction — commitCrime", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
  });

  afterEach(() => {
    Player.currentWork = null;
  });

  test("validation: unknown crime returns ok:false", async () => {
    const r = await invoke("commitCrime", { crime: "notACrime" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("notACrime");
  });

  test("validation: missing crime returns ok:false", async () => {
    const r = await invoke("commitCrime", {});
    expect(r.ok).toBe(false);
  });

  test("happy path: starts crime work on the player", async () => {
    Player.money = 0; // crimes don't cost money to start
    const r = await invoke("commitCrime", { crime: CrimeType.shoplift });
    expect(r.ok).toBe(true);
    expect(Player.currentWork).not.toBeNull();
    expect(Player.currentWork?.type).toBe("CRIME");
    expect(hasVscodeEcho()).toBe(true);
  });

  test("commits the specified crime type", async () => {
    const r = await invoke("commitCrime", { crime: CrimeType.mug });
    expect(r.ok).toBe(true);
    // CrimeWork exposes crimeType
    const w = Player.currentWork as { type: string; crimeType?: string } | null;
    expect(w?.crimeType).toBe(CrimeType.mug);
  });
});

// ─── stopWork ────────────────────────────────────────────────────────────────

describe("invokeAction — stopWork", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
  });

  test("stops active work and returns ok:true", async () => {
    // Start crime work first
    await invoke("commitCrime", { crime: CrimeType.shoplift });
    expect(Player.currentWork).not.toBeNull();

    Terminal.outputHistory = [];
    const r = await invoke("stopWork");
    expect(r.ok).toBe(true);
    expect(Player.currentWork).toBeNull();
    expect(hasVscodeEcho()).toBe(true);
  });

  test("returns ok:true even when not working (no-op)", async () => {
    Player.currentWork = null;
    const r = await invoke("stopWork");
    expect(r.ok).toBe(true);
    expect(Player.currentWork).toBeNull();
  });
});

// ─── startClass ──────────────────────────────────────────────────────────────

describe("invokeAction — startClass", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
    Player.money = 1e12;
  });

  afterEach(() => {
    Player.currentWork = null;
  });

  test("validation: unknown location returns ok:false", async () => {
    Player.city = "Sector-12" as never;
    const r = await invoke("startClass", { location: "NotAUniversity", classType: "Computer Science" });
    expect(r.ok).toBe(false);
  });

  test("validation: wrong city returns ok:false", async () => {
    // Rothman University is in Sector-12; if player is in Aevum it should refuse
    Player.city = "Aevum" as never;
    const r = await invoke("startClass", {
      location: LocationName.Sector12RothmanUniversity,
      classType: "Computer Science",
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Aevum");
  });

  test("validation: gym stat rejected at university location", async () => {
    Player.city = "Sector-12" as never;
    const r = await invoke("startClass", { location: LocationName.Sector12RothmanUniversity, classType: "str" });
    expect(r.ok).toBe(false);
  });

  test("validation: university course rejected at gym location", async () => {
    Player.city = "Sector-12" as never;
    const r = await invoke("startClass", {
      location: LocationName.Sector12IronGym,
      classType: "Computer Science",
    });
    expect(r.ok).toBe(false);
  });

  test("happy path: starts university course in correct city", async () => {
    Player.city = "Sector-12" as never;
    const r = await invoke("startClass", {
      location: LocationName.Sector12RothmanUniversity,
      classType: "Computer Science",
    });
    expect(r.ok).toBe(true);
    expect(Player.currentWork).not.toBeNull();
    expect(Player.currentWork?.type).toBe("CLASS");
    expect(hasVscodeEcho()).toBe(true);
  });

  test("happy path: starts gym workout in correct city", async () => {
    Player.city = "Sector-12" as never;
    const r = await invoke("startClass", { location: LocationName.Sector12IronGym, classType: "str" });
    expect(r.ok).toBe(true);
    expect(Player.currentWork?.type).toBe("CLASS");
  });
});

// ─── startFactionWork ────────────────────────────────────────────────────────

describe("invokeAction — startFactionWork", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
    // CyberSec offers hacking work; add player as member
    Player.factions = [FactionName.CyberSec];
    Factions[FactionName.CyberSec].isMember = true;
  });

  afterEach(() => {
    Player.currentWork = null;
    Player.factions = [];
    Factions[FactionName.CyberSec].isMember = false;
  });

  test("validation: missing faction returns ok:false", async () => {
    const r = await invoke("startFactionWork", { workType: FactionWorkType.hacking });
    expect(r.ok).toBe(false);
  });

  test("validation: invalid workType returns ok:false", async () => {
    const r = await invoke("startFactionWork", { faction: FactionName.CyberSec, workType: "extortion" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("workType");
  });

  test("validation: not a member returns ok:false", async () => {
    Player.factions = []; // remove from faction
    const r = await invoke("startFactionWork", { faction: FactionName.CyberSec, workType: FactionWorkType.hacking });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("member");
  });

  test("validation: faction doesn't offer requested work type returns ok:false", async () => {
    // CyberSec doesn't offer field work
    const r = await invoke("startFactionWork", { faction: FactionName.CyberSec, workType: FactionWorkType.field });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("field work");
  });

  test("happy path: starts hacking work for CyberSec", async () => {
    const r = await invoke("startFactionWork", { faction: FactionName.CyberSec, workType: FactionWorkType.hacking });
    expect(r.ok).toBe(true);
    expect(Player.currentWork?.type).toBe("FACTION");
    expect(hasVscodeEcho()).toBe(true);
  });
});

// ─── startCompanyWork ────────────────────────────────────────────────────────

describe("invokeAction — startCompanyWork", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
  });

  afterEach(() => {
    Player.currentWork = null;
    Player.jobs = {};
  });

  test("validation: unknown company returns ok:false", async () => {
    const r = await invoke("startCompanyWork", { company: "NotARealCompany" });
    expect(r.ok).toBe(false);
  });

  test("validation: no job at company returns ok:false", async () => {
    Player.jobs = {};
    const r = await invoke("startCompanyWork", { company: CompanyName.NoodleBar });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("job");
  });

  test("happy path: starts work when player has a job", async () => {
    Player.jobs = { [CompanyName.NoodleBar]: "Employee" as never };
    const r = await invoke("startCompanyWork", { company: CompanyName.NoodleBar });
    expect(r.ok).toBe(true);
    expect(Player.currentWork?.type).toBe("COMPANY");
    expect(hasVscodeEcho()).toBe(true);
  });
});

// ─── purchaseServer ──────────────────────────────────────────────────────────

describe("invokeAction — purchaseServer", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
    Player.money = 1e15;
  });

  test("validation: empty hostname returns ok:false", async () => {
    const r = await invoke("purchaseServer", { hostname: "", ram: 8 });
    expect(r.ok).toBe(false);
  });

  test("validation: reserved hacknet hostname returns ok:false", async () => {
    const r = await invoke("purchaseServer", { hostname: "hacknet-node-0", ram: 8 });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("reserved");
  });

  test("validation: non-power-of-2 ram returns ok:false", async () => {
    const r = await invoke("purchaseServer", { hostname: "myserver", ram: 3 });
    expect(r.ok).toBe(false);
  });

  test("validation: insufficient funds returns ok:false", async () => {
    Player.money = 0;
    const r = await invoke("purchaseServer", { hostname: "myserver", ram: 8 });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("afford");
  });

  test("validation: duplicate hostname returns ok:false", async () => {
    // "home" is already in AllServers
    const r = await invoke("purchaseServer", { hostname: "home", ram: 8 });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("already in use");
  });

  test("happy path: creates server and deducts money", async () => {
    const before = Player.money;
    const r = await invoke("purchaseServer", { hostname: "testserver", ram: 8 });
    expect(r.ok).toBe(true);
    expect(GetServer("testserver")).not.toBeNull();
    expect(Player.purchasedServers).toContain("testserver");
    expect(Player.money).toBeLessThan(before);
    expect(hasVscodeEcho()).toBe(true);
  });
});

// ─── upgradeHomeRam ──────────────────────────────────────────────────────────

describe("invokeAction — upgradeHomeRam", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
  });

  test("validation: insufficient funds returns ok:false", async () => {
    Player.money = 0;
    const r = await invoke("upgradeHomeRam");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("afford");
  });

  test("happy path: doubles home RAM and deducts money", async () => {
    Player.money = 1e15;
    const home = Player.getHomeComputer();
    const ramBefore = home.maxRam;
    const moneyBefore = Player.money;
    const r = await invoke("upgradeHomeRam");
    expect(r.ok).toBe(true);
    expect(home.maxRam).toBe(ramBefore * 2);
    expect(Player.money).toBeLessThan(moneyBefore);
    expect(hasVscodeEcho()).toBe(true);
  });
});

// ─── purchaseTor ─────────────────────────────────────────────────────────────

describe("invokeAction — purchaseTor", () => {
  beforeEach(() => {
    setupWorld();
    Terminal.outputHistory = [];
    (getTorRouter as jest.Mock).mockClear();
  });

  test("validation: already has TOR router returns ok:false", async () => {
    // Simulate hasTorRouter returning true by adding DarkWeb to home's network
    const home = Player.getHomeComputer();
    home.serversOnNetwork.push("darkweb");
    const r = await invoke("purchaseTor");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("already");
    expect(getTorRouter).not.toHaveBeenCalled();
    // cleanup
    home.serversOnNetwork = home.serversOnNetwork.filter((h) => h !== "darkweb");
  });

  test("validation: insufficient funds returns ok:false", async () => {
    Player.money = 0;
    const r = await invoke("purchaseTor");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("afford");
    expect(getTorRouter).not.toHaveBeenCalled();
  });

  test("happy path: deducts money and calls getTorRouter", async () => {
    Player.money = 1e9;
    const moneyBefore = Player.money;
    const r = await invoke("purchaseTor");
    expect(r.ok).toBe(true);
    expect(getTorRouter).toHaveBeenCalledTimes(1);
    expect(Player.money).toBeLessThan(moneyBefore);
    expect(hasVscodeEcho()).toBe(true);
  });
});

// ─── serializeWorkOptions ────────────────────────────────────────────────────

describe("serializeWorkOptions", () => {
  beforeEach(() => {
    setupWorld();
    Player.city = "Sector-12" as never;
    Player.currentWork = null;
    Player.jobs = {};
  });

  afterEach(() => {
    Player.currentWork = null;
    Player.jobs = {};
  });

  test("returns the required top-level keys", () => {
    const opts = serializeWorkOptions();
    expect(opts).toHaveProperty("universities");
    expect(opts).toHaveProperty("gyms");
    expect(opts).toHaveProperty("crimes");
    expect(opts).toHaveProperty("companies");
    expect(opts).toHaveProperty("currentWork");
    expect(opts).toHaveProperty("homeRamUpgradeCost");
    expect(opts).toHaveProperty("purchaseServerCosts");
    expect(opts).toHaveProperty("torCost");
    expect(opts).toHaveProperty("hasTor");
  });

  test("universities contains entries when in Sector-12", () => {
    Player.city = "Sector-12" as never;
    const opts = serializeWorkOptions();
    expect(opts.universities.length).toBeGreaterThan(0);
    const uni = opts.universities[0];
    expect(typeof uni.name).toBe("string");
    expect(typeof uni.city).toBe("string");
    expect(Array.isArray(uni.courses)).toBe(true);
    expect(uni.courses.length).toBeGreaterThan(0);
    const course = uni.courses[0];
    expect(typeof course.classType).toBe("string");
    expect(typeof course.costPerSec).toBe("number");
  });

  test("gyms contains entries when in Sector-12", () => {
    Player.city = "Sector-12" as never;
    const opts = serializeWorkOptions();
    expect(opts.gyms.length).toBeGreaterThan(0);
    const gym = opts.gyms[0];
    expect(typeof gym.name).toBe("string");
    expect(typeof gym.costPerSec).toBe("number");
    expect(gym.costPerSec).toBeGreaterThan(0);
    expect(Array.isArray(gym.stats)).toBe(true);
    expect(gym.stats.length).toBeGreaterThan(0);
  });

  test("crimes is non-empty and has required fields", () => {
    const opts = serializeWorkOptions();
    expect(opts.crimes.length).toBeGreaterThan(0);
    const crime = opts.crimes[0];
    expect(typeof crime.crimeType).toBe("string");
    expect(typeof crime.name).toBe("string");
    expect(typeof crime.karma).toBe("number");
    expect(typeof crime.money).toBe("number");
    expect(typeof crime.timeMs).toBe("number");
    expect(typeof crime.successChance).toBe("number");
    expect(crime.successChance).toBeGreaterThanOrEqual(0);
    expect(crime.successChance).toBeLessThanOrEqual(1);
  });

  test("crimes includes shoplift with correct crimeType key", () => {
    const opts = serializeWorkOptions();
    const shoplift = opts.crimes.find((c) => c.crimeType === CrimeType.shoplift);
    expect(shoplift).toBeDefined();
    expect(shoplift?.timeMs).toBe(2000);
  });

  test("companies is empty when player has no jobs", () => {
    Player.jobs = {};
    const opts = serializeWorkOptions();
    expect(opts.companies).toEqual([]);
  });

  test("companies lists company names where player has jobs", () => {
    Player.jobs = { [CompanyName.NoodleBar]: "Employee" as never };
    const opts = serializeWorkOptions();
    expect(opts.companies).toContain(CompanyName.NoodleBar);
  });

  test("currentWork is null when not working", () => {
    Player.currentWork = null;
    const opts = serializeWorkOptions();
    expect(opts.currentWork).toBeNull();
  });

  test("purchaseServerCosts is non-empty and contains valid entries", () => {
    const opts = serializeWorkOptions();
    expect(opts.purchaseServerCosts.length).toBeGreaterThan(0);
    const entry = opts.purchaseServerCosts[0];
    expect(typeof entry.ram).toBe("number");
    expect(typeof entry.cost).toBe("number");
    expect(entry.ram).toBeGreaterThan(0);
    expect(entry.cost).toBeGreaterThan(0);
    // RAM tiers must be powers of 2
    for (const { ram } of opts.purchaseServerCosts) {
      expect(ram & (ram - 1)).toBe(0); // power of 2 check
    }
  });

  test("torCost is a positive number", () => {
    const opts = serializeWorkOptions();
    expect(opts.torCost).toBeGreaterThan(0);
  });

  test("hasTor is a boolean", () => {
    const opts = serializeWorkOptions();
    expect(typeof opts.hasTor).toBe("boolean");
  });

  test("output is JSON-pure (no non-serializable values)", () => {
    const opts = serializeWorkOptions();
    expect(() => JSON.stringify(opts)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(opts));
    expect(parsed.universities).toBeDefined();
    expect(parsed.crimes).toBeDefined();
  });

  test("universities are from player's current city only", () => {
    Player.city = "Sector-12" as never;
    const opts = serializeWorkOptions();
    for (const uni of opts.universities) {
      expect(uni.city).toBe("Sector-12");
    }
  });

  test("gyms are from player's current city only", () => {
    Player.city = "Sector-12" as never;
    const opts = serializeWorkOptions();
    for (const gym of opts.gyms) {
      expect(gym.city).toBe("Sector-12");
    }
  });

  test("homeRamUpgradeCost is a non-negative number", () => {
    Player.money = 1e15;
    const opts = serializeWorkOptions();
    expect(typeof opts.homeRamUpgradeCost).toBe("number");
    expect(opts.homeRamUpgradeCost).toBeGreaterThanOrEqual(0);
  });
});
