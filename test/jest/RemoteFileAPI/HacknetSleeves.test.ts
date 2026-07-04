/**
 * Tests for GD-2: hacknet + sleeves serializers and actions.
 *
 * TDD — written before implementation.
 *
 * Strategy:
 *  - serializeHacknet: construct HacknetNodes on the Player (nodes mode, default BitNode). Assert
 *    HacknetNodeDto fields and that bestBuys are ROI-ranked (paybackSeconds ascending).
 *  - serializeSleeves: construct Player.sleeves, assert task discrimination for idle + a work type.
 *  - hacknetPurchase: level upgrade success + refusal (can't afford).
 *  - setSleeveTask: recovery success + refusal (index out of range).
 */

import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { HacknetNode } from "../../../src/Hacknet/HacknetNode";
import { Sleeve } from "../../../src/PersonObjects/Sleeve/Sleeve";
import { CrimeType } from "../../../src/Enums";
import { serializeHacknet, serializeSleeves } from "../../../src/RemoteFileAPI/StateSerializers";
import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Terminal } from "../../../src/Terminal";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupPlayer(): void {
  setPlayer(new PlayerObject());
  Terminal.outputHistory = [];
}

function makeMsg(action: string, args: Record<string, unknown> = {}, id = 1): RFAMessage {
  return new RFAMessage({ method: "invokeAction", params: { action, args } as never, id });
}

/** Add a fresh HacknetNode to the player and return it. */
function addNode(): HacknetNode {
  const node = new HacknetNode(`hacknet-node-${Player.hacknetNodes.length}`, Player.mults.hacknet_node_money);
  Player.hacknetNodes.push(node);
  return node;
}

// ─── serializeHacknet — nodes mode ───────────────────────────────────────────

