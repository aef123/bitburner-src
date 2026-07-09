/**
 * Eager-safe front door for player-defined ("user") traces from ns.telemetry.traces.*.
 * Must NOT import @opentelemetry/* (reached from the hot NS path). The real, OTel-backed
 * manager is installed here once the TracerProvider exists.
 *
 * Spans are handle-based: startSpan returns an opaque string handle that later calls
 * reference. Custom spans are their own ROOT traces by default (independent trace IDs);
 * pass a parent handle to nest one custom span under another.
 */
import type { TelemetryAttributes } from "./TelemetryLogger";

export interface SpanStartOptions {
  attributes?: TelemetryAttributes;
  /** Handle of another custom span to nest under. Omit for an independent root trace. */
  parent?: string;
}

export interface SpanEndOptions {
  /** Mark the span as errored. */
  error?: boolean;
  attributes?: TelemetryAttributes;
}

export interface UserSpansImpl {
  start(name: string, options: SpanStartOptions): string;
  end(handle: string, options: SpanEndOptions): void;
  addEvent(handle: string, name: string, attributes: TelemetryAttributes): void;
  setAttributes(handle: string, attributes: TelemetryAttributes): void;
}

/** Returned by startSpan when telemetry/tracing is inactive; all ops on it are no-ops. */
export const NO_SPAN = "";

let impl: UserSpansImpl | null = null;

/** Installed by the Telemetry facade when a TracerProvider is live; cleared on teardown. */
export function setUserSpansImpl(next: UserSpansImpl | null): void {
  impl = next;
}

export function startUserSpan(name: string, options: SpanStartOptions): string {
  return impl ? impl.start(name, options) : NO_SPAN;
}

export function endUserSpan(handle: string, options: SpanEndOptions): void {
  if (handle) impl?.end(handle, options);
}

export function addUserSpanEvent(handle: string, name: string, attributes: TelemetryAttributes): void {
  if (handle) impl?.addEvent(handle, name, attributes);
}

export function setUserSpanAttributes(handle: string, attributes: TelemetryAttributes): void {
  if (handle) impl?.setAttributes(handle, attributes);
}
