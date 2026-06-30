/**
 * Public facade and lifecycle for OpenTelemetry. This is the ONLY place (along with the
 * files it dynamically imports) that touches @opentelemetry/*. Everything else in the game
 * calls these functions. The SDK is lazy-loaded on first enable so disabled players pay
 * nothing (it lands in its own webpack chunk).
 *
 * Providers are held by reference here (no global registration) so reconfigure is clean.
 */
import type { SeverityNumber } from "@opentelemetry/api-logs";
import type { LoggerProvider } from "@opentelemetry/sdk-logs";
import type { TelemetryConfig } from "./TelemetryConfig";
import { hasAnySink, readTelemetryConfig } from "./TelemetryConfig";
import { EmittedLog, setLogEmitter, setMinLogLevel } from "./TelemetryLogger";

let active = false;
let activeConfig: TelemetryConfig | null = null;
let loggerProvider: LoggerProvider | null = null;
/** Bumped on every reconfigure so a slow async build can detect it has been superseded. */
let generation = 0;

/** True if telemetry is currently active (used by fast-path guards). */
export function isTelemetryActive(): boolean {
  return active;
}

/** The config the live providers were built from, or null when inactive. */
export function getActiveConfig(): TelemetryConfig | null {
  return activeConfig;
}

/** Builds the OTel providers, lazily importing the SDK. */
async function buildProviders(config: TelemetryConfig): Promise<{ provider: LoggerProvider }> {
  const [sdkLogs, sinks, resources] = await Promise.all([
    import("@opentelemetry/sdk-logs"),
    import("./TelemetrySinks"),
    import("@opentelemetry/resources"),
  ]);
  const resource = resources.resourceFromAttributes({
    "service.name": "bitburner",
    "service.version": config.serviceVersion,
    "bitburner.bitnode": config.bitNode,
    "deployment.environment": config.environment,
  });
  const provider = new sdkLogs.LoggerProvider({ resource, processors: sinks.buildLogProcessors(config) });
  return { provider };
}

/** Tears down any live providers and detaches the logger emitter. */
async function teardown(): Promise<void> {
  setLogEmitter(null);
  const provider = loggerProvider;
  loggerProvider = null;
  if (provider) {
    await provider.shutdown().catch((error: unknown) => console.error("Telemetry shutdown error", error));
  }
}

/** Called once on game load. Wires up telemetry if it is enabled. */
export function initTelemetry(): void {
  void reconfigureTelemetry();
}

/**
 * Rebuilds the telemetry pipeline from the current settings. Safe to call any time settings
 * change. Tears everything down when telemetry is disabled or no sink is selected.
 */
export async function reconfigureTelemetry(): Promise<void> {
  const myGeneration = ++generation;
  const config = readTelemetryConfig();
  await teardown();
  if (myGeneration !== generation) return; // superseded while tearing down

  if (!config.enabled || !hasAnySink(config)) {
    active = false;
    activeConfig = null;
    return;
  }

  let built: { provider: LoggerProvider };
  try {
    built = await buildProviders(config);
  } catch (error: unknown) {
    console.error("Failed to initialize telemetry", error);
    active = false;
    activeConfig = null;
    return;
  }
  if (myGeneration !== generation) {
    // A newer reconfigure started while we were building; discard this one.
    await built.provider.shutdown().catch(() => undefined);
    return;
  }

  loggerProvider = built.provider;
  setMinLogLevel(config.logLevel);
  const logger = loggerProvider.getLogger("bitburner");
  setLogEmitter((log: EmittedLog) =>
    logger.emit({
      severityNumber: log.severityNumber as SeverityNumber,
      severityText: log.severityText,
      body: log.body,
      attributes: log.attributes,
    }),
  );
  activeConfig = config;
  active = true;
}

/** Flushes and shuts down telemetry. Best-effort: browser unload may kill in-flight exports. */
export async function shutdownTelemetry(): Promise<void> {
  generation++;
  await teardown();
  active = false;
  activeConfig = null;
}
