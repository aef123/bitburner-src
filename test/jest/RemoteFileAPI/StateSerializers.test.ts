import {
  serializeHud,
  serializeNetwork,
  serializeRunningScripts,
  serializeScriptLog,
  serializeTerminal,
  serializeFactions,
  serializeInstallPreview,
} from "../../../src/RemoteFileAPI/StateSerializers";
import { WorkType } from "../../../src/Work/Work";
import { AugmentationName, FactionName } from "../../../src/Enums";
import { Factions } from "../../../src/Faction/Factions";
import { PlayerOwnedAugmentation } from "../../../src/Augmentation/PlayerOwnedAugmentation";
import {
  AddToAllServers,
  GetServerOrThrow,
  connectServers,
  prestigeAllServers,
} from "../../../src/Server/AllServers";
import { Server } from "../../../src/Server/Server";
import { HacknetServer } from "../../../src/Hacknet/HacknetServer";
import { DarknetServer } from "../../../src/Server/DarknetServer";
import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { workerScripts } from "../../../src/Netscript/WorkerScripts";
import { WorkerScript } from "../../../src/Netscript/WorkerScript";
import { RunningScript } from "../../../src/Script/RunningScript";
import { Terminal } from "../../../src/Terminal";
import { Output, Link, RawOutput } from "../../../src/Terminal/OutputTypes";
import { Settings } from "../../../src/Settings/Settings";
import type { IPAddress } from "../../../src/Types/strings";
import type { ScriptFilePath } from "../../../src/Paths/ScriptFilePath";
import type { PositiveInteger } from "../../../src/types";

