import { otlpUrl, buildLogProcessors } from "../../../src/Telemetry/TelemetrySinks";
import type { TelemetryConfig } from "../../../src/Telemetry/TelemetryConfig";
import { OtelLogLevel } from "../../../src/Settings/SettingEnums";

const baseConfig: TelemetryConfig = {
  enabled: true,
  logLevel: OtelLogLevel.INFO,
  sinks: { gameConsole: false, stdio: false, otlp: false },
  otlpEndpoint: "http://localhost:4318",
  metricsEnabled: true,
  tracesEnabled: true,
  traceSampleRatio: 1,
  exportIntervalMs: 10000,
  environment: "browser",
  serviceVersion: "test",
  bitNode: 1,
};

describe("otlpUrl", () => {
  it("appends the signal path and handles trailing slashes", () => {
    expect(otlpUrl("http://localhost:4318", "logs")).toBe("http://localhost:4318/v1/logs");
    expect(otlpUrl("http://localhost:4318/", "metrics")).toBe("http://localhost:4318/v1/metrics");
    expect(otlpUrl("http://host//", "traces")).toBe("http://host/v1/traces");
  });
});

describe("buildLogProcessors", () => {
  it("returns no processors when all sinks are off", () => {
    expect(buildLogProcessors(baseConfig)).toHaveLength(0);
  });
  it("returns one processor per enabled sink", () => {
    const cfg = { ...baseConfig, sinks: { gameConsole: true, stdio: true, otlp: true } };
    expect(buildLogProcessors(cfg)).toHaveLength(3);
  });
  it("returns only the stdio processor when only stdio is on", () => {
    const cfg = { ...baseConfig, sinks: { gameConsole: false, stdio: true, otlp: false } };
    expect(buildLogProcessors(cfg)).toHaveLength(1);
  });
});
