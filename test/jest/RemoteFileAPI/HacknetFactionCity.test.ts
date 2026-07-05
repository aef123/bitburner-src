/**
 * Tests for GI-1: hacknet upgrade quotes, faction work rates, city detail,
 * and home-core / apply-for-job / open-location actions.
 *
 * Coverage goals:
 *  - serializeHacknet(): upgrades field shape, qty scaling, cap → null, JSON purity.
 *  - serializeFactions(): workRates has 3 entries, non-negative rates, correct shape.
 *  - serializeCityDetail(): Sector-12 companies / infiltration / purchases / trainers.
 *  - serializeWorkOptions(): homeCoreUpgradeCost number or null.
 *  - invokeAction upgradeHomeCores: at-max validation, can-afford execute.
 *  - invokeAction applyForJob: validation (bad company / bad position).
 *  - invokeAction openLocationInGame: validation (bad location) and happy path.
 */

import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { HacknetNode } from "../../../src/Hacknet/HacknetNode";
import { CityName, FactionName, LocationName } from "../../../src/Enums";
import { Factions } from "../../../src/Faction/Factions";
import { Terminal } from "../../../src/Terminal";
import {
  serializeHacknet,
  serializeFactions,
  serializeCityDetail,
  serializeWorkOptions,
  type HacknetUpgradeQuote,
} from "../../../src/RemoteFileAPI/StateSerializers";
import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";
import { HacknetNodeConstants } from "../../../src/Hacknet/data/Constants";

initGameEnvironment();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMsg(action: string, args: Record<string, unknown> = {}, id = 1): RFAMessage {
  return new RFAMessage({ method: "invokeAction", params: { action, args } as never, id });
}