/** Deep-equals a value with its JSON round-trip — fails if any non-JSON value slipped in. */
function expectJsonPure(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

/**
 * Build a small controlled network graph directly in the AllServers map:
 *   home ── n1 ── n2 ── n3        (3-deep chain)
 *   home ── hnode                 (hacknet server, must be excluded)
 *   home ── darknode              (darknet server beyond gateway, must be excluded)
 *   home ── darkweb               (darknet gateway, must be included)
 *   orphan                        (never linked — must never appear)
 * Plus a triangle home ── c1 ── c2 ── home to exercise the visited-set / cycle guard.
 */
function buildNetwork(): void {
  prestigeAllServers();
  setPlayer(new PlayerObject());

  const home = new Server({ hostname: "home", ip: "10.0.0.1" as IPAddress, maxRam: 64, adminRights: true });
  home.purchasedByPlayer = true;
  const n1 = new Server({
    hostname: "n1",
    ip: "10.0.0.2" as IPAddress,
    maxRam: 8,
    adminRights: true,
    requiredHackingSkill: 5,
    numOpenPortsRequired: 1,
    moneyAvailable: 1000,
    organizationName: "N1 Corp",
  });
  const n2 = new Server({ hostname: "n2", ip: "10.0.0.3" as IPAddress, maxRam: 16 });
  const n3 = new Server({ hostname: "n3", ip: "10.0.0.4" as IPAddress, maxRam: 32 });
  const orphan = new Server({ hostname: "orphan", ip: "10.0.0.5" as IPAddress, maxRam: 4 });
  const hnode = new HacknetServer({ hostname: "hacknet-server-0", ip: "10.0.0.6" as IPAddress });
  // A triangle (home ── c1 ── c2 ── home) to exercise the visited-set / cycle guard.
  const c1 = new Server({ hostname: "c1", ip: "10.0.0.9" as IPAddress, maxRam: 2 });
  const c2 = new Server({ hostname: "c2", ip: "10.0.0.10" as IPAddress, maxRam: 2 });

  const darknode = new DarknetServer();
  darknode.hostname = "darknode1";
  darknode.ip = "10.0.0.7" as IPAddress;
  const darkweb = new DarknetServer();
  darkweb.hostname = "darkweb";
  darkweb.ip = "10.0.0.8" as IPAddress;

  for (const s of [home, n1, n2, n3, orphan, hnode, darknode, darkweb, c1, c2]) {
    AddToAllServers(s);
  }
  connectServers(home, n1);
  connectServers(n1, n2);
  connectServers(n2, n3);
  connectServers(home, c1); // cycle: home - c1 - c2 - home
  connectServers(c1, c2);
  connectServers(c2, home);
  connectServers(home, hnode);
  connectServers(home, darknode);
  connectServers(home, darkweb);

  Player.currentServer = "home";
}

describe("serializeNetwork (discovery-safe BFS)", () => {
  beforeEach(buildNetwork);

  test("(a) an unlinked server NEVER appears", () => {
    const hosts = serializeNetwork().servers.map((s) => s.hostname);
    expect(hosts).not.toContain("orphan");
    expect(hosts).toContain("home");
  });

  test("(b) hacknet servers are excluded", () => {
    const hosts = serializeNetwork().servers.map((s) => s.hostname);
    expect(hosts).not.toContain("hacknet-server-0");
  });

  test("(b') darknet servers beyond the DarkWeb gateway are excluded, gateway is included", () => {
    const hosts = serializeNetwork().servers.map((s) => s.hostname);
    expect(hosts).not.toContain("darknode1");
    expect(hosts).toContain("darkweb");
  });

  test("(c) a cycle does not hang the serializer", () => {
    // If BFS didn't guard visited hostnames, this would loop forever.
    const hosts = serializeNetwork().servers.map((s) => s.hostname);
    // Each server appears exactly once despite the home-c1-c2 triangle cycle.
    expect(new Set(hosts).size).toBe(hosts.length);
    expect(hosts).toEqual(expect.arrayContaining(["home", "n1", "n2", "n3"]));
  });

  test("(d) parent/depth are correct along the 3-deep chain", () => {
    const byHost = new Map(serializeNetwork().servers.map((s) => [s.hostname, s]));
    expect(byHost.get("home")).toMatchObject({ parent: null, depth: 0 });
    expect(byHost.get("n1")).toMatchObject({ parent: "home", depth: 1 });
    expect(byHost.get("n2")).toMatchObject({ parent: "n1", depth: 2 });
    expect(byHost.get("n3")).toMatchObject({ parent: "n2", depth: 3 });
  });

  test("(e) network payload is JSON-pure and shaped per protocol", () => {
    const state = serializeNetwork();
    expect(state.current).toBe("home");
    const n1 = state.servers.find((s) => s.hostname === "n1");
    expect(n1).toMatchObject({
      hostname: "n1",
      parent: "home",
      depth: 1,
      hasAdminRights: true,
      requiredHackingSkill: 5,
      numOpenPortsRequired: 1,
      maxRam: 8,
      organizationName: "N1 Corp",
    });
    expect(typeof n1?.moneyAvailable).toBe("number");
    expectJsonPure(state);
  });
});

describe("serializeHud", () => {
  beforeEach(buildNetwork);

  test("reports money, skills, hp, location and rooted-only ram totals; JSON-pure", () => {
    Player.money = 123456;
    Player.skills.hacking = 42;
    Player.hp.current = 7;
    Player.hp.max = 10;
    // Give a rooted server some used ram to verify network-wide rooted sums.
    GetServerOrThrow("n1").ramUsed = 3;

    const hud = serializeHud();
    expect(hud.money).toBe(123456);
    expect(hud.hackLevel).toBe(42);
    expect(hud.skills.hacking).toBe(42);
    expect(hud.hp).toEqual({ current: 7, max: 10 });
    expect(typeof hud.city).toBe("string");
    expect(typeof hud.location).toBe("string");
    // Rooted servers only: home (64) + n1 (8) rooted; n2/n3 not rooted.
    expect(hud.ramTotal).toBe(72);
    expect(hud.ramUsed).toBe(3);
    expect(hud.currentWork).toBeNull();
    expect(hud.gangTerritory).toBeNull();
    expect(hud.numAugQueued).toBe(0);
    expectJsonPure(hud);
  });

  test("currentWork etaMs is null for non-timed work types (crime)", () => {
    Player.currentWork = { type: WorkType.CRIME, crimeType: "robbery" } as never;
    const hud = serializeHud();
    expect(hud.currentWork).not.toBeNull();
    expect(hud.currentWork?.etaMs).toBeNull();
  });

  test("currentWork etaMs is a positive number for CreateProgramWork with unitRate > 0", () => {
    // unitRate > 0, unitCompleted < unitNeeded → should produce a finite positive etaMs.
    Player.currentWork = {
      type: WorkType.CREATE_PROGRAM,
      programName: "BruteSSH.exe",
      unitRate: 1000,
      unitCompleted: 200,
      unitNeeded: () => 1200,
    } as never;
    const hud = serializeHud();
    expect(hud.currentWork).not.toBeNull();
    expect(typeof hud.currentWork?.etaMs).toBe("number");
    expect((hud.currentWork?.etaMs as number)).toBeGreaterThan(0);
    expectJsonPure(hud);
  });

  test("currentWork etaMs is null for CreateProgramWork before first process() call (unitRate === 0)", () => {
    Player.currentWork = {
      type: WorkType.CREATE_PROGRAM,
      programName: "BruteSSH.exe",
      unitRate: 0,
      unitCompleted: 0,
      unitNeeded: () => 1000,
    } as never;
    const hud = serializeHud();
    expect(hud.currentWork?.etaMs).toBeNull();
  });

  test("currentWork etaMs is a positive number for GraftingWork with unitRate > 0", () => {
    Player.currentWork = {
      type: WorkType.GRAFTING,
      augmentation: "Targeting I",
      unitRate: 500,
      unitCompleted: 100,
      unitNeeded: () => 900,
    } as never;
    const hud = serializeHud();
    expect(hud.currentWork).not.toBeNull();
    expect(typeof hud.currentWork?.etaMs).toBe("number");
    expect((hud.currentWork?.etaMs as number)).toBeGreaterThan(0);
    expectJsonPure(hud);
  });

  test("currentWork etaMs is null for GraftingWork before first process() call (unitRate === 0)", () => {
    Player.currentWork = {
      type: WorkType.GRAFTING,
      augmentation: "Targeting I",
      unitRate: 0,
      unitCompleted: 0,
      unitNeeded: () => 1000,
    } as never;
    const hud = serializeHud();
    expect(hud.currentWork?.etaMs).toBeNull();
  });

  afterEach(() => {
    Player.currentWork = null;
  });
});

describe("serializeRunningScripts", () => {
  beforeEach(() => {
    buildNetwork();
    workerScripts.clear();
  });

  afterEach(() => workerScripts.clear());

  function addScript(pid: number, filename: string): WorkerScript {
    const home = GetServerOrThrow("home");
    const path = filename as ScriptFilePath;
    home.writeToScriptFile(path, "export async function main(ns) {}");
    const script = home.scripts.get(path);
    if (!script) throw new Error("script not created");
    const rs = new RunningScript(script, 3.2, ["arg1", 2, true]);
    const ws = new WorkerScript(rs, pid);
    rs.onlineMoneyMade = 100;
    rs.onlineRunningTime = 10; // -> 10/s
    rs.onlineExpGained = 40; // -> 4 exp/s
    rs.threads = 3 as PositiveInteger;
    workerScripts.set(ws.pid, ws);
    return ws;
  }

  test("serializes worker scripts from the workerScripts map; JSON-pure", () => {
    addScript(1, "a.js");

    const state = serializeRunningScripts();
    expect(state.processCount).toBe(1);
    expect(state.totalIncomePerSec).toBeCloseTo(10);
    expect(state.totalExpPerSec).toBeCloseTo(4);
    expect(state.scripts).toHaveLength(1);
    expect(state.scripts[0]).toMatchObject({
      pid: 1,
      filename: "a.js",
      server: "home",
      args: ["arg1", 2, true],
      threads: 3,
      incomePerSec: 10,
      expPerSec: 4,
      onlineRunningTimeSec: 10,
      temporary: false,
    });
    expectJsonPure(state);
  });
});

describe("serializeScriptLog", () => {
  beforeEach(() => {
    buildNetwork();
    workerScripts.clear();
  });
  afterEach(() => workerScripts.clear());

  test("renders string logs to text, non-string nodes to empty, supports afterLine and running flag", () => {
    const home = GetServerOrThrow("home");
    const path = "log.js" as ScriptFilePath;
    home.writeToScriptFile(path, "export async function main(ns) {}");
    const script = home.scripts.get(path);
    if (!script) throw new Error("script not created");
    const rs = new RunningScript(script, 1.6);
    const ws = new WorkerScript(rs, 7);
    rs.logs.push("line1", "line2", { not: "a string" } as unknown as string);
    workerScripts.set(ws.pid, ws);

    const full = serializeScriptLog(7);
    expect(full).toEqual({ pid: 7, lines: ["line1", "line2", ""], startLine: 0, running: true });

    const partial = serializeScriptLog(7, 1);
    expect(partial).toEqual({ pid: 7, lines: ["line2", ""], startLine: 1, running: true });

    const missing = serializeScriptLog(9999);
    expect(missing).toEqual({ pid: 9999, lines: [], startLine: 0, running: false });
    expectJsonPure(full);
  });
});

describe("serializeTerminal", () => {
  const savedTimestamps = Settings.TimestampsFormat;
  const savedHistory = Terminal.outputHistory;
  const savedAction = Terminal.action;

  beforeEach(() => {
    buildNetwork();
    Settings.TimestampsFormat = "";
  });
  afterEach(() => {
    Settings.TimestampsFormat = savedTimestamps;
    Terminal.outputHistory = savedHistory;
    Terminal.action = savedAction;
  });

  test("maps Output/Link/RawOutput entries, reports cwd and busy; supports afterIndex; JSON-pure", () => {
    Terminal.action = null;
    Terminal.outputHistory = [
      new Output("hello", "success"),
      new Link("---", "n1"),
      new RawOutput(null),
    ];

    const state = serializeTerminal();
    expect(state.cwdServer).toBe("home");
    expect(state.busy).toBe(false);
    expect(state.startIndex).toBe(0);
    expect(state.entries).toEqual([
      { kind: "output", text: "hello", color: "success" },
      { kind: "link", text: "n1" },
      { kind: "raw", text: "" },
    ]);
    expectJsonPure(state);

    const delta = serializeTerminal(1);
    expect(delta.startIndex).toBe(1);
    expect(delta.entries).toEqual([
      { kind: "link", text: "n1" },
      { kind: "raw", text: "" },
    ]);

    // busy reflects Terminal.action !== null
    Terminal.action = {} as unknown as typeof Terminal.action;
    expect(serializeTerminal().busy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// serializeFactions / serializeInstallPreview
// ---------------------------------------------------------------------------

const TEST_FACTION = FactionName.CyberSec;

/** Join CyberSec in the Factions singleton and add it to Player.factions. */
function setupFactionMembership(): void {
  const f = Factions[TEST_FACTION];
  f.isMember = true;
  f.playerReputation = 5000;
  f.setFavor(10);
  Player.factions = [TEST_FACTION];
}

/** Undo the Factions singleton side-effects from setupFactionMembership. */
function teardownFactionMembership(): void {
  const f = Factions[TEST_FACTION];
  f.isMember = false;
  f.playerReputation = 0;
  f.setFavor(0);
}

describe("serializeFactions", () => {
  beforeEach(() => {
    setPlayer(new PlayerObject());
    setupFactionMembership();
  });

  afterEach(() => {
    teardownFactionMembership();
  });

  test("(a) joined faction has correct name, reputation, and favor", () => {
    const state = serializeFactions();
    expect(state.joined).toHaveLength(1);
    const dto = state.joined[0];
    expect(dto.name).toBe(TEST_FACTION);
    expect(dto.reputation).toBe(5000);
    expect(dto.favor).toBe(10);
    expect(dto.augments.length).toBeGreaterThan(0);
  });

  test("(b) aug flags: owned/queued/prereqsMet are correct", () => {
    // Install BitWire (no prereqs, offered by CyberSec)
    Player.augmentations.push(new PlayerOwnedAugmentation(AugmentationName.BitWire));
    // Queue CSG1 (no prereqs, offered by CyberSec)
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.CranialSignalProcessorsG1));

    const state = serializeFactions();
    const dto = state.joined[0];

    // BitWire installed → owned=true, not queued
    const bitWire = dto.augments.find((a) => a.name === AugmentationName.BitWire);
    expect(bitWire).toBeDefined();
    expect(bitWire?.owned).toBe(true);
    expect(bitWire?.queued).toBe(false);

    // CSG1 queued but not installed → owned=false, queued=true
    const csg1 = dto.augments.find((a) => a.name === AugmentationName.CranialSignalProcessorsG1);
    expect(csg1).toBeDefined();
    expect(csg1?.owned).toBe(false);
    expect(csg1?.queued).toBe(true);

    // CSG2 requires CSG1; CSG1 is queued so hasAugmentation returns true → prereqsMet=true
    const csg2 = dto.augments.find((a) => a.name === AugmentationName.CranialSignalProcessorsG2);
    expect(csg2).toBeDefined();
    expect(csg2?.prereqsMet).toBe(true);
    expect(csg2?.prereqs).toContain(AugmentationName.CranialSignalProcessorsG1);
  });

  test("(c) prereqsMet is false when prereq is neither installed nor queued", () => {
    // CSG2 requires CSG1; neither is present
    const state = serializeFactions();
    const dto = state.joined[0];
    const csg2 = dto.augments.find((a) => a.name === AugmentationName.CranialSignalProcessorsG2);
    expect(csg2).toBeDefined();
    expect(csg2?.prereqsMet).toBe(false);
  });

  test("(d) NFG is NOT marked owned=true even when present in Player.augmentations", () => {
    // NFG is repeatable — should never appear as permanently owned
    Player.augmentations.push(new PlayerOwnedAugmentation(AugmentationName.NeuroFluxGovernor));
    const state = serializeFactions();
    const dto = state.joined[0];
    const nfg = dto.augments.find((a) => a.name === AugmentationName.NeuroFluxGovernor);
    expect(nfg).toBeDefined();
    expect(nfg?.owned).toBe(false); // Special NFG case: repeatable, always purchasable
  });

  test("(e) augQueue lists queued augs with best-effort faction lookup", () => {
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.BitWire));
    const state = serializeFactions();
    expect(state.augQueue).toHaveLength(1);
    expect(state.augQueue[0].name).toBe(AugmentationName.BitWire);
    // BitWire is offered by CyberSec (the only joined faction) → faction resolves to CyberSec
    expect(state.augQueue[0].faction).toBe(TEST_FACTION);
  });

  test("(f) priceMultiplier is 1 with empty queue; increases when a non-SoA aug is queued", () => {
    expect(serializeFactions().priceMultiplier).toBe(1);
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.BitWire));
    expect(serializeFactions().priceMultiplier).toBeGreaterThan(1);
  });

  test("(g) serializeFactions output is JSON-pure", () => {
    expectJsonPure(serializeFactions());
  });
});

