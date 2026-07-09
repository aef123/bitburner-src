/**
 * OTel-backed manager for player-defined spans/traces. Reached only via the dynamic import()
 * in Telemetry.ts, so it may statically import @opentelemetry/*. Spans are handle-based and,
 * by default, their own ROOT traces (independent trace IDs) — deliberately NOT nested under
 * the script's long-lived auto execution-span, so a custom trace shows up complete as soon
 * as its top span ends, even for scripts that run for days.
 */
import { ROOT_CONTEXT, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import type { TelemetryAttributes } from "./TelemetryLogger";
import type { SpanEndOptions, SpanStartOptions, UserSpansImpl } from "./UserSpans";

/** Cap on concurrently-open user spans to bound memory from scripts that never close them. */
const MAX_OPEN_SPANS = 10000;

export class UserSpanManager implements UserSpansImpl {
  private readonly spans = new Map<string, Span>();
  private seq = 0;
  private warned = false;

  constructor(private readonly tracer: Tracer) {}

  start(name: string, options: SpanStartOptions): string {
    if (this.spans.size >= MAX_OPEN_SPANS) {
      if (!this.warned) {
        this.warned = true;
        console.warn(`Telemetry: open user-span limit (${MAX_OPEN_SPANS}) reached; not creating "${name}".`);
      }
      return "";
    }
    const parent = options.parent ? this.spans.get(options.parent) : undefined;
    const ctx = parent ? trace.setSpan(ROOT_CONTEXT, parent) : ROOT_CONTEXT;
    const span = this.tracer.startSpan(name, { attributes: options.attributes }, ctx);
    const handle = `u${++this.seq}`;
    this.spans.set(handle, span);
    return handle;
  }

  end(handle: string, options: SpanEndOptions): void {
    const span = this.spans.get(handle);
    if (!span) return;
    this.spans.delete(handle);
    if (options.attributes) span.setAttributes(options.attributes);
    if (options.error) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  }

  addEvent(handle: string, name: string, attributes: TelemetryAttributes): void {
    this.spans.get(handle)?.addEvent(name, attributes);
  }

  setAttributes(handle: string, attributes: TelemetryAttributes): void {
    this.spans.get(handle)?.setAttributes(attributes);
  }

  /** Best-effort close of all still-open spans on shutdown/reconfigure. */
  endAllOpenSpans(): void {
    for (const span of this.spans.values()) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "interrupted" });
      span.end();
    }
    this.spans.clear();
  }
}
