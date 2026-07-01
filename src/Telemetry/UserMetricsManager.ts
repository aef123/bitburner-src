/**
 * OTel-backed manager for player-defined metrics. Reached only via the dynamic import() in
 * Telemetry.ts, so it may statically import @opentelemetry/*. Instruments are created on
 * first use, keyed by name, and reused on subsequent records.
 */
import type { Counter, Gauge, Histogram, Meter, UpDownCounter } from "@opentelemetry/api";
import type { TelemetryAttributes } from "./TelemetryLogger";
import type { UserMetricKind, UserMetricsImpl } from "./UserMetrics";

/** Cap on distinct metric names to bound instrument creation from runaway scripts. */
const MAX_METRICS = 1000;

type Instrument = Counter | UpDownCounter | Gauge | Histogram;

export class UserMetricsManager implements UserMetricsImpl {
  private readonly instruments = new Map<string, { kind: UserMetricKind; instrument: Instrument }>();
  private warned = false;

  constructor(private readonly meter: Meter) {}

  record(kind: UserMetricKind, name: string, value: number, attributes: TelemetryAttributes): void {
    let entry = this.instruments.get(name);
    if (!entry) {
      if (this.instruments.size >= MAX_METRICS) {
        if (!this.warned) {
          this.warned = true;
          console.warn(`Telemetry: user-metric limit (${MAX_METRICS}) reached; dropping "${name}".`);
        }
        return;
      }
      entry = { kind, instrument: this.create(kind, name) };
      this.instruments.set(name, entry);
    }
    // A name reused with a different metric type is ignored (keep the first definition).
    if (entry.kind !== kind) return;

    if (kind === "counter" || kind === "upDownCounter") {
      (entry.instrument as Counter).add(value, attributes);
    } else {
      (entry.instrument as Histogram).record(value, attributes);
    }
  }

  private create(kind: UserMetricKind, name: string): Instrument {
    switch (kind) {
      case "counter":
        return this.meter.createCounter(name);
      case "upDownCounter":
        return this.meter.createUpDownCounter(name);
      case "gauge":
        return this.meter.createGauge(name);
      case "histogram":
        return this.meter.createHistogram(name);
    }
  }
}