describe("serializeInstallPreview", () => {
  beforeEach(() => {
    setPlayer(new PlayerObject());
    setupFactionMembership();
  });

  afterEach(() => {
    teardownFactionMembership();
  });

  test("(a) empty queue → empty augs, totalPrice 0, empty effectSummary", () => {
    const preview = serializeInstallPreview();
    expect(preview.augs).toHaveLength(0);
    expect(preview.totalPrice).toBe(0);
    expect(preview.effectSummary).toHaveLength(0);
  });

  test("(b) totalPrice equals sum of individual aug prices; effectSummary has one line per aug", () => {
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.BitWire));
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.CranialSignalProcessorsG1));

    const preview = serializeInstallPreview();
    expect(preview.augs).toHaveLength(2);
    const expectedTotal = preview.augs.reduce((sum, a) => sum + a.price, 0);
    expect(preview.totalPrice).toBeCloseTo(expectedTotal);
    expect(preview.effectSummary).toHaveLength(2);
  });

  test("(c) each aug entry has name, faction, and numeric price", () => {
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.BitWire));
    const preview = serializeInstallPreview();
    expect(preview.augs[0].name).toBe(AugmentationName.BitWire);
    expect(typeof preview.augs[0].price).toBe("number");
    expect(preview.augs[0].faction).toBe(TEST_FACTION);
  });

  test("(d) serializeInstallPreview output is JSON-pure", () => {
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.BitWire));
    expectJsonPure(serializeInstallPreview());
  });
});
