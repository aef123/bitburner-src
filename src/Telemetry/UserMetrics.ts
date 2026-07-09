/**
 * Eager-safe front door for player-defined ("user") metrics from ns.telemetry.metrics.*.
 * Must NOT import @opentelemetry/* (reached from the hot NS path). The real, OTel-backed
 * manager is installed here once the MeterProvider exists.
 */
import type { TelemetryAttributes } from "./TelemetryLogger";

export type UserMetricKind = "counter" | "upDownCounter" | "gauge" | "histogram";

export interface UserMetricsImpl {
  record(kind: UserMetricKind, name: string, value: number, attributes: TelemetryAttributes): void;
}

let impl: UserMetricsImpl | null = null;

/** Installed by the Telemetry facade when a MeterProvider is live; cleared on teardown. */
export function setUserMetricsImpl(next: UserMetricsImpl | null): void {
  impl = next;
}

/** Records a user metric. No-op unless telemetry is active with an exporting sink. */
export function recordUserMetric(
  kind: UserMetricKind,
  name: string,
  value: number,
  attributes: TelemetryAttributes,
): void {
  impl?.record(kind, name, value, attributes);
}