/** Assert a value round-trips through JSON without loss (no Infinity, NaN, undefined, class instances). */
function expectJsonPure(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

/** Add a fresh HacknetNode to the player and return it. */
function addNode(name?: string): HacknetNode {
  const node = new HacknetNode(
    name ?? `hacknet-node-${Player.hacknetNodes.length}`,
    Player.mults.hacknet_node_money,
  );
  Player.hacknetNodes.push(node);
  return node;
}

/** Join a faction and add it to the Player in one step. */
function joinFactionAs(name: FactionName): void {
  const f = Factions[name];
  f.isMember = true;
  f.playerReputation = 0;
  f.setFavor(0);
  Player.factions = [name];
}

// ─── serializeHacknet — upgrade quotes ───────────────────────────────────────

describe("serializeHacknet() — upgrade quotes field (GI-1)", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Player.hacknetNodes = [];
    Terminal.outputHistory = [];
  });

  test("each node dto carries an upgrades field with the four axes", () => {
    addNode();
    const state = serializeHacknet();
    const dto = state.nodes[0];
    expect(dto).toHaveProperty("upgrades");
    const u = dto.upgrades;
    expect(u).toHaveProperty("level");
    expect(u).toHaveProperty("ram");
    expect(u).toHaveProperty("core");
    expect(u).toHaveProperty("cache");
  });

  test("level upgrades are non-null for a fresh level-1 node", () => {
    addNode();
    const state = serializeHacknet();
    const quotes = state.nodes[0].upgrades.level;
    expect(quotes).not.toBeNull();
    expect((quotes as HacknetUpgradeQuote[]).length).toBeGreaterThan(0);
  });

  test("level quotes include qty 1, 5, and 10 for a fresh node (max 200 levels away)", () => {
    addNode(); // starts at level 1
    const quotes = serializeHacknet().nodes[0].upgrades.level as HacknetUpgradeQuote[];
    const qtys = quotes.map((q) => q.qty);
    expect(qtys).toContain(1);
    expect(qtys).toContain(5);
    expect(qtys).toContain(10);
  });

  test("max-qty entry for a level-1 node is MaxLevel - 1 = 199", () => {
    addNode(); // level = 1
    const quotes = serializeHacknet().nodes[0].upgrades.level as HacknetUpgradeQuote[];
    const maxQ = Math.max(...quotes.map((q) => q.qty));
    expect(maxQ).toBe(HacknetNodeConstants.MaxLevel - 1);
  });

  test("quotes are sorted ascending by qty", () => {
    addNode();
    const quotes = serializeHacknet().nodes[0].upgrades.level as HacknetUpgradeQuote[];
    for (let i = 1; i < quotes.length; i++) {
      expect(quotes[i].qty).toBeGreaterThan(quotes[i - 1].qty);
    }
  });

  test("each quote has a positive cost and a non-negative deltaPerSec", () => {
    addNode();
    const state = serializeHacknet();
    for (const axis of ["level", "ram", "core"] as const) {
      const quotes = state.nodes[0].upgrades[axis];
      if (quotes === null) continue;
      for (const q of quotes as HacknetUpgradeQuote[]) {
        expect(q.cost).toBeGreaterThan(0);
        expect(q.deltaPerSec).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("higher qty → higher cost and equal-or-higher deltaPerSec on the level axis", () => {
    addNode();
    const quotes = serializeHacknet().nodes[0].upgrades.level as HacknetUpgradeQuote[];
    for (let i = 1; i < quotes.length; i++) {
      expect(quotes[i].cost).toBeGreaterThan(quotes[i - 1].cost);
      expect(quotes[i].deltaPerSec).toBeGreaterThanOrEqual(quotes[i - 1].deltaPerSec);
    }
  });

  test("level upgrades are null when the node is already at MaxLevel", () => {
    const node = addNode();
    node.level = HacknetNodeConstants.MaxLevel; // at cap
    const quotes = serializeHacknet().nodes[0].upgrades.level;
    expect(quotes).toBeNull();
  });

  test("ram upgrades are null when the node is already at MaxRam", () => {
    const node = addNode();
    node.ram = HacknetNodeConstants.MaxRam; // at cap
    const quotes = serializeHacknet().nodes[0].upgrades.ram;
    expect(quotes).toBeNull();
  });

  test("cache is null in node mode (HacknetNode has no cache)", () => {
    addNode();
    const quotes = serializeHacknet().nodes[0].upgrades.cache;
    expect(quotes).toBeNull();
  });

  test("result is JSON-pure (no Infinity, NaN, or undefined)", () => {
    addNode();
    const state = serializeHacknet();
    expectJsonPure(state);
  });

  test("upgrades for a node with only 2 levels remaining has at most 1 entry (qty=2=max)", () => {
    const node = addNode();
    node.level = HacknetNodeConstants.MaxLevel - 2; // 2 levels remaining
    const quotes = serializeHacknet().nodes[0].upgrades.level as HacknetUpgradeQuote[];
    // qty 1 is ≤ 2, qty 5/10 are > 2, max = 2; so should have [1, 2]
    const qtys = quotes.map((q) => q.qty);
    expect(qtys).toContain(1);
    expect(qtys).toContain(2);
    expect(qtys).not.toContain(5);
    expect(qtys).not.toContain(10);
  });
});

// ─── serializeFactions — workRates ───────────────────────────────────────────

describe("serializeFactions() — workRates (GI-1)", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
  });

  afterEach(() => {
    // Reset faction membership so state doesn't bleed between tests.
    Player.factions = [];
    Factions[FactionName.CyberSec].isMember = false;
  });

  test("empty player.factions → joined is empty (no crash)", () => {
    Player.factions = [];
    const state = serializeFactions();
    expect(state.joined).toHaveLength(0);
  });

  test("joined faction dto has a workRates array of exactly 3 entries", () => {
    joinFactionAs(FactionName.CyberSec);
    const state = serializeFactions();
    const dto = state.joined[0];
    expect(dto.workRates).toBeDefined();
    expect(dto.workRates).toHaveLength(3);
  });

  test("workRates entries cover hacking, field, and security types", () => {
    joinFactionAs(FactionName.CyberSec);
    const types = serializeFactions().joined[0].workRates.map((r) => r.type);
    expect(types).toContain("hacking");
    expect(types).toContain("field");
    expect(types).toContain("security");
  });

  test("each workRate entry has the required fields", () => {
    joinFactionAs(FactionName.CyberSec);
    for (const rate of serializeFactions().joined[0].workRates) {
      expect(typeof rate.available).toBe("boolean");
      expect(typeof rate.repPerSec).toBe("number");
      expect(typeof rate.expPerSec).toBe("object");
      // expPerSec has all 6 stat keys
      for (const key of ["hacking", "strength", "defense", "dexterity", "agility", "charisma"]) {
        expect(typeof rate.expPerSec[key as keyof typeof rate.expPerSec]).toBe("number");
      }
    }
  });

  test("repPerSec and all expPerSec values are finite and non-negative", () => {
    joinFactionAs(FactionName.CyberSec);
    for (const rate of serializeFactions().joined[0].workRates) {
      expect(rate.repPerSec).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(rate.repPerSec)).toBe(true);
      for (const val of Object.values(rate.expPerSec)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  test("CyberSec offers hacking work (available = true) but not security work", () => {
    joinFactionAs(FactionName.CyberSec);
    const rates = serializeFactions().joined[0].workRates;
    const hackingRate = rates.find((r) => r.type === "hacking");
    const securityRate = rates.find((r) => r.type === "security");
    expect(hackingRate?.available).toBe(true);
    expect(securityRate?.available).toBe(false);
  });

  test("factions state is JSON-pure", () => {
    joinFactionAs(FactionName.CyberSec);
    expectJsonPure(serializeFactions());
  });
});

// ─── serializeCityDetail ─────────────────────────────────────────────────────

describe("serializeCityDetail() — Sector-12 (GI-1)", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Player.city = CityName.Sector12;
  });

  test("defaults to player city when no argument is given", () => {
    Player.city = CityName.Aevum;
    const state = serializeCityDetail();
    expect(state.city).toBe(CityName.Aevum);
    expect(state.current).toBe(true);
  });

  test("accepts a city name override", () => {
    Player.city = CityName.Aevum;
    const state = serializeCityDetail(CityName.Sector12);
    expect(state.city).toBe(CityName.Sector12);
    expect(state.current).toBe(false);
  });

  test("falls back to player city on unrecognised city string", () => {
    Player.city = CityName.Sector12;
    const state = serializeCityDetail("NotACity");
    expect(state.city).toBe(CityName.Sector12);
  });

  test("Sector-12 has at least one location with company !== null", () => {
    const state = serializeCityDetail(CityName.Sector12);
    const companyLocs = state.locations.filter((l) => l.company !== null);
    expect(companyLocs.length).toBeGreaterThan(0);
  });

  test("company dto has hasJob, jobTitle, canApply, repRequirementNote", () => {
    const state = serializeCityDetail(CityName.Sector12);
    const loc = state.locations.find((l) => l.company !== null);
    const company = loc!.company!;
    expect(typeof company.hasJob).toBe("boolean");
    expect(company.jobTitle === null || typeof company.jobTitle === "string").toBe(true);
    expect(Array.isArray(company.canApply)).toBe(true);
    expect(company.repRequirementNote === null || typeof company.repRequirementNote === "string").toBe(true);
  });

  test("each canApply entry has position (string) and ok (boolean)", () => {
    const state = serializeCityDetail(CityName.Sector12);
    for (const loc of state.locations) {
      if (!loc.company) continue;
      for (const entry of loc.company.canApply) {
        expect(typeof entry.position).toBe("string");
        expect(typeof entry.ok).toBe("boolean");
      }
    }
  });

  test("Sector-12 has at least one location with infiltration data", () => {
    const state = serializeCityDetail(CityName.Sector12);
    const infLocs = state.locations.filter((l) => l.infiltration !== null);
    expect(infLocs.length).toBeGreaterThan(0);
  });

  test("infiltration dto has difficulty, maxClearanceLevel, startingSecurityLevel, and reward null", () => {
    const state = serializeCityDetail(CityName.Sector12);
    const loc = state.locations.find((l) => l.infiltration !== null);
    const inf = loc!.infiltration!;
    expect(typeof inf.difficulty).toBe("number");
    expect(typeof inf.maxClearanceLevel).toBe("number");
    expect(typeof inf.startingSecurityLevel).toBe("number");
    expect(inf.reward).toBeNull();
  });

  test("Alpha Enterprises (TechVendor) has all four purchases flags", () => {
    const state = serializeCityDetail(CityName.Sector12);
    const alpha = state.locations.find((l) => l.name === LocationName.Sector12AlphaEnterprises);
    expect(alpha).toBeDefined();
    expect(alpha!.purchases).toContain("tor");
    expect(alpha!.purchases).toContain("homeRam");
    expect(alpha!.purchases).toContain("homeCores");
    expect(alpha!.purchases).toContain("servers");
  });

  test("non-TechVendor company location has empty purchases array", () => {
    const state = serializeCityDetail(CityName.Sector12);
    // FoodNStuff is a company without TechVendor flag
    const foodNStuff = state.locations.find((l) => l.name === LocationName.Sector12FoodNStuff);
    if (foodNStuff) {
      expect(foodNStuff.purchases).toHaveLength(0);
    }
  });

  test("Rothman University has trainer.kind === 'university'", () => {
    const state = serializeCityDetail(CityName.Sector12);
    const uni = state.locations.find((l) => l.name === LocationName.Sector12RothmanUniversity);
    expect(uni).toBeDefined();
    expect(uni!.trainer).not.toBeNull();
    expect(uni!.trainer!.kind).toBe("university");
    expect(typeof uni!.trainer!.costMult).toBe("number");
  });

  test("Iron Gym has trainer.kind === 'gym'", () => {
    const state = serializeCityDetail(CityName.Sector12);
    const gym = state.locations.find((l) => l.name === LocationName.Sector12IronGym);
    expect(gym).toBeDefined();
    expect(gym!.trainer).not.toBeNull();
    expect(gym!.trainer!.kind).toBe("gym");
  });

  test("each location has a non-empty types array", () => {
    const state = serializeCityDetail(CityName.Sector12);
    for (const loc of state.locations) {
      expect(Array.isArray(loc.types)).toBe(true);
      expect(loc.types.length).toBeGreaterThan(0);
    }
  });

  test("result is JSON-pure", () => {
    expectJsonPure(serializeCityDetail(CityName.Sector12));
  });
});

