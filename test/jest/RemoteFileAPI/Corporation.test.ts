/**
 * Tests for GD-3: corporation serializer + topic + minimal actions.
 *
 * TDD — written before implementation.
 *
 * Strategy:
 *  - serializeCorporation: test null branch (Player.corporation=null).
 *  - serializeDivision: test pure mapping against a structural stub — products
 *    (finished/unfinished rating), warehouses, offices, cities set. This covers
 *    the serializer without requiring a live Corporation in jest.
 *  - serializeCorporation with a stub corp: verifies the top-level shape.
 *  - Action success (corpHireAdVert) → ok:true.
 *  - Action throw (corpMakeProduct) → ok:false with game error message.
 *
 * NOTE — live-corp manual verification:
 *   Constructing a live Corporation in jest pulls in dialogBoxCreate (React/MUI)
 *   and the full Industry research-tree bootstrap. The pure-mapper and stub-based
 *   tests below give full coverage of the serialisation and action-dispatch paths.
 *   A live corporation (real data, subscription push) must be verified manually:
 *     1. Launch game, create a corp and at least one division with a warehouse/office.
 *     2. Connect the VS Code extension, subscribe to the "corporation" topic.
 *     3. Confirm the event payload matches docs/protocol.md CorpState.
 *     4. Invoke each of the five corp actions via invokeAction and confirm the
 *        terminal echoes "[vscode] …" and the state updates correctly.
 */

// ─── Mock corp Actions BEFORE any import ─────────────────────────────────────
jest.mock("../../../src/Corporation/Actions", () => ({
  purchaseWarehouse: jest.fn(),
  hireAdVert: jest.fn(),
  buyTea: jest.fn().mockReturnValue(true),
  research: jest.fn(),
  makeProduct: jest.fn(),
}));

import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { serializeCorporation, serializeDivision } from "../../../src/RemoteFileAPI/StateSerializers";
import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Terminal } from "../../../src/Terminal";
import type { Division } from "../../../src/Corporation/Division";
import { makeProduct as makeProductMock } from "../../../src/Corporation/Actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupPlayer(): void {
  setPlayer(new PlayerObject());
  Terminal.outputHistory = [];
}

function makeMsg(action: string, args: Record<string, unknown> = {}, id = 1): RFAMessage {
  return new RFAMessage({ method: "invokeAction", params: { action, args } as never, id });
}

/**
 * Inject a minimal fake Corporation onto Player so that validate() guards pass
 * without constructing a live Corporation (which pulls in React/MUI in jest).
 * The fake corp exposes only the fields the action handlers actually access.
 */
function setupFakeCorp(divisionName: string, divisionOverrides: Record<string, unknown> = {}): void {
  const fakeDiv = { name: divisionName, ...divisionOverrides };
  const divMap = new Map([[divisionName, fakeDiv]]);
  (Player as unknown as { corporation: unknown }).corporation = {
    name: "FakeCorp",
    funds: 1e18,
    revenue: 0,
    expenses: 0,
    public: false,
    sharePrice: 0,
    divisions: {
      get: (n: string) => divMap.get(n),
      has: (n: string) => divMap.has(n),
      values: () => divMap.values(),
      set: (n: string, v: unknown) => divMap.set(n, v as typeof fakeDiv),
    },
    loseFunds: () => {},
    numberOfOfficesAndWarehouses: 0,
  };
}

// ─── serializeCorporation — null branch ──────────────────────────────────────

describe("serializeCorporation — null branch", () => {
  beforeEach(() => {
    setupPlayer();
    // PlayerObject initialises Player.corporation = null
  });

  test("returns null when Player has no corporation", () => {
    expect(serializeCorporation()).toBeNull();
  });
});

// ─── serializeDivision — structural stub ─────────────────────────────────────

/**
 * Build a minimal structural stub that satisfies the fields serializeDivision
 * actually accesses at runtime, then cast to Division. This avoids importing
 * the real Division constructor (which drags in React dependencies).
 */
function makeStubDivision(overrides: Record<string, unknown> = {}): Division {
  return {
    name: "TestDiv",
    industry: "Agriculture",
    products: new Map([
      [
        "DoneProduct",
        { name: "DoneProduct", developmentProgress: 100, finished: true, rating: 55 },
      ],
      [
        "WipProduct",
        { name: "WipProduct", developmentProgress: 42, finished: false, rating: 0 },
      ],
    ]),
    warehouses: {
      "Sector-12": { sizeUsed: 200, size: 1000 },
      "Aevum": { sizeUsed: 50, size: 500 },
    },
    offices: {
      "Sector-12": { numEmployees: 10, size: 20 },
    },
    ...overrides,
  } as unknown as Division;
}

