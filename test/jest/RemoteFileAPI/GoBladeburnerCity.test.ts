/**
 * Tests for GE-1: Go, Bladeburner, and City serializers + invokeAction handlers.
 *
 * TDD approach:
 *  - Go: serialize a constructed board, assert shape; goPlayMove valid + invalid.
 *  - City: serialize all six cities with locations and types.
 *  - Bladeburner: null branch; live Bladeburner construction (feasible in jest) for action list.
 *
 * Manual verification checklist (live-game only):
 *  - bladeburnerStartAction with a real contract/operation in-game changes active action in UI.
 *  - bladeburnerStopAction resets action in UI to "None".
 *  - goPass with an AI opponent results in an AI response move appearing on the board.
 */

import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { Go } from "../../../src/Go/Go";
import { GoColor, GoOpponent, CityName } from "../../../src/Enums";
import { boardStateFromSimpleBoard } from "../../../src/Go/boardAnalysis/boardAnalysis";
import { resetAI } from "../../../src/Go/boardAnalysis/goAI";
import {
  serializeGo,
  serializeBladeburner,
  serializeCity,
} from "../../../src/RemoteFileAPI/StateSerializers";
import { invokeAction } from "../../../src/RemoteFileAPI/GameActionHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { Bladeburner } from "../../../src/Bladeburner/Bladeburner";
import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";
import { CONSTANTS } from "../../../src/Constants";
import { Terminal } from "../../../src/Terminal";

initGameEnvironment();

function makeMsg(action: string, args: Record<string, unknown> = {}, id = 1): RFAMessage {
  return new RFAMessage({ method: "invokeAction", params: { action, args } as never, id });
}

/** Assert a value is JSON-pure (no Maps, class instances, undefined). */
function expectJsonPure(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

// ─── Go serializer ───────────────────────────────────────────────────────────

describe("serializeGo()", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
  });

  test("serializes a 5x5 board with correct shape fields", () => {
    // Black just played at (0,0): previousPlayer = black → currentTurn = white
    const simpleBoard = ["X....", ".....", ".....", ".....", "....."];
    Go.currentGame = boardStateFromSimpleBoard(simpleBoard, GoOpponent.Daedalus, GoColor.black);
    resetAI();

    const state = serializeGo();

    expect(state.boardSize).toBe(5);
    expect(state.board).toHaveLength(5);
    expect(state.playerColor).toBe("black");
    expect(state.opponent).toBe(GoOpponent.Daedalus);
    expect(state.currentTurn).toBe("white"); // black just moved
    expect(state.gameOver).toBe(false);
    expect(typeof state.komi).toBe("number");
    expect(typeof state.captures.black).toBe("number");
    expect(typeof state.captures.white).toBe("number");
    expectJsonPure(state);
  });

  test("currentTurn is 'black' when previousPlayer is white (white just moved)", () => {
    // White just played: previousPlayer = white → currentTurn = black (player's turn)
    const simpleBoard = [".....", ".....", ".....", ".....", "....."];
    Go.currentGame = boardStateFromSimpleBoard(simpleBoard, GoOpponent.none, GoColor.white);
    resetAI();

    const state = serializeGo();
    expect(state.currentTurn).toBe("black");
    expect(state.gameOver).toBe(false);
  });

  test("gameOver = true and currentTurn = 'none' when previousPlayer is null", () => {
    const simpleBoard = [".....", ".....", ".....", ".....", "....."];
    Go.currentGame = boardStateFromSimpleBoard(simpleBoard, GoOpponent.none, GoColor.white);
    // Force game over
    Go.currentGame.previousPlayer = null;

    const state = serializeGo();
    expect(state.gameOver).toBe(true);
    expect(state.currentTurn).toBe("none");
  });

  test("board strings use X O . # characters", () => {
    // Use a board where pieces have liberties so updateCaptures does not remove them.
    // X at column 2, row 2 (center of 5x5) — has 4 empty neighbors.
    // O at column 2, row 0 — has 2 empty neighbors.
    // # at column 4, row 4 (corner) — offline, isolated.
    const simpleBoard = [".....", ".....", "XO...", ".....", "....#"];
    Go.currentGame = boardStateFromSimpleBoard(simpleBoard, GoOpponent.none, GoColor.white);
    resetAI();

    const state = serializeGo();
    // board[x][y]: column x, row y
    expect(state.board[2][0]).toBe("X"); // black at col 2, row 0
    expect(state.board[2][1]).toBe("O"); // white at col 2, row 1
    expect(state.board[4][4]).toBe("#"); // offline at col 4, row 4
    expect(state.board[0][0]).toBe("."); // empty at col 0, row 0
  });

  test("payload is JSON-pure (no class instances, Maps, or ReactNodes)", () => {
    Go.currentGame = boardStateFromSimpleBoard([".....", ".....", ".....", ".....", "....."], GoOpponent.none, GoColor.white);
    expectJsonPure(serializeGo());
  });
});

// ─── goPlayMove action ────────────────────────────────────────────────────────