// ─── serializeWorkOptions — homeCoreUpgradeCost ──────────────────────────────

describe("serializeWorkOptions() — homeCoreUpgradeCost (GI-1)", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
  });

  test("homeCoreUpgradeCost is a finite positive number when home has 1 core", () => {
    const home = Player.getHomeComputer();
    home.cpuCores = 1;
    Player.bitNodeOptions.restrictHomePCUpgrade = false;
    const state = serializeWorkOptions();
    expect(state.homeCoreUpgradeCost).not.toBeNull();
    expect(state.homeCoreUpgradeCost).toBeGreaterThan(0);
    expect(Number.isFinite(state.homeCoreUpgradeCost!)).toBe(true);
  });

  test("homeCoreUpgradeCost is null when cpuCores >= 8", () => {
    const home = Player.getHomeComputer();
    home.cpuCores = 8;
    Player.bitNodeOptions.restrictHomePCUpgrade = false;
    const state = serializeWorkOptions();
    expect(state.homeCoreUpgradeCost).toBeNull();
  });

  test("homeCoreUpgradeCost is null when restrictHomePCUpgrade is set", () => {
    const home = Player.getHomeComputer();
    home.cpuCores = 1;
    Player.bitNodeOptions.restrictHomePCUpgrade = true;
    try {
      const state = serializeWorkOptions();
      expect(state.homeCoreUpgradeCost).toBeNull();
    } finally {
      Player.bitNodeOptions.restrictHomePCUpgrade = false;
    }
  });

  test("result is JSON-pure", () => {
    expectJsonPure(serializeWorkOptions());
  });
});

