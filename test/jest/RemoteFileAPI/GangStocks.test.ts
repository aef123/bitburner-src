/**
 * Tests for GD-1: gang + stocks serializers and actions.
 *
 * TDD — written before implementation.
 *
 * Strategy:
 *  - serializeGang: test null branch (Player.gang=null) and a real Gang+member, including the
 *    canAscend / ascensionResults branch (capability-sensitive mapping).
 *  - serializeStocks: test null branch (no WSE), no-4S branch (REQUIRED capability regression:
 *    forecast/volatility must be null), and 4S branch.
 *  - Gang actions: ascendGangMember success + refusals; setGangMemberTask success + refusal.
 *  - Stock actions: buyStock success + refusals; sellStock success + refusal; coverShort → sellShort
 *    mapping.
 */

// Mock BuyingAndSelling before any import so GameActionHandlers gets jest fns.
jest.mock("../../../src/StockMarket/BuyingAndSelling", () => ({
  buyStock: jest.fn(),
  sellStock: jest.fn(),
  shortStock: jest.fn(),
  sellShort: jest.fn(),
}));

import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { Gang } from "../../../src/Gang/Gang";
import { GangMember } from "../../../src/Gang/GangMember";
import { GangMemberTasks } from "../../../src/Gang/GangMemberTasks";
import { FactionName } from "../../../src/Enums";
import { Stock } from "../../../src/StockMarket/Stock";
import { StockMarket, SymbolToStockMap } from "../../../src/StockMarket/StockMarket";
import { serializeGang, serializeStocks } from "../../../src/RemoteFileAPI/StateSerializers";
import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Terminal } from "../../../src/Terminal";
import {
  buyStock as buyStockMock,
  sellStock as sellStockMock,
  sellShort as sellShortMock,
} from "../../../src/StockMarket/BuyingAndSelling";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupPlayer(): void {
  setPlayer(new PlayerObject());
  Terminal.outputHistory = [];
}

function makeMsg(action: string, args: Record<string, unknown> = {}, id = 1): RFAMessage {
  return new RFAMessage({ method: "invokeAction", params: { action, args } as never, id });
}

/** Create a minimal Gang instance with enough respect to recruit. */
function makeGang(hacking = false): Gang {
  const gang = new Gang(FactionName.SlumSnakes, hacking);
  gang.respect = 1000;
  return gang;
}

/** Create a minimal Stock instance and register it in the market + symbol map. */
function makeStock(symbol: string, price = 100): Stock {
  return new Stock({
    b: true,
    initPrice: price,
    marketCap: 1e13,
    mv: 1,
    name: `TestCorp_${symbol}`,
    otlkMag: 10,
    spreadPerc: 1,
    shareTxForMovement: 1e6,
    symbol,
  });
}

/** Register a stock in StockMarket and SymbolToStockMap by a synthetic full-name key. */
function registerStock(stock: Stock, marketKey: string): void {
  (StockMarket as Record<string, unknown>)[marketKey] = stock;
  SymbolToStockMap[stock.symbol] = stock;
}

function unregisterStock(stock: Stock, marketKey: string): void {
  delete (StockMarket as Record<string, unknown>)[marketKey];
  delete SymbolToStockMap[stock.symbol];
}

// ─── serializeGang — null branch ─────────────────────────────────────────────

describe("serializeGang — null branch", () => {
  beforeEach(() => {
    setupPlayer();
    Player.gang = null;
  });

  test("returns null when player has no gang", () => {
    expect(serializeGang()).toBeNull();
  });
});

// ─── serializeGang — populated gang ──────────────────────────────────────────

