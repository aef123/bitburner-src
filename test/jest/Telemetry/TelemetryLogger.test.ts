import { OtelLogLevel } from "../../../src/Settings/SettingEnums";
import {
  DEFAULT_RATE_LIMIT,
  EmittedLog,
  logEvent,
  resetRateLimiter,
  setLogEmitter,
  setMinLogLevel,
  setRateLimit,
} from "../../../src/Telemetry/TelemetryLogger";

describe("TelemetryLogger", () => {
  let emitted: EmittedLog[];

  beforeEach(() => {
    emitted = [];
    resetRateLimiter();
    setRateLimit(DEFAULT_RATE_LIMIT);
    setMinLogLevel(OtelLogLevel.INFO);
    setLogEmitter((log) => emitted.push(log));
  });

  it("no-ops when no emitter is installed", () => {
    setLogEmitter(null);
    logEvent(OtelLogLevel.ERROR, "should be dropped");
    expect(emitted).toHaveLength(0);
  });

  it("drops records below the configured level", () => {
    setMinLogLevel(OtelLogLevel.WARN);
    logEvent(OtelLogLevel.INFO, "info");
    logEvent(OtelLogLevel.DEBUG, "debug");
    expect(emitted).toHaveLength(0);
    logEvent(OtelLogLevel.WARN, "warn");
    logEvent(OtelLogLevel.ERROR, "error");
    expect(emitted).toHaveLength(2);
  });

  it("maps severity numbers and passes body + attributes", () => {
    logEvent(OtelLogLevel.ERROR, "boom", { a: 1, b: "x" });
    expect(emitted[0]).toMatchObject({
      severityNumber: 17,
      severityText: "ERROR",
      body: "boom",
      attributes: { a: 1, b: "x" },
    });
  });

  it("enforces the per-key rate cap and emits one throttled warning", () => {
    setRateLimit(3);
    for (let i = 0; i < 10; i++) logEvent(OtelLogLevel.INFO, `msg ${i}`, {}, "home/script.js");
    // 3 allowed + 1 throttle warning = 4
    expect(emitted).toHaveLength(4);
    expect(emitted[3].attributes["telemetry.dropped"]).toBe(true);
  });

  it("rate cap is per-key", () => {
    setRateLimit(1);
    logEvent(OtelLogLevel.INFO, "a", {}, "k1");
    logEvent(OtelLogLevel.INFO, "b", {}, "k2");
    expect(emitted).toHaveLength(2);
  });
});