// ─── invokeAction: upgradeHomeCores ──────────────────────────────────────────

describe("invokeAction — upgradeHomeCores (GI-1)", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
    const home = Player.getHomeComputer();
    home.cpuCores = 1;
    Player.bitNodeOptions.restrictHomePCUpgrade = false;
    Player.money = 1e15;
  });

  test("returns ok:false when cpuCores is already 8 (max)", async () => {
    Player.getHomeComputer().cpuCores = 8;
    const resp = await invokeAction(makeMsg("upgradeHomeCores", {}));
    const r = resp.result as { ok: boolean; message: string };
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/maximum/i);
  });

  test("returns ok:false when restrictHomePCUpgrade is on", async () => {
    Player.bitNodeOptions.restrictHomePCUpgrade = true;
    try {
      const resp = await invokeAction(makeMsg("upgradeHomeCores", {}));
      const r = resp.result as { ok: boolean };
      expect(r.ok).toBe(false);
    } finally {
      Player.bitNodeOptions.restrictHomePCUpgrade = false;
    }
  });

  test("returns ok:false when player cannot afford the upgrade", async () => {
    Player.money = 0;
    const resp = await invokeAction(makeMsg("upgradeHomeCores", {}));
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("increments cpuCores and returns ok:true when affordable", async () => {
    const home = Player.getHomeComputer();
    const before = home.cpuCores;
    const resp = await invokeAction(makeMsg("upgradeHomeCores", {}));
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(home.cpuCores).toBe(before + 1);
  });

  test("deducts money from player after success", async () => {
    const moneyBefore = Player.money;
    await invokeAction(makeMsg("upgradeHomeCores", {}));
    expect(Player.money).toBeLessThan(moneyBefore);
  });

  test("echoes [vscode] to the terminal on success", async () => {
    await invokeAction(makeMsg("upgradeHomeCores", {}));
    const hasEcho = Terminal.outputHistory.some(
      (e) => "text" in e && (e as { text: string }).text.includes("[vscode]"),
    );
    expect(hasEcho).toBe(true);
  });
});

