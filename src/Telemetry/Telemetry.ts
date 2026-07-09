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
import type { MeterProvider } from "@opentelemetry/sdk-metrics";
import type { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import type { TelemetryConfig } from "./TelemetryConfig";
import { hasAnySink, readTelemetryConfig } from "./TelemetryConfig";
import { EmittedLog, setLogEmitter, setMinLogLevel } from "./TelemetryLogger";
import { endAllOpenSpans, setScriptTracerImpl } from "./ScriptTracer";
import { setUserMetricsImpl } from "./UserMetrics";
import { setUserSpansImpl } from "./UserSpans";

/** Minimal shape we need to flush user spans on teardown, without importing the OTel class. */
interface OpenSpanCloser {
  endAllOpenSpans(): void;
}

let active = false;
let activeConfig: TelemetryConfig | null = null;
let loggerProvider: LoggerProvider | null = null;
let meterProvider: MeterProvider | null = null;
let tracerProvider: BasicTracerProvider | null = null;
/** Detaches the income recorder; set when engine metrics are registered. */
let unregisterMetrics: (() => void) | null = null;
/** The live user-span manager, so open custom spans can be flushed on teardown. */
let userSpanManager: OpenSpanCloser | null = null;
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

interface BuiltProviders {
  logger: LoggerProvider;
  meter: MeterProvider | null;
  tracer: BasicTracerProvider | null;
  unregisterMetrics: (() => void) | null;
  userSpanManager: OpenSpanCloser | null;
}

/**
 * Builds the OTel providers, lazily importing the SDK. The MeterProvider and TracerProvider
 * are built whenever an exporting sink exists — so player-defined metrics/spans work whenever
 * telemetry is enabled. The engine's OWN auto-instrumentation (game metrics, script-chain
 * spans) is registered only when its respective toggle is on.
 */
async function buildProviders(config: TelemetryConfig): Promise<BuiltProviders> {
  const [sdkLogs, sdkMetrics, sdkTrace, sinks, engineMetrics, spanManager, userMetricsMod, userSpanMod, resources] =
    await Promise.all([
      import("@opentelemetry/sdk-logs"),
      import("@opentelemetry/sdk-metrics"),
      import("@opentelemetry/sdk-trace-base"),
      import("./TelemetrySinks"),
      import("./EngineMetrics"),
      import("./ScriptSpanManager"),
      import("./UserMetricsManager"),
      import("./UserSpanManager"),
      import("@opentelemetry/resources"),
    ]);
  const resource = resources.resourceFromAttributes({
    "service.name": "bitburner",
    "service.version": config.serviceVersion,
    "bitburner.bitnode": config.bitNode,
    "deployment.environment": config.environment,
  });

  const logger = new sdkLogs.LoggerProvider({ resource, processors: sinks.buildLogProcessors(config) });

  let meter: MeterProvider | null = null;
  let unregister: (() => void) | null = null;
  const readers = sinks.buildMetricReaders(config);
  if (readers.length > 0) {
    meter = new sdkMetrics.MeterProvider({ resource, readers });
    const meterInstance = meter.getMeter("bitburner");
    if (config.metricsEnabled) {
      engineMetrics.registerEngineMetrics(meterInstance, config.bitNode);
      unregister = engineMetrics.unregisterEngineMetrics;
    }
    setUserMetricsImpl(new userMetricsMod.UserMetricsManager(meterInstance));
  }

  let tracer: BasicTracerProvider | null = null;
  let spanCloser: OpenSpanCloser | null = null;
  const spanProcessors = sinks.buildSpanProcessors(config);
  if (spanProcessors.length > 0) {
    const sampler = new sdkTrace.ParentBasedSampler({
      root: new sdkTrace.TraceIdRatioBasedSampler(config.traceSampleRatio),
    });
    tracer = new sdkTrace.BasicTracerProvider({ resource, sampler, spanProcessors });
    const tracerInstance = tracer.getTracer("bitburner");
    if (config.tracesEnabled) {
      setScriptTracerImpl(new spanManager.ScriptSpanManager(tracerInstance, config.bitNode));
    }
    const manager = new userSpanMod.UserSpanManager(tracerInstance);
    setUserSpansImpl(manager);
    spanCloser = manager;
  }

  return { logger, meter, tracer, unregisterMetrics: unregister, userSpanManager: spanCloser };
}

/** Tears down any live providers and detaches all emitters/recorders/managers. */
async function teardown(): Promise<void> {
  setLogEmitter(null);
  if (unregisterMetrics) {
    unregisterMetrics();
    unregisterMetrics = null;
  }
  setUserMetricsImpl(null);
  endAllOpenSpans();
  setScriptTracerImpl(null);
  userSpanManager?.endAllOpenSpans();
  setUserSpansImpl(null);
  userSpanManager = null;
  const logger = loggerProvider;
  const meter = meterProvider;
  const tracer = tracerProvider;
  loggerProvider = null;
  meterProvider = null;
  tracerProvider = null;
  const shutdowns: Promise<void>[] = [];
  if (logger) shutdowns.push(logger.shutdown());
  if (meter) shutdowns.push(meter.shutdown());
  if (tracer) shutdowns.push(tracer.shutdown());
  await Promise.all(shutdowns).catch((error: unknown) => console.error("Telemetry shutdown error", error));
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

  let built: BuiltProviders;
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
    built.unregisterMetrics?.();
    setUserMetricsImpl(null);
    endAllOpenSpans();
    setScriptTracerImpl(null);
    built.userSpanManager?.endAllOpenSpans();
    setUserSpansImpl(null);
    await built.logger.shutdown().catch(() => undefined);
    await built.meter?.shutdown().catch(() => undefined);
    await built.tracer?.shutdown().catch(() => undefined);
    return;
  }

  loggerProvider = built.logger;
  meterProvider = built.meter;
  tracerProvider = built.tracer;
  unregisterMetrics = built.unregisterMetrics;
  userSpanManager = built.userSpanManager;
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
