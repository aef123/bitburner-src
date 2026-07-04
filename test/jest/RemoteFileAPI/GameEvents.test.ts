/**
 * Tests for the "events" topic (Task GB-1).
 *
 * TDD: verifies that subscribing to the events topic correctly wires up
 * FactionInvitationEvents, SaveEvents, and the GameCycle work-transition detector.
 */
jest.mock("../../../src/engine", () => {
  const { EventEmitter } = jest.requireActual(
    "../../../src/utils/EventEmitter",
  ) as typeof import("../../../src/utils/EventEmitter");
  return { GameCycleEvents: new EventEmitter() };
});

import { GameCycleEvents } from "../../../src/engine";
import { subscribeTopic, clearAllSubscriptions } from "../../../src/RemoteFileAPI/Subscriptions";
import { FactionInvitationEvents } from "../../../src/Faction/ui/FactionInvitationManager";
import { SaveEvents } from "../../../src/SaveObject";
import { Player, setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { WorkType } from "../../../src/Work/Work";
import type { PlayerBaseWork } from "../../../src/Work/Work";
import { FactionName } from "../../../src/Enums";
import { AddToAllServers, prestigeAllServers } from "../../../src/Server/AllServers";
import { Server } from "../../../src/Server/Server";
import type { IPAddress } from "../../../src/Types/strings";

function setupPlayer(): void {
  prestigeAllServers();
  setPlayer(new PlayerObject());
  const home = new Server({ hostname: "home", ip: "10.0.0.1" as IPAddress, maxRam: 64, adminRights: true });
  home.purchasedByPlayer = true;
  AddToAllServers(home);
  Player.currentServer = "home";
  Player.currentWork = null;
}

describe("events topic — factionInvite", () => {
  beforeEach(() => {
    setupPlayer();
    clearAllSubscriptions();
  });

  afterEach(() => {
    clearAllSubscriptions();
    Player.currentWork = null;
  });

  test("factionInvite event is pushed when FactionInvitationEvents fires a New event", () => {
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear(); // discard initial null push

    FactionInvitationEvents.emit({ type: "New", factionName: FactionName.CyberSec });

    expect(send).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = send.mock.calls[0][0] as any;
    expect(msg.method).toBe("event");
    expect(msg.params.topic).toBe("events");
    expect(msg.params.data.category).toBe("factionInvite");
    expect(msg.params.data.data.faction).toBe(FactionName.CyberSec);
  });

  test("ClearAll invitation event does NOT push an events notification", () => {
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear();

    FactionInvitationEvents.emit({ type: "ClearAll" });

    expect(send).not.toHaveBeenCalled();
  });

  test("seq is monotonically increasing across events pushes", () => {
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initialSeq: number = (send.mock.calls[0][0] as any).params.seq;
    send.mockClear();

    FactionInvitationEvents.emit({ type: "New", factionName: FactionName.CyberSec });
    SaveEvents.emit();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq1: number = (send.mock.calls[0][0] as any).params.seq;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq2: number = (send.mock.calls[1][0] as any).params.seq;
    expect(seq1).toBe(initialSeq + 1);
    expect(seq2).toBe(initialSeq + 2);
  });
});

describe("events topic — workComplete / programComplete", () => {
  beforeEach(() => {
    setupPlayer();
    clearAllSubscriptions();
  });

  afterEach(() => {
    clearAllSubscriptions();
    Player.currentWork = null;
  });

  test("workComplete fires exactly once on currentWork non-null → null transition", () => {
    // Set work BEFORE subscribing so lastWork is captured correctly at subscribe time.
    Player.currentWork = { type: WorkType.FACTION } as PlayerBaseWork;
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear();

    Player.currentWork = null;
    GameCycleEvents.emit();

    expect(send).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((send.mock.calls[0][0] as any).params.data.category).toBe("workComplete");
  });

  test("workComplete does NOT fire when transitioning from null to non-null work", () => {
    Player.currentWork = null;
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear();

    Player.currentWork = { type: WorkType.FACTION } as PlayerBaseWork;
    GameCycleEvents.emit();

    expect(send).not.toHaveBeenCalled();
  });

  test("workComplete does NOT fire when work remains the same across a game cycle", () => {
    const work = { type: WorkType.FACTION } as PlayerBaseWork;
    Player.currentWork = work;
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear();

    // Same work object — no transition
    GameCycleEvents.emit();

    expect(send).not.toHaveBeenCalled();
  });

  test("programComplete fires (not workComplete) when CreateProgramWork transitions to null", () => {
    Player.currentWork = { type: WorkType.CREATE_PROGRAM } as PlayerBaseWork;
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear();

    Player.currentWork = null;
    GameCycleEvents.emit();

    expect(send).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((send.mock.calls[0][0] as any).params.data.category).toBe("programComplete");
  });

  test("workComplete does NOT fire a second time on next game cycle after work already cleared", () => {
    Player.currentWork = { type: WorkType.FACTION } as PlayerBaseWork;
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear();

    Player.currentWork = null;
    GameCycleEvents.emit(); // fires workComplete (1st)
    GameCycleEvents.emit(); // null → null: no transition

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("events topic — save", () => {
  beforeEach(() => {
    setupPlayer();
    clearAllSubscriptions();
  });

  afterEach(() => {
    clearAllSubscriptions();
    Player.currentWork = null;
  });

  test("save event fires when SaveEvents emits", () => {
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    send.mockClear();

    SaveEvents.emit();

    expect(send).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((send.mock.calls[0][0] as any).params.data.category).toBe("save");
  });
});

describe("events topic — teardown", () => {
  beforeEach(() => {
    setupPlayer();
    clearAllSubscriptions();
  });

  afterEach(() => {
    clearAllSubscriptions();
    Player.currentWork = null;
  });

  test("no events are pushed after clearAllSubscriptions", () => {
    Player.currentWork = { type: WorkType.FACTION } as PlayerBaseWork;
    const send = jest.fn();
    subscribeTopic("events", undefined, send);
    clearAllSubscriptions();
    send.mockClear();

    // Emit all event sources — none should reach send.
    SaveEvents.emit();
    FactionInvitationEvents.emit({ type: "New", factionName: FactionName.CyberSec });
    Player.currentWork = null;
    GameCycleEvents.emit();

    expect(send).not.toHaveBeenCalled();
  });
});