// ─── invokeAction: applyForJob ────────────────────────────────────────────────

describe("invokeAction — applyForJob (GI-1)", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
    Player.money = 1e15;
  });

  test("missing company returns ok:false", async () => {
    const resp = await invokeAction(makeMsg("applyForJob", { position: "Software Engineer" }));
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("missing position returns ok:false", async () => {
    const resp = await invokeAction(makeMsg("applyForJob", { company: "MegaCorp" }));
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("unknown company name returns ok:false", async () => {
    const resp = await invokeAction(
      makeMsg("applyForJob", { company: "NotARealCompany", position: "Software Engineer" }),
    );
    const r = resp.result as { ok: boolean; message: string };
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/unknown company/i);
  });

  test("unknown position (not a JobName) returns ok:false", async () => {
    const resp = await invokeAction(
      makeMsg("applyForJob", { company: "MegaCorp", position: "not-a-real-position-xyz" }),
    );
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("valid but unqualified application returns ok:false with a message", async () => {
    // Fresh player has 0 hacking — won't qualify for a software engineering role.
    const resp = await invokeAction(
      makeMsg("applyForJob", { company: "MegaCorp", position: "Software Engineering Intern" }),
    );
    const r = resp.result as { ok: boolean; message: string };
    // Either the validate() caught it or Player.applyForJob returned failure — both give ok:false.
    expect(r.ok).toBe(false);
  });
});

// ─── invokeAction: openLocationInGame ────────────────────────────────────────

describe("invokeAction — openLocationInGame (GI-1)", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
  });

  test("unknown location returns ok:false", async () => {
    const resp = await invokeAction(makeMsg("openLocationInGame", { location: "NotARealPlace" }));
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("missing location param returns ok:false", async () => {
    const resp = await invokeAction(makeMsg("openLocationInGame", {}));
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("valid location returns ok:true", async () => {
    const resp = await invokeAction(
      makeMsg("openLocationInGame", { location: LocationName.Sector12AlphaEnterprises }),
    );
    const r = resp.result as { ok: boolean };
    expect(r.ok).toBe(true);
  });

  test("echoes [vscode] to terminal on success", async () => {
    await invokeAction(makeMsg("openLocationInGame", { location: LocationName.Sector12AlphaEnterprises }));
    const hasEcho = Terminal.outputHistory.some(
      (e) => "text" in e && (e as { text: string }).text.includes("[vscode]"),
    );
    expect(hasEcho).toBe(true);
  });
});