describe("serializeHacknet — nodes mode", () => {
  beforeEach(() => {
    setupPlayer();
    Player.hacknetNodes = [];
  });

  test("isServers is false in the default BitNode", () => {
    expect(serializeHacknet().isServers).toBe(false);
  });

  test("hashes is null in nodes mode", () => {
    expect(serializeHacknet().hashes).toBeNull();
  });

  test("nodes array reflects the player's hacknet nodes", () => {
    const node = addNode();
    node.level = 10;
    node.ram = 4;
    node.cores = 2;
    node.updateMoneyGainRate(Player.mults.hacknet_node_money);

    const state = serializeHacknet();
    expect(state.nodes).toHaveLength(1);
    const dto = state.nodes[0];
    expect(dto.index).toBe(0);
    expect(dto.name).toBe(node.name);
    expect(dto.level).toBe(10);
    expect(dto.ram).toBe(4);
    expect(dto.cores).toBe(2);
    expect(dto.cache).toBeNull();
    expect(dto.productionPerSec).toBeCloseTo(node.moneyGainRatePerSecond);
  });

  test("totalProductionPerSec sums node production", () => {
    const a = addNode();
    const b = addNode();
    const state = serializeHacknet();
    expect(state.totalProductionPerSec).toBeCloseTo(a.moneyGainRatePerSecond + b.moneyGainRatePerSecond);
  });

  test("bestBuys is non-empty and includes a 'new node' buy", () => {
    addNode();
    const state = serializeHacknet();
    expect(state.bestBuys.length).toBeGreaterThan(0);
    expect(state.bestBuys.some((b) => b.action.kind === "node")).toBe(true);
  });

  test("bestBuys are ranked by ascending payback (ROI)", () => {
    // Two nodes at very different levels produce upgrades with different paybacks.
    const cheap = addNode(); // level 1 — cheap level upgrade, best payback
    const pricey = addNode();
    pricey.level = 150; // expensive level upgrade, worse payback
    pricey.updateMoneyGainRate(Player.mults.hacknet_node_money);

    const buys = serializeHacknet().bestBuys;
    const paybacks = buys.map((b) => b.paybackSeconds).filter((p): p is number => p !== null);
    expect(paybacks.length).toBeGreaterThan(1);
    for (let i = 1; i < paybacks.length; i++) {
      expect(paybacks[i]).toBeGreaterThanOrEqual(paybacks[i - 1]);
    }
  });

  test("every buy carries a description, cost, and action {kind,index}", () => {
    addNode();
    for (const b of serializeHacknet().bestBuys) {
      expect(typeof b.description).toBe("string");
      expect(typeof b.cost).toBe("number");
      expect(["node", "level", "ram", "core", "cache"]).toContain(b.action.kind);
      expect(typeof b.action.index).toBe("number");
    }
  });

  test("result is JSON-serializable", () => {
    addNode();
    const state = serializeHacknet();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

// ─── serializeSleeves ────────────────────────────────────────────────────────

describe("serializeSleeves", () => {
  beforeEach(() => {
    setupPlayer();
  });

  test("returns an empty array when there are no sleeves", () => {
    Player.sleeves = [];
    expect(serializeSleeves()).toEqual([]);
  });

  test("a fresh sleeve defaults to the Recovery task", () => {
    Player.sleeves = [new Sleeve()];
    const dto = serializeSleeves()[0];
    expect(dto.index).toBe(0);
    expect(dto.task).toBe("Recovery");
  });

  test("an idle sleeve (no work) reports Idle", () => {
    const sleeve = new Sleeve();
    sleeve.stopWork();
    Player.sleeves = [sleeve];
    expect(serializeSleeves()[0].task).toBe("Idle");
  });

  test("a sleeve committing a crime reports Crime", () => {
    const sleeve = new Sleeve();
    sleeve.commitCrime(CrimeType.shoplift);
    Player.sleeves = [sleeve];
    expect(serializeSleeves()[0].task).toBe("Crime");
  });

  test("dto carries shock, sync, city, and stats", () => {
    Player.sleeves = [new Sleeve()];
    const dto = serializeSleeves()[0];
    expect(typeof dto.shock).toBe("number");
    expect(typeof dto.sync).toBe("number");
    expect(typeof dto.city).toBe("string");
    expect(typeof dto.stats.hack).toBe("number");
    expect(typeof dto.stats.cha).toBe("number");
  });

  test("result is JSON-serializable", () => {
    Player.sleeves = [new Sleeve()];
    const state = serializeSleeves();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

// ─── invokeAction — hacknetPurchase ──────────────────────────────────────────

describe("invokeAction — hacknetPurchase", () => {
  beforeEach(() => {
    setupPlayer();
    Player.hacknetNodes = [];
  });

  test("level upgrade succeeds and raises the node level when affordable", async () => {
    const node = addNode();
    Player.money = 1e12;
    const startLevel = node.level;
    const resp = await invokeAction(makeMsg("hacknetPurchase", { kind: "level", index: 0 }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(node.level).toBe(startLevel + 1);
  });

  test("level upgrade refuses (ok:false) when the player cannot afford it", async () => {
    const node = addNode();
    Player.money = 0;
    const startLevel = node.level;
    const resp = await invokeAction(makeMsg("hacknetPurchase", { kind: "level", index: 0 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
    expect(node.level).toBe(startLevel);
  });

  test("buying a new node succeeds when affordable", async () => {
    Player.money = 1e12;
    const resp = await invokeAction(makeMsg("hacknetPurchase", { kind: "node" }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(Player.hacknetNodes.length).toBe(1);
  });

  test("refuses (ok:false) for an out-of-range node index", async () => {
    addNode();
    Player.money = 1e12;
    const resp = await invokeAction(makeMsg("hacknetPurchase", { kind: "level", index: 99 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("refuses (ok:false) for an unknown kind", async () => {
    addNode();
    const resp = await invokeAction(makeMsg("hacknetPurchase", { kind: "banana", index: 0 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("echoes [vscode] to the terminal on the success path", async () => {
    addNode();
    Player.money = 1e12;
    await invokeAction(makeMsg("hacknetPurchase", { kind: "level", index: 0 }));
    const echoed = Terminal.outputHistory.some(
      (e) => "text" in e && (e as { text: string }).text.includes("[vscode]"),
    );
    expect(echoed).toBe(true);
  });
});

// ─── invokeAction — setSleeveTask ────────────────────────────────────────────

describe("invokeAction — setSleeveTask", () => {
  beforeEach(() => {
    setupPlayer();
  });

  test("recovery task succeeds and assigns shock recovery work", async () => {
    const sleeve = new Sleeve();
    sleeve.stopWork();
    Player.sleeves = [sleeve];
    const resp = await invokeAction(makeMsg("setSleeveTask", { index: 0, task: { type: "recovery" } }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(serializeSleeves()[0].task).toBe("Recovery");
  });

  test("idle task succeeds and stops work", async () => {
    Player.sleeves = [new Sleeve()];
    const resp = await invokeAction(makeMsg("setSleeveTask", { index: 0, task: { type: "idle" } }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(serializeSleeves()[0].task).toBe("Idle");
  });

  test("crime task succeeds and assigns crime work", async () => {
    Player.sleeves = [new Sleeve()];
    const resp = await invokeAction(
      makeMsg("setSleeveTask", { index: 0, task: { type: "crime", crime: CrimeType.shoplift } }),
    );
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(serializeSleeves()[0].task).toBe("Crime");
  });

  test("refuses (ok:false) for an out-of-range sleeve index", async () => {
    Player.sleeves = [new Sleeve()];
    const resp = await invokeAction(makeMsg("setSleeveTask", { index: 5, task: { type: "recovery" } }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("refuses (ok:false) for an unknown task type", async () => {
    Player.sleeves = [new Sleeve()];
    const resp = await invokeAction(makeMsg("setSleeveTask", { index: 0, task: { type: "nonsense" } }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("refuses (ok:false) for a crime task with an invalid crime", async () => {
    Player.sleeves = [new Sleeve()];
    const resp = await invokeAction(
      makeMsg("setSleeveTask", { index: 0, task: { type: "crime", crime: "NotACrime" } }),
    );
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });
});
