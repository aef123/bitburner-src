import { Player } from "@player";
import { Settings } from "../Settings/Settings";
import { OtelLogLevel } from "../Settings/SettingEnums";
import { CONSTANTS } from "../Constants";

/** Normalized, immutable snapshot of the telemetry-related settings used to build providers. */
export interface TelemetryConfig {
  enabled: boolean;
  logLevel: OtelLogLevel;
  sinks: {
    gameConsole: boolean;
    stdio: boolean;
    otlp: boolean;
  };
  otlpEndpoint: string;
  metricsEnabled: boolean;
  tracesEnabled: boolean;
  traceSampleRatio: number;
  exportIntervalMs: number;
  environment: "browser" | "electron";
  serviceVersion: string;
  bitNode: number;
}

/** True when running inside the Electron renderer (used only for the resource attribute). */
export function isElectron(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes(" electron/");
}

/** Reads the current telemetry configuration from Settings + game state. */
export function readTelemetryConfig(): TelemetryConfig {
  return {
    enabled: Settings.TelemetryEnabled,
    logLevel: Settings.TelemetryLogLevel,
    sinks: {
      gameConsole: Settings.TelemetrySinkGameConsole,
      stdio: Settings.TelemetrySinkStdio,
      otlp: Settings.TelemetrySinkOtlp,
    },
    otlpEndpoint: Settings.TelemetryOtlpEndpoint,
    metricsEnabled: Settings.TelemetryMetricsEnabled,
    tracesEnabled: Settings.TelemetryTracesEnabled,
    traceSampleRatio: Settings.TelemetryTraceSampleRatio,
    exportIntervalMs: Settings.TelemetryExportIntervalMs,
    environment: isElectron() ? "electron" : "browser",
    serviceVersion: CONSTANTS.VersionString,
    bitNode: Player.bitNodeN,
  };
}

/** True when at least one sink is selected (so there is somewhere for signals to go). */
export function hasAnySink(config: TelemetryConfig): boolean {
  return config.sinks.gameConsole || config.sinks.stdio || config.sinks.otlp;
}