describe("serializeDivision — structural stub", () => {
  test("maps name and industry", () => {
    const dto = serializeDivision(makeStubDivision());
    expect(dto.name).toBe("TestDiv");
    expect(dto.industry).toBe("Agriculture");
  });

  test("finished product has rating number, unfinished product has rating null", () => {
    const dto = serializeDivision(makeStubDivision());
    const done = dto.products.find((p) => p.name === "DoneProduct");
    const wip = dto.products.find((p) => p.name === "WipProduct");
    expect(done).toBeDefined();
    expect(done?.rating).toBe(55);
    expect(wip).toBeDefined();
    expect(wip?.rating).toBeNull();
  });

  test("developmentProgress is serialized on products", () => {
    const dto = serializeDivision(makeStubDivision());
    const wip = dto.products.find((p) => p.name === "WipProduct");
    expect(wip?.developmentProgress).toBe(42);
  });

  test("warehouses list includes all non-null warehouses", () => {
    const dto = serializeDivision(makeStubDivision());
    expect(dto.warehouses).toHaveLength(2);
    const s12 = dto.warehouses.find((w) => w.city === "Sector-12");
    expect(s12).toEqual({ city: "Sector-12", used: 200, total: 1000 });
    const aevum = dto.warehouses.find((w) => w.city === "Aevum");
    expect(aevum).toEqual({ city: "Aevum", used: 50, total: 500 });
  });

  test("offices list includes all non-null offices", () => {
    const dto = serializeDivision(makeStubDivision());
    expect(dto.offices).toHaveLength(1);
    expect(dto.offices[0]).toEqual({ city: "Sector-12", employees: 10, maxEmployees: 20 });
  });

  test("cities is the union of warehouse and office cities", () => {
    const dto = serializeDivision(makeStubDivision());
    // Warehouses: Sector-12, Aevum. Offices: Sector-12. Union = Sector-12, Aevum.
    expect(dto.cities.sort()).toEqual(["Aevum", "Sector-12"].sort());
  });

  test("null entries in warehouses/offices are skipped", () => {
    const divWithNulls = makeStubDivision({
      warehouses: { "Sector-12": { sizeUsed: 10, size: 100 }, "Volhaven": null },
      offices: { "Sector-12": { numEmployees: 5, size: 10 }, "Chongqing": null },
    });
    const dto = serializeDivision(divWithNulls);
    expect(dto.warehouses.every((w) => w !== null)).toBe(true);
    expect(dto.warehouses).toHaveLength(1);
    expect(dto.offices).toHaveLength(1);
  });

  test("result is JSON-serializable", () => {
    const dto = serializeDivision(makeStubDivision());
    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
  });

  test("empty division (no products, no warehouses, no offices) is safe", () => {
    const empty = makeStubDivision({ products: new Map(), warehouses: {}, offices: {} });
    const dto = serializeDivision(empty);
    expect(dto.products).toEqual([]);
    expect(dto.warehouses).toEqual([]);
    expect(dto.offices).toEqual([]);
    expect(dto.cities).toEqual([]);
  });
});

// ─── serializeCorporation — with stub corp ────────────────────────────────────

describe("serializeCorporation — stub corp", () => {
  beforeEach(() => {
    setupPlayer();
    const stubDiv = makeStubDivision({ name: "Agri" });
    const divMap = new Map([["Agri", stubDiv]]);
    (Player as unknown as { corporation: unknown }).corporation = {
      name: "TestCorp",
      funds: 1e12,
      revenue: 5e9,
      expenses: 1e9,
      public: false,
      sharePrice: 0,
      divisions: {
        get: (n: string) => divMap.get(n),
        has: (n: string) => divMap.has(n),
        values: () => divMap.values(),
      },
    };
  });

  test("returns a CorpState with correct top-level fields", () => {
    const state = serializeCorporation();
    expect(state).not.toBeNull();
    expect(state?.name).toBe("TestCorp");
    expect(state?.funds).toBe(1e12);
    expect(state?.revenue).toBe(5e9);
    expect(state?.expenses).toBe(1e9);
    expect(state?.public).toBe(false);
    expect(typeof state?.sharePrice).toBe("number");
  });

  test("divisions array contains one entry for the stub division", () => {
    const state = serializeCorporation();
    expect(state?.divisions).toHaveLength(1);
    expect(state?.divisions[0].name).toBe("Agri");
  });

  test("researchPoints record contains the division name as key", () => {
    const state = serializeCorporation();
    expect(Object.keys(state?.researchPoints ?? {})).toContain("Agri");
  });

  test("result is JSON-serializable", () => {
    const state = serializeCorporation();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

// ─── invokeAction — corpHireAdVert (success → ok:true) ───────────────────────

describe("invokeAction — corpHireAdVert", () => {
  beforeEach(() => {
    setupPlayer();
    setupFakeCorp("Agri");
  });

  test("returns {ok:true} when corp and division exist", async () => {
    const resp = await invokeAction(makeMsg("corpHireAdVert", { division: "Agri" }));
    expect((resp.result as { ok: boolean }).ok).toBe(true);
  });

  test("returns {ok:false} when division does not exist", async () => {
    const resp = await invokeAction(makeMsg("corpHireAdVert", { division: "NonExistent" }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("returns {ok:false} when Player has no corporation", async () => {
    (Player as unknown as { corporation: null }).corporation = null;
    const resp = await invokeAction(makeMsg("corpHireAdVert", { division: "Agri" }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });

  test("echoes [vscode] to the terminal on success", async () => {
    await invokeAction(makeMsg("corpHireAdVert", { division: "Agri" }));
    const echoed = Terminal.outputHistory.some(
      (e) => "text" in e && (e as { text: string }).text.includes("[vscode]"),
    );
    expect(echoed).toBe(true);
  });
});

// ─── invokeAction — corpMakeProduct (throw → ok:false) ───────────────────────

describe("invokeAction — corpMakeProduct (Actions.ts throws)", () => {
  beforeEach(() => {
    setupPlayer();
    setupFakeCorp("Agri");
    (makeProductMock as jest.Mock).mockImplementation(() => {
      throw new Error("You cannot create products for this industry!");
    });
  });

  test("returns {ok:false} with the game error message when action throws", async () => {
    const resp = await invokeAction(
      makeMsg("corpMakeProduct", {
        division: "Agri",
        city: "Sector-12",
        productName: "TestProduct",
        designInvest: 0,
        marketingInvest: 0,
      }),
    );
    const result = resp.result as { ok: boolean; message?: string };
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/products/i);
  });

  test("returns {ok:false} when division is missing from args", async () => {
    const resp = await invokeAction(makeMsg("corpMakeProduct", { city: "Sector-12", productName: "X" }));
    expect((resp.result as { ok: boolean }).ok).toBe(false);
  });
});
