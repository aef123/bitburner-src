import { Player, setPlayer } from "@player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { Settings } from "../../../src/Settings/Settings";
import { OtelLogLevel } from "../../../src/Settings/SettingEnums";
import { hasAnySink, readTelemetryConfig } from "../../../src/Telemetry/TelemetryConfig";

beforeAll(() => {
  setPlayer(new PlayerObject());
});

describe("readTelemetryConfig", () => {
  it("maps Settings into a normalized config", () => {
    Settings.TelemetryEnabled = true;
    Settings.TelemetryLogLevel = OtelLogLevel.WARN;
    Settings.TelemetrySinkGameConsole = true;
    Settings.TelemetrySinkStdio = false;
    Settings.TelemetrySinkOtlp = true;
    Settings.TelemetryOtlpEndpoint = "http://localhost:4318";
    Settings.TelemetryTraceSampleRatio = 0.5;

    const cfg = readTelemetryConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.logLevel).toBe(OtelLogLevel.WARN);
    expect(cfg.sinks).toEqual({ gameConsole: true, stdio: false, otlp: true });
    expect(cfg.otlpEndpoint).toBe("http://localhost:4318");
    expect(cfg.traceSampleRatio).toBe(0.5);
    expect(["browser", "electron"]).toContain(cfg.environment);
    expect(typeof cfg.serviceVersion).toBe("string");
    expect(cfg.bitNode).toBe(Player.bitNodeN);
  });
});

describe("hasAnySink", () => {
  it("is false when all sinks are off", () => {
    const cfg = readTelemetryConfig();
    expect(hasAnySink({ ...cfg, sinks: { gameConsole: false, stdio: false, otlp: false } })).toBe(false);
  });
  it("is true when any sink is on", () => {
    const cfg = readTelemetryConfig();
    expect(hasAnySink({ ...cfg, sinks: { gameConsole: false, stdio: true, otlp: false } })).toBe(true);
  });
});
