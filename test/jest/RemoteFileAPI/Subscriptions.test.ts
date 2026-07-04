jest.mock("../../../src/engine", () => {
  const { EventEmitter } = jest.requireActual("../../../src/utils/EventEmitter") as typeof import("../../../src/utils/EventEmitter");
  return { GameCycleEvents: new EventEmitter() };
});

import { GameCycleEvents } from "../../../src/engine";
import {
  subscribeTopic,
  unsubscribeTopic,
  clearAllSubscriptions,
  serializerRegistry,
} from "../../../src/RemoteFileAPI/Subscriptions";
import { RFARequestHandler } from "../../../src/RemoteFileAPI/MessageHandlers";
import { RFAMessage } from "../../../src/RemoteFileAPI/MessageDefinitions";
import { setPlayer } from "../../../src/Player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";

describe("Subscriptions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1000);
    clearAllSubscriptions();
    serializerRegistry.hud = () => null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("subscribe triggers an initial push immediately", () => {
    const send = jest.fn();
    serializerRegistry.hud = () => ({ money: 100 });
    subscribeTopic("hud", 1000, send);

    expect(send).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = send.mock.calls[0][0] as any;
    expect(msg.jsonrpc).toBe("2.0");
    expect(msg.method).toBe("event");
    expect(msg.params.topic).toBe("hud");
    expect(msg.params.seq).toBe(1);
  });

  test("same payload does not trigger a second push on game cycle", () => {
    const send = jest.fn();
    serializerRegistry.hud = () => ({ money: 100 });
    subscribeTopic("hud", 1000, send);
    expect(send).toHaveBeenCalledTimes(1);

    // Advance time past intervalMs and emit a game cycle
    jest.setSystemTime(2001);
    GameCycleEvents.emit();
    expect(send).toHaveBeenCalledTimes(1); // unchanged payload — no second push
  });

  test("changed payload triggers a push on game cycle", () => {
    const send = jest.fn();
    serializerRegistry.hud = () => ({ money: 100 });
    subscribeTopic("hud", 1000, send);
    expect(send).toHaveBeenCalledTimes(1);

    serializerRegistry.hud = () => ({ money: 200 });
    jest.setSystemTime(2001);
    GameCycleEvents.emit();
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("seq increments with each push", () => {
    const send = jest.fn();
    serializerRegistry.hud = () => ({ money: 100 });
    subscribeTopic("hud", 1000, send);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((send.mock.calls[0][0] as any).params.seq).toBe(1);

    serializerRegistry.hud = () => ({ money: 200 });
    jest.setSystemTime(2001);
    GameCycleEvents.emit();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((send.mock.calls[1][0] as any).params.seq).toBe(2);
  });

  test("unsubscribe stops pushes on subsequent game cycles", () => {
    const send = jest.fn();
    serializerRegistry.hud = () => ({ money: 100 });
    subscribeTopic("hud", 1000, send);
    unsubscribeTopic("hud");

    serializerRegistry.hud = () => ({ money: 200 });
    jest.setSystemTime(2001);
    GameCycleEvents.emit();
    expect(send).toHaveBeenCalledTimes(1); // only the initial push
  });

  test("clearAllSubscriptions stops all pushes and detaches game cycle listener", () => {
    const send = jest.fn();
    serializerRegistry.hud = () => ({ money: 100 });
    subscribeTopic("hud", 1000, send);
    clearAllSubscriptions();

    serializerRegistry.hud = () => ({ money: 200 });
    jest.setSystemTime(2001);
    GameCycleEvents.emit();
    expect(send).toHaveBeenCalledTimes(1); // only the initial push
    expect(GameCycleEvents.hasSubscribers()).toBe(false);
  });
});

describe("getGameInfo handler", () => {
  test("result has all required fields", () => {
    setPlayer(new PlayerObject());
    const msg = new RFAMessage({ id: 42 });
    const response = RFARequestHandler.getGameInfo(msg) as RFAMessage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = response.result as any;
    expect(typeof result.version).toBe("string");
    expect(typeof result.versionNumber).toBe("number");
    expect(typeof result.commitHash).toBe("string");
    expect(typeof result.identifier).toBe("string");
    expect(typeof result.bitNodeN).toBe("number");
    expect(result.protocolVersion).toBe(1);
  });
});
