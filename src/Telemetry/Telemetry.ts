/**
 * Public facade and lifecycle for OpenTelemetry. This is the ONLY place (along with the
 * files it imports) that touches @opentelemetry/*. Everything else in the game calls these
 * functions. The SDK is lazy-loaded on first enable so disabled players pay nothing.
 *
 * Providers are held by reference here (no global registration) so reconfigure is clean.
 */
import type { TelemetryConfig } from "./TelemetryConfig";
import { hasAnySink, readTelemetryConfig } from "./TelemetryConfig";

/** Whether telemetry is currently wired up and emitting. */
let active = false;
/** The config the current providers were built from. */
let activeConfig: TelemetryConfig | null = null;

/** True if telemetry is currently active (used by the logger/metrics/tracer fast-path guards). */
export function isTelemetryActive(): boolean {
  return active;
}

/** The config the live providers were built from, or null when inactive. */
export function getActiveConfig(): TelemetryConfig | null {
  return activeConfig;
}

/** Called once on game load. Wires up telemetry if it is enabled. */
export function initTelemetry(): void {
  reconfigureTelemetry();
}

/**
 * Rebuilds the telemetry pipeline from the current settings. Safe to call any time settings
 * change. Tears everything down when telemetry is disabled or no sink is selected.
 */
export function reconfigureTelemetry(): void {
  const config = readTelemetryConfig();
  if (!config.enabled || !hasAnySink(config)) {
    // Teardown happens in later phases once providers exist; for now just mark inactive.
    active = false;
    activeConfig = null;
    return;
  }
  // Provider construction (lazy SDK import) is implemented in later phases.
  activeConfig = config;
  active = true;
}

/** Flushes and shuts down telemetry. Best-effort: browser unload may kill in-flight exports. */
export function shutdownTelemetry(): Promise<void> {
  // Provider flush/shutdown (which is genuinely async) is added in later phases.
  active = false;
  activeConfig = null;
  return Promise.resolve();
}
