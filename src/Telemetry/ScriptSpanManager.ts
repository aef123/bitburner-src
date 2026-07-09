/**
 * OTel-backed span manager: one span per script, keyed by pid. Reached only via the dynamic
 * import() in Telemetry.ts, so it may statically import @opentelemetry/*. Parent context is
 * passed explicitly (we manage context by the pid map, not OTel's context manager), so we use
 * ROOT_CONTEXT as the base.
 */
import { ROOT_CONTEXT, SpanStatusCode, trace, type Span, type Tracer } from "@opentelemetry/api";
import { OtelLogLevel } from "../Settings/SettingEnums";
import { logEvent } from "./TelemetryLogger";
import type { ScriptStartInfo, ScriptTracerImpl } from "./ScriptTracer";

export class ScriptSpanManager implements ScriptTracerImpl {
  private readonly spans = new Map<number, Span>();

  constructor(private readonly tracer: Tracer, private readonly bitNode: number) {}

  onScriptStart(pid: number, info: ScriptStartInfo, parentPid?: number): void {
    const attributes = {
      "script.pid": pid,
      "script.filename": info.filename,
      "script.server": info.server,
      "script.threads": info.threads,
      "script.args": info.args,
      "script.launch_method": info.launchMethod,
      bitnode: this.bitNode,
    };
    const parentSpan = parentPid !== undefined ? this.spans.get(parentPid) : undefined;
    const ctx = parentSpan ? trace.setSpan(ROOT_CONTEXT, parentSpan) : ROOT_CONTEXT;
    const span = this.tracer.startSpan(info.filename, { attributes }, ctx);
    this.spans.set(pid, span);

    const spanContext = span.spanContext();
    // Backbone log so the process tree is queryable even for never-ending scripts whose
    // spans never export.
    logEvent(OtelLogLevel.INFO, `script.start ${info.filename}`, {
      ...attributes,
      "event.name": "script.start",
      "trace.id": spanContext.traceId,
      "span.id": spanContext.spanId,
      ...(parentPid !== undefined ? { "parent.pid": parentPid } : {}),
    });
  }

  onScriptEnd(pid: number, error?: boolean): void {
    const span = this.spans.get(pid);
    if (!span) return;
    this.spans.delete(pid);
    if (error) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    logEvent(OtelLogLevel.INFO, `script.exit pid ${pid}`, {
      "script.pid": pid,
      "event.name": "script.exit",
      error: Boolean(error),
    });
  }

  endAllOpenSpans(): void {
    for (const span of this.spans.values()) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "interrupted" });
      span.end();
    }
    this.spans.clear();
  }
}
