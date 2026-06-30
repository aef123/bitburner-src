/**
 * Front door for all telemetry log records (engine logs and the ns.telemetry API).
 *
 * IMPORTANT: this file is imported by hot, eager code paths (the NS API, the engine), so it
 * must NOT import @opentelemetry/* — that would pull the SDK into the initial bundle. It
 * works purely with plain values and forwards to an emitter that the Telemetry facade
 * installs once the (lazily loaded) providers exist.
 */
import { OtelLogLevel } from "../Settings/SettingEnums";

export type TelemetryAttributes = Record<string, string | number | boolean>;

/** Whether a log record originated from the game engine ("system") or a player script ("user"). */
export type TelemetrySource = "system" | "user";

/** A log record ready to hand to the OTel logger. Mirrors the subset of LogRecord we set. */
export interface EmittedLog {
  severityNumber: number;
  severityText: string;
  body: string;
  attributes: TelemetryAttributes;
}

export type LogEmitter = (log: EmittedLog) => void;

/** OTel SeverityNumber values (kept as plain constants to avoid importing @opentelemetry/api-logs). */
const SEVERITY_NUMBER: Record<OtelLogLevel, number> = {
  [OtelLogLevel.DEBUG]: 5,
  [OtelLogLevel.INFO]: 9,
  [OtelLogLevel.WARN]: 13,
  [OtelLogLevel.ERROR]: 17,
};

/** Default per-script rate cap: records allowed per key per second. */
export const DEFAULT_RATE_LIMIT = 100;
const RATE_WINDOW_MS = 1000;

let emitter: LogEmitter | null = null;
let minSeverity: number = SEVERITY_NUMBER[OtelLogLevel.INFO];
let rateLimit = DEFAULT_RATE_LIMIT;

interface Bucket {
  windowStart: number;
  count: number;
  warned: boolean;
}
const buckets = new Map<string, Bucket>();

/** Installed by the Telemetry facade when providers are live; cleared on shutdown. */
export function setLogEmitter(next: LogEmitter | null): void {
  emitter = next;
}

/** Sets the minimum severity that will be emitted. */
export function setMinLogLevel(level: OtelLogLevel): void {
  minSeverity = SEVERITY_NUMBER[level];
}

/** Test/configuration hook for the per-key rate cap. */
export function setRateLimit(limit: number): void {
  rateLimit = limit;
}

/** Clears all rate-limiter state. */
export function resetRateLimiter(): void {
  buckets.clear();
}

export function severityNumberFor(level: OtelLogLevel): number {
  return SEVERITY_NUMBER[level];
}

/** Returns true if a call for the given key is within the rate cap; tracks one throttled warning. */
function passesRate(key: string, now: number): { allowed: boolean; firstDrop: boolean } {
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
    bucket = { windowStart: now, count: 0, warned: false };
    buckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count <= rateLimit) {
    return { allowed: true, firstDrop: false };
  }
  if (!bucket.warned) {
    bucket.warned = true;
    return { allowed: false, firstDrop: true };
  }
  return { allowed: false, firstDrop: false };
}

/**
 * Emits a telemetry log record. No-ops when telemetry is inactive or the level is below the
 * configured threshold. The level and rate checks happen BEFORE any record is constructed.
 *
 * Every emitted record carries a `source` attribute ("system" for engine/lifecycle logs,
 * "user" for logs from player scripts via ns.telemetry) so the two can be separated easily.
 */
export function logEvent(
  level: OtelLogLevel,
  body: string,
  attributes: TelemetryAttributes = {},
  scriptKey?: string,
  source: TelemetrySource = "system",
): void {
  const sink = emitter;
  if (!sink) return;
  const severityNumber = SEVERITY_NUMBER[level];
  if (severityNumber < minSeverity) return;

  if (scriptKey !== undefined) {
    const now = Date.now();
    const { allowed, firstDrop } = passesRate(scriptKey, now);
    if (!allowed) {
      if (firstDrop) {
        sink({
          severityNumber: SEVERITY_NUMBER[OtelLogLevel.WARN],
          severityText: OtelLogLevel.WARN,
          body: `Telemetry rate limit (${rateLimit}/s) exceeded for ${scriptKey}; further records dropped this second.`,
          attributes: { "telemetry.dropped": true, source: "system" },
        });
      }
      return;
    }
  }

  sink({ severityNumber, severityText: level, body, attributes: { ...attributes, source } });
}