describe("invokeAction → goPlayMove", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
    // White just moved → it is black's turn; use GoOpponent.none to avoid AI response
    Go.currentGame = boardStateFromSimpleBoard(
      [".....", ".....", ".....", ".....", "....."],
      GoOpponent.none,
      GoColor.white, // lastPlayer = white → currentTurn = black
    );
    resetAI();
  });

  test("valid move returns ok:true", async () => {
    const result = await invokeAction(makeMsg("goPlayMove", { x: 2, y: 2 }));
    const r = result.result as { ok: boolean; message?: string };
    expect(r.ok).toBe(true);
  });

  test("occupied cell returns ok:false", async () => {
    // Place a black stone at (0,0) first
    Go.currentGame = boardStateFromSimpleBoard(
      ["X....", ".....", ".....", ".....", "....."],
      GoOpponent.none,
      GoColor.white, // still black's turn
    );
    resetAI();

    const result = await invokeAction(makeMsg("goPlayMove", { x: 0, y: 0 }));
    const r = result.result as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
    expect(r.message).toBeDefined();
  });

  test("move when it's not black's turn returns ok:false", async () => {
    // Black just moved: previousPlayer = black → it is white's turn
    Go.currentGame = boardStateFromSimpleBoard(
      [".....", ".....", ".....", ".....", "....."],
      GoOpponent.none,
      GoColor.black, // lastPlayer = black → currentTurn = white, not black's turn
    );
    resetAI();

    const result = await invokeAction(makeMsg("goPlayMove", { x: 1, y: 1 }));
    const r = result.result as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not your turn/i);
  });

  test("move when game is over returns ok:false", async () => {
    Go.currentGame.previousPlayer = null; // force game over
    const result = await invokeAction(makeMsg("goPlayMove", { x: 0, y: 0 }));
    const r = result.result as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/game is over/i);
  });

  test("out-of-bounds move returns ok:false", async () => {
    const result = await invokeAction(makeMsg("goPlayMove", { x: 99, y: 0 }));
    const r = result.result as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
  });

  test("missing x param returns error response (not ok:false)", async () => {
    const result = await invokeAction(makeMsg("goPlayMove", { y: 0 }));
    // validate() fails → ok:false (not a protocol-level error)
    const r = result.result as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
  });
});

// ─── goPass action ────────────────────────────────────────────────────────────

describe("invokeAction → goPass", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
    Go.currentGame = boardStateFromSimpleBoard(
      [".....", ".....", ".....", ".....", "....."],
      GoOpponent.none,
      GoColor.white, // black's turn
    );
    resetAI();
  });

  test("pass on black's turn returns ok:true", async () => {
    const result = await invokeAction(makeMsg("goPass", {}));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(true);
  });

  test("pass when not black's turn returns ok:false", async () => {
    Go.currentGame.previousPlayer = GoColor.black; // it's white's turn now
    const result = await invokeAction(makeMsg("goPass", {}));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("pass when game is over returns ok:false", async () => {
    Go.currentGame.previousPlayer = null;
    const result = await invokeAction(makeMsg("goPass", {}));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });
});

// ─── City serializer ─────────────────────────────────────────────────────────

describe("serializeCity()", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
  });

  test("returns all 6 cities", () => {
    const state = serializeCity();
    expect(state.cities).toHaveLength(Object.values(CityName).length);
    const names = state.cities.map((c) => c.name);
    for (const cityName of Object.values(CityName)) {
      expect(names).toContain(cityName);
    }
  });

  test("exactly one city is marked current (matching Player.city)", () => {
    const state = serializeCity();
    const currentCities = state.cities.filter((c) => c.current);
    expect(currentCities).toHaveLength(1);
    expect(currentCities[0].name).toBe(Player.city);
  });

  test("each city has at least one location", () => {
    const state = serializeCity();
    for (const city of state.cities) {
      expect(city.locations.length).toBeGreaterThan(0);
    }
  });

  test("each location has a name and a non-empty types array", () => {
    const state = serializeCity();
    for (const city of state.cities) {
      for (const loc of city.locations) {
        expect(typeof loc.name).toBe("string");
        expect(loc.name.length).toBeGreaterThan(0);
        expect(Array.isArray(loc.types)).toBe(true);
        expect(loc.types.length).toBeGreaterThan(0);
      }
    }
  });

  test("travelCost matches CONSTANTS.TravelCost", () => {
    const state = serializeCity();
    expect(state.travelCost).toBe(CONSTANTS.TravelCost);
  });

  test("payload is JSON-pure", () => {
    expectJsonPure(serializeCity());
  });
});

// ─── Bladeburner serializer ───────────────────────────────────────────────────