describe("serializeGang — populated gang", () => {
  let gang: Gang;

  beforeEach(() => {
    setupPlayer();
    gang = makeGang(false); // combat gang
    const member = new GangMember("Alice");
    // Fresh member: hack_exp=0, so canAscend() returns false
    gang.members = [member];
    Player.gang = gang;
  });

  afterEach(() => {
    Player.gang = null;
  });

  test("returns a non-null GangState", () => {
    expect(serializeGang()).not.toBeNull();
  });

  test("faction matches gang.facName", () => {
    expect(serializeGang()!.faction).toBe(FactionName.SlumSnakes);
  });

  test("isHacking matches gang.isHackingGang", () => {
    expect(serializeGang()!.isHacking).toBe(false);
  });

  test("members array has one entry with correct name", () => {
    const state = serializeGang()!;
    expect(state.members).toHaveLength(1);
    expect(state.members[0].name).toBe("Alice");
  });

  test("ascensionResults is null when member cannot ascend (low exp)", () => {
    // Default hack_exp=0, calculateAscensionPointsGain(0) = max(0-1000,0) = 0 → canAscend()=false
    expect(serializeGang()!.members[0].ascensionResults).toBeNull();
  });

  test("ascensionResults is a non-null record when member has exp > 1000", () => {
    // calculateAscensionPointsGain(2000) = max(2000-1000,0) = 1000 > 0 → canAscend()=true
    gang.members[0].hack_exp = 2000;
    const asc = serializeGang()!.members[0].ascensionResults;
    expect(asc).not.toBeNull();
    expect(typeof asc!.hack).toBe("number");
    expect(typeof asc!.str).toBe("number");
  });

  test("taskNames is a non-empty array of strings", () => {
    const { taskNames } = serializeGang()!;
    expect(Array.isArray(taskNames)).toBe(true);
    expect(taskNames.length).toBeGreaterThan(0);
    expect(typeof taskNames[0]).toBe("string");
  });

  test("otherGangs does not include the player's own faction", () => {
    const { otherGangs } = serializeGang()!;
    expect(otherGangs.length).toBeGreaterThan(0);
    expect(otherGangs.every((g) => g.name !== FactionName.SlumSnakes)).toBe(true);
  });

  test("otherGangs entries have name, territory, and power", () => {
    const { otherGangs } = serializeGang()!;
    for (const g of otherGangs) {
      expect(typeof g.name).toBe("string");
      expect(typeof g.territory).toBe("number");
      expect(typeof g.power).toBe("number");
    }
  });

  test("equipment is an array (from member.upgrades)", () => {
    expect(Array.isArray(serializeGang()!.members[0].equipment)).toBe(true);
  });

  test("result is JSON-serializable (no non-JSON values)", () => {
    const state = serializeGang()!;
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  test("equipmentCatalog is a non-empty array of {name, cost, type} entries", () => {
    const { equipmentCatalog } = serializeGang()!;
    expect(Array.isArray(equipmentCatalog)).toBe(true);
    expect(equipmentCatalog.length).toBeGreaterThan(0);
    for (const entry of equipmentCatalog) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.cost).toBe("number");
      expect(typeof entry.type).toBe("string");
      expect(Number.isFinite(entry.cost)).toBe(true);
    }
  });

  test("equipmentCatalog entries are JSON-pure", () => {
    const { equipmentCatalog } = serializeGang()!;
    expect(JSON.parse(JSON.stringify(equipmentCatalog))).toEqual(equipmentCatalog);
  });
});

// ─── serializeStocks — null branch ───────────────────────────────────────────

describe("serializeStocks — null branch", () => {
  beforeEach(() => {
    setupPlayer();
    Player.hasWseAccount = false;
  });

  test("returns null when player has no WSE account", () => {
    expect(serializeStocks()).toBeNull();
  });
});

// ─── serializeStocks — without 4S data (CAPABILITY REGRESSION TEST) ──────────

describe("serializeStocks — without 4S data", () => {
  let testStock: Stock;
  const MARKET_KEY = "__testStockNoFour";

  beforeEach(() => {
    setupPlayer();
    Player.hasWseAccount = true;
    Player.hasTixApiAccess = true;
    Player.has4SData = false;

    testStock = makeStock("ECS", 100);
    registerStock(testStock, MARKET_KEY);
  });

  afterEach(() => {
    unregisterStock(testStock, MARKET_KEY);
  });

  // REQUIRED capability regression: forecast and volatility are discovery info that must be
  // hidden when the player has not purchased 4S Market Data.
  test("forecast is null when has4SData is false", () => {
    const state = serializeStocks()!;
    const dto = state.watchable.find((s) => s.symbol === "ECS");
    expect(dto).toBeDefined();
    expect(dto!.forecast).toBeNull();
  });

  test("volatility is null when has4SData is false", () => {
    const state = serializeStocks()!;
    const dto = state.watchable.find((s) => s.symbol === "ECS");
    expect(dto!.volatility).toBeNull();
  });

  test("other fields are still present when has4SData is false", () => {
    const state = serializeStocks()!;
    const dto = state.watchable.find((s) => s.symbol === "ECS")!;
    expect(typeof dto.price).toBe("number");
    expect(typeof dto.askPrice).toBe("number");
    expect(typeof dto.bidPrice).toBe("number");
    expect(typeof dto.maxShares).toBe("number");
  });
});

// ─── serializeStocks — with 4S data ──────────────────────────────────────────

