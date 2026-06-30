import { Settings } from "../../../src/Settings/Settings";
import { OtelLogLevel } from "../../../src/Settings/SettingEnums";
import { isValidOtlpEndpoint, loadSettings } from "../../../src/Settings/SettingsUtils";

describe("isValidOtlpEndpoint", () => {
  it("accepts http and https URLs", () => {
    expect(isValidOtlpEndpoint("http://localhost:4318").success).toBe(true);
    expect(isValidOtlpEndpoint("https://collector.example.com").success).toBe(true);
  });
  it("rejects empty, non-URL, and non-http schemes", () => {
    expect(isValidOtlpEndpoint("").success).toBe(false);
    expect(isValidOtlpEndpoint("not a url").success).toBe(false);
    expect(isValidOtlpEndpoint("ftp://localhost").success).toBe(false);
  });
});

describe("loadSettings telemetry sanitization", () => {
  it("coerces junk telemetry values back to safe defaults", () => {
    loadSettings(
      JSON.stringify({
        TelemetryEnabled: 0,
        TelemetrySinkStdio: "yes",
        TelemetryOtlpEndpoint: "not a url",
        TelemetryLogLevel: "BOGUS",
        TelemetryExportIntervalMs: 999999999,
        TelemetryTraceSampleRatio: 5,
      }),
    );
    expect(Settings.TelemetryEnabled).toBe(false); // Boolean(0)
    expect(Settings.TelemetrySinkStdio).toBe(true); // Boolean("yes")
    expect(Settings.TelemetryOtlpEndpoint).toBe("http://localhost:4318");
    expect(Settings.TelemetryLogLevel).toBe(OtelLogLevel.INFO);
    expect(Settings.TelemetryExportIntervalMs).toBe(600000); // clamped
    expect(Settings.TelemetryTraceSampleRatio).toBe(1); // clamped
  });

  it("preserves valid telemetry values", () => {
    loadSettings(
      JSON.stringify({
        TelemetryEnabled: true,
        TelemetryOtlpEndpoint: "https://collector.local:4318",
        TelemetryLogLevel: OtelLogLevel.WARN,
        TelemetryExportIntervalMs: 5000,
        TelemetryTraceSampleRatio: 0.25,
      }),
    );
    expect(Settings.TelemetryEnabled).toBe(true);
    expect(Settings.TelemetryOtlpEndpoint).toBe("https://collector.local:4318");
    expect(Settings.TelemetryLogLevel).toBe(OtelLogLevel.WARN);
    expect(Settings.TelemetryExportIntervalMs).toBe(5000);
    expect(Settings.TelemetryTraceSampleRatio).toBe(0.25);
  });
});