describe("serializeBladeburner()", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    // Ensure no bladeburner by default
    Player.bladeburner = null;
  });

  test("returns null when Player.bladeburner is null", () => {
    expect(serializeBladeburner()).toBeNull();
  });

  test("returns a BladeburnerState object when bladeburner exists", () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const state = serializeBladeburner();
    expect(state).not.toBeNull();
    expect(typeof state!.rank).toBe("number");
    expect(typeof state!.stamina.current).toBe("number");
    expect(typeof state!.stamina.max).toBe("number");
    expect(typeof state!.cityChaos).toBe("number");
    expect(typeof state!.skillPoints).toBe("number");
    expect(Array.isArray(state!.actions)).toBe(true);
  });

  test("currentAction is null on a fresh bladeburner (not yet started)", () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const state = serializeBladeburner();
    expect(state!.currentAction).toBeNull();
  });

  test("currentAction.type emits the protocol string ('contract'), not the internal enum value ('Contracts')", async () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    // Start a contract action so bb.action is set
    Terminal.outputHistory = [];
    await invokeAction(makeMsg("bladeburnerStartAction", { type: "contract", name: "Tracking" }));
    expect(bb.action).not.toBeNull();

    const state = serializeBladeburner();
    expect(state!.currentAction).not.toBeNull();
    // Must be the protocol string, not the enum value ("Contracts")
    expect(state!.currentAction!.type).toBe("contract");
    expect(state!.currentAction!.name).toBe("Tracking");
  });

  test("actions list includes contracts, operations, and blackops", () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const state = serializeBladeburner();
    const types = state!.actions.map((a) => a.type);
    expect(types).toContain("contract");
    expect(types).toContain("operation");
    expect(types).toContain("blackop");
  });

  test("each action has successChance as a [number, number] tuple", () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const state = serializeBladeburner();
    for (const action of state!.actions) {
      expect(Array.isArray(action.successChance)).toBe(true);
      expect(action.successChance).toHaveLength(2);
      expect(typeof action.successChance[0]).toBe("number");
      expect(typeof action.successChance[1]).toBe("number");
    }
  });

  test("contracts/operations have countRemaining; blackops have null", () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const state = serializeBladeburner();
    const contracts = state!.actions.filter((a) => a.type === "contract");
    const blackops = state!.actions.filter((a) => a.type === "blackop");

    for (const c of contracts) {
      expect(typeof c.countRemaining).toBe("number");
    }
    for (const b of blackops) {
      expect(b.countRemaining).toBeNull();
    }
  });

  test("blackops have a reqRank; contracts/operations do not", () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const state = serializeBladeburner();
    const contracts = state!.actions.filter((a) => a.type === "contract");
    const blackops = state!.actions.filter((a) => a.type === "blackop");

    for (const c of contracts) {
      expect(c.reqRank).toBeNull();
    }
    for (const b of blackops) {
      expect(typeof b.reqRank).toBe("number");
    }
  });

  test("payload is JSON-pure", () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;
    expectJsonPure(serializeBladeburner());
  });
});

// ─── Bladeburner actions ──────────────────────────────────────────────────────

describe("invokeAction → bladeburnerStartAction / bladeburnerStopAction", () => {
  beforeEach(() => {
    setupBasicTestingEnvironment();
    Terminal.outputHistory = [];
    Player.bladeburner = null;
  });

  test("bladeburnerStartAction returns ok:false when bladeburner is null", async () => {
    const result = await invokeAction(makeMsg("bladeburnerStartAction", { type: "contract", name: "Tracking" }));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("bladeburnerStopAction returns ok:false when bladeburner is null", async () => {
    const result = await invokeAction(makeMsg("bladeburnerStopAction", {}));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("bladeburnerStartAction starts a valid contract", async () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    // "Tracking" is the first contract and always has count > 0 on init
    const result = await invokeAction(makeMsg("bladeburnerStartAction", { type: "contract", name: "Tracking" }));
    const r = result.result as { ok: boolean; message?: string };
    expect(r.ok).toBe(true);
    expect(bb.action).not.toBeNull();
    expect(bb.action!.name).toBe("Tracking");
  });

  test("bladeburnerStopAction resets the current action", async () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    // Start an action first
    await invokeAction(makeMsg("bladeburnerStartAction", { type: "contract", name: "Tracking" }));
    expect(bb.action).not.toBeNull();

    // Now stop it
    const result = await invokeAction(makeMsg("bladeburnerStopAction", {}));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(bb.action).toBeNull();
  });

  test("bladeburnerStartAction with invalid type returns ok:false", async () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const result = await invokeAction(makeMsg("bladeburnerStartAction", { type: "nope", name: "Tracking" }));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("bladeburnerStartAction with unknown action name returns ok:false", async () => {
    const bb = new Bladeburner();
    bb.init();
    Player.bladeburner = bb;

    const result = await invokeAction(makeMsg("bladeburnerStartAction", { type: "contract", name: "NotARealContract" }));
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });

  test("bladeburnerStartAction with blackop unavailable (rank too low) returns ok:false", async () => {
    const bb = new Bladeburner();
    bb.init();
    bb.rank = 0; // Fresh bladeburner has rank 0 — blackops require rank > 0
    Player.bladeburner = bb;

    const result = await invokeAction(
      makeMsg("bladeburnerStartAction", { type: "blackop", name: "Operation Typhoon" }),
    );
    const r = result.result as { ok: boolean };
    expect(r.ok).toBe(false);
  });
});