describe("serializeStocks — with 4S data", () => {
  let testStock: Stock;
  const MARKET_KEY = "__testStockFour";

  beforeEach(() => {
    setupPlayer();
    Player.hasWseAccount = true;
    Player.hasTixApiAccess = true;
    Player.has4SData = true;

    testStock = makeStock("ECS", 100);
    registerStock(testStock, MARKET_KEY);
  });

  afterEach(() => {
    unregisterStock(testStock, MARKET_KEY);
  });

  test("forecast is a finite number when has4SData is true", () => {
    const dto = serializeStocks()!.watchable.find((s) => s.symbol === "ECS")!;
    expect(typeof dto.forecast).toBe("number");
    expect(Number.isFinite(dto.forecast!)).toBe(true);
  });

  test("volatility is a finite number when has4SData is true", () => {
    const dto = serializeStocks()!.watchable.find((s) => s.symbol === "ECS")!;
    expect(typeof dto.volatility).toBe("number");
    expect(Number.isFinite(dto.volatility!)).toBe(true);
  });

  test("positions includes stocks where player owns shares (long)", () => {
    testStock.playerShares = 100;
    testStock.playerAvgPx = 90;
    const pos = serializeStocks()!.positions.find((s) => s.symbol === "ECS");
    expect(pos).toBeDefined();
    expect(pos!.playerShares).toBe(100);
  });

  test("positions includes stocks where player owns short shares", () => {
    testStock.playerShortShares = 20;
    testStock.playerAvgShortPx = 110;
    const pos = serializeStocks()!.positions.find((s) => s.symbol === "ECS");
    expect(pos).toBeDefined();
    expect(pos!.playerShortShares).toBe(20);
  });

  test("positions does NOT include stocks with zero long and zero short shares", () => {
    testStock.playerShares = 0;
    testStock.playerShortShares = 0;
    expect(serializeStocks()!.positions.find((s) => s.symbol === "ECS")).toBeUndefined();
  });

  test("price history ring is built up across successive calls", () => {
    serializeStocks();
    serializeStocks();
    const state = serializeStocks()!;
    const ring = state.history["ECS"];
    expect(ring).toBeDefined();
    expect(ring.length).toBeGreaterThanOrEqual(1);
  });

  test("result is JSON-serializable", () => {
    const state = serializeStocks()!;
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

// ─── invokeAction — ascendGangMember ─────────────────────────────────────────

describe("invokeAction — ascendGangMember", () => {
  let gang: Gang;

  beforeEach(() => {
    setupPlayer();
    gang = makeGang();
    const member = new GangMember("Bob");
    member.hack_exp = 2000; // canAscend() → true
    gang.members = [member];
    Player.gang = gang;
  });

  afterEach(() => {
    Player.gang = null;
  });

  test("returns ok:true when member exists and can ascend", async () => {
    const resp = await invokeAction(makeMsg("ascendGangMember", { member: "Bob" }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
  });

  test("returns ok:false when member does not exist", async () => {
    const resp = await invokeAction(makeMsg("ascendGangMember", { member: "Ghost" }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("returns ok:false when member cannot ascend (exp below threshold)", async () => {
    gang.members[0].hack_exp = 0;
    const resp = await invokeAction(makeMsg("ascendGangMember", { member: "Bob" }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("returns ok:false when player has no gang", async () => {
    Player.gang = null;
    const resp = await invokeAction(makeMsg("ascendGangMember", { member: "Bob" }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("validation: missing member arg returns ok:false", async () => {
    const resp = await invokeAction(makeMsg("ascendGangMember", {}));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });
});

// ─── invokeAction — setGangMemberTask ────────────────────────────────────────

describe("invokeAction — setGangMemberTask", () => {
  let gang: Gang;
  // "Mug People" is a combat-only task that exists in GangMemberTasks.
  const VALID_TASK = "Mug People";

  beforeEach(() => {
    setupPlayer();
    gang = makeGang(false); // combat gang
    const member = new GangMember("Carol");
    gang.members = [member];
    Player.gang = gang;
  });

  afterEach(() => {
    Player.gang = null;
  });

  test("returns ok:true when member and task are valid", async () => {
    const resp = await invokeAction(makeMsg("setGangMemberTask", { member: "Carol", task: VALID_TASK }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
  });

  test("member task is updated after success", async () => {
    await invokeAction(makeMsg("setGangMemberTask", { member: "Carol", task: VALID_TASK }));
    expect(gang.members[0].task).toBe(VALID_TASK);
  });

  test("returns ok:false when task name is unknown", async () => {
    const resp = await invokeAction(makeMsg("setGangMemberTask", { member: "Carol", task: "NotARealTask9999" }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("returns ok:false when member does not exist", async () => {
    const resp = await invokeAction(makeMsg("setGangMemberTask", { member: "Ghost", task: VALID_TASK }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("validation: missing args returns ok:false", async () => {
    const resp = await invokeAction(makeMsg("setGangMemberTask", {}));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });
});

// ─── invokeAction — buyStock ──────────────────────────────────────────────────

describe("invokeAction — buyStock", () => {
  let testStock: Stock;
  const MARKET_KEY = "__buyStockTest";

  beforeEach(() => {
    setupPlayer();
    Player.hasWseAccount = true;
    Player.hasTixApiAccess = true;
    Player.money = 1e9;

    testStock = makeStock("ECS", 100);
    registerStock(testStock, MARKET_KEY);

    (buyStockMock as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    unregisterStock(testStock, MARKET_KEY);
    jest.resetAllMocks();
  });

  test("calls buyStock with correct args and returns ok:true", async () => {
    const resp = await invokeAction(makeMsg("buyStock", { symbol: "ECS", shares: 10 }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(buyStockMock).toHaveBeenCalledWith(testStock, 10, null, { suppressDialog: true });
  });

  test("returns ok:false and does not call buyStock when player has no TIX API", async () => {
    Player.hasTixApiAccess = false;
    const resp = await invokeAction(makeMsg("buyStock", { symbol: "ECS", shares: 10 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
    expect(buyStockMock).not.toHaveBeenCalled();
  });

  test("returns ok:false for unknown stock symbol", async () => {
    const resp = await invokeAction(makeMsg("buyStock", { symbol: "XXXXNOTREAL", shares: 10 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
    expect(buyStockMock).not.toHaveBeenCalled();
  });

  test("validation: shares <= 0 returns ok:false", async () => {
    const resp = await invokeAction(makeMsg("buyStock", { symbol: "ECS", shares: 0 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
    expect(buyStockMock).not.toHaveBeenCalled();
  });

  test("returns ok:false when buyStock returns false (e.g. game-side refusal)", async () => {
    (buyStockMock as jest.Mock).mockReturnValue(false);
    const resp = await invokeAction(makeMsg("buyStock", { symbol: "ECS", shares: 10 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });
});

// ─── invokeAction — sellStock ─────────────────────────────────────────────────

describe("invokeAction — sellStock", () => {
  let testStock: Stock;
  const MARKET_KEY = "__sellStockTest";

  beforeEach(() => {
    setupPlayer();
    Player.hasWseAccount = true;
    Player.hasTixApiAccess = true;

    testStock = makeStock("ECS", 100);
    testStock.playerShares = 50;
    registerStock(testStock, MARKET_KEY);

    (sellStockMock as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    unregisterStock(testStock, MARKET_KEY);
    jest.resetAllMocks();
  });

  test("returns ok:true and calls sellStock when player owns shares", async () => {
    const resp = await invokeAction(makeMsg("sellStock", { symbol: "ECS", shares: 10 }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(sellStockMock).toHaveBeenCalledWith(testStock, 10, null, { suppressDialog: true });
  });

  test("returns ok:false and does not call sellStock when player owns no shares", async () => {
    testStock.playerShares = 0;
    const resp = await invokeAction(makeMsg("sellStock", { symbol: "ECS", shares: 10 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
    expect(sellStockMock).not.toHaveBeenCalled();
  });

  test("returns ok:false with 'Not enough shares' when trying to sell more than owned", async () => {
    testStock.playerShares = 5;
    const resp = await invokeAction(makeMsg("sellStock", { symbol: "ECS", shares: 10 }));
    const result = resp.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Not enough shares");
    expect(sellStockMock).not.toHaveBeenCalled();
  });
});

// ─── invokeAction — coverShort ────────────────────────────────────────────────

describe("invokeAction — coverShort", () => {
  let testStock: Stock;
  const MARKET_KEY = "__coverShortTest";

  beforeEach(() => {
    setupPlayer();
    Player.hasWseAccount = true;
    Player.hasTixApiAccess = true;

    testStock = makeStock("ECS", 100);
    testStock.playerShortShares = 20;
    testStock.playerAvgShortPx = 110;
    registerStock(testStock, MARKET_KEY);

    (sellShortMock as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    unregisterStock(testStock, MARKET_KEY);
    jest.resetAllMocks();
  });

  test("coverShort maps to sellShort and returns ok:true", async () => {
    const resp = await invokeAction(makeMsg("coverShort", { symbol: "ECS", shares: 5 }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
    expect(sellShortMock).toHaveBeenCalledWith(testStock, 5, null, { suppressDialog: true });
  });

  test("returns ok:false when player owns no short shares", async () => {
    testStock.playerShortShares = 0;
    const resp = await invokeAction(makeMsg("coverShort", { symbol: "ECS", shares: 5 }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
    expect(sellShortMock).not.toHaveBeenCalled();
  });

  test("returns ok:false with 'Not enough short shares' when trying to cover more than owned", async () => {
    testStock.playerShortShares = 3;
    const resp = await invokeAction(makeMsg("coverShort", { symbol: "ECS", shares: 10 }));
    const result = resp.result as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Not enough short shares");
    expect(sellShortMock).not.toHaveBeenCalled();
  });
});
