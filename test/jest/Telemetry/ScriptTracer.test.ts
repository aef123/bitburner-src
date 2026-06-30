import { type Context, trace } from "@opentelemetry/api";
import { ScriptSpanManager } from "../../../src/Telemetry/ScriptSpanManager";
import type { ScriptStartInfo } from "../../../src/Telemetry/ScriptTracer";
import { resetRateLimiter, setLogEmitter } from "../../../src/Telemetry/TelemetryLogger";

interface FakeSpan {
  name: string;
  attributes: Record<string, unknown>;
  context: { traceId: string; spanId: string };
  ended: boolean;
  status?: { code: number; message?: string };
}

/** A fake Tracer that records spans and derives child traceIds from the parent context. */
function makeFakeTracer() {
  const spans: FakeSpan[] = [];
  let counter = 0;
  const tracer = {
    startSpan(name: string, options: { attributes: Record<string, unknown> }, ctx?: Context) {
      counter++;
      // The manager embeds the parent span in the context via the real trace.setSpan, so we
      // read it back with the real trace.getSpan to verify context propagation end-to-end.
      const parent = ctx ? trace.getSpan(ctx) : undefined;
      const traceId = parent ? parent.spanContext().traceId : `trace-${counter}`;
      const span: FakeSpan = {
        name,
        attributes: options.attributes,
        context: { traceId, spanId: `span-${counter}` },
        ended: false,
      };
      spans.push(span);
      return {
        spanContext: () => span.context,
        setStatus: (status: { code: number; message?: string }) => (span.status = status),
        end: () => (span.ended = true),
      };
    },
  };
  return { tracer, spans };
}

const info = (filename: string, launchMethod = "root"): ScriptStartInfo => ({
  filename,
  server: "home",
  threads: 1,
  args: "[]",
  launchMethod,
});

describe("ScriptSpanManager", () => {
  beforeEach(() => {
    resetRateLimiter();
    setLogEmitter(() => undefined);
  });
  afterAll(() => setLogEmitter(null));

  it("makes children share the parent traceId and links to the parent span", () => {
    const { tracer, spans } = makeFakeTracer();
    const mgr = new ScriptSpanManager(tracer as never, 5);
    mgr.onScriptStart(1, info("root.js"));
    mgr.onScriptStart(2, info("child.js", "exec"), 1);

    const root = spans.find((s) => s.name === "root.js");
    const child = spans.find((s) => s.name === "child.js");
    expect(child?.context.traceId).toBe(root?.context.traceId);
    expect(child?.attributes["script.launch_method"]).toBe("exec");
    expect(child?.attributes["script.pid"]).toBe(2);
  });

  it("a script with no parent starts its own trace", () => {
    const { tracer, spans } = makeFakeTracer();
    const mgr = new ScriptSpanManager(tracer as never, 1);
    mgr.onScriptStart(10, info("a.js"));
    mgr.onScriptStart(11, info("b.js"));
    expect(spans[0].context.traceId).not.toBe(spans[1].context.traceId);
  });

  it("ends and removes the span on onScriptEnd (no leak)", () => {
    const { tracer, spans } = makeFakeTracer();
    const mgr = new ScriptSpanManager(tracer as never, 1);
    mgr.onScriptStart(7, info("x.js"));
    mgr.onScriptEnd(7);
    expect(spans[0].ended).toBe(true);
    // Ending again is a no-op (already removed from the map).
    mgr.onScriptEnd(7);
    expect(spans).toHaveLength(1);
  });

  it("endAllOpenSpans closes everything still open", () => {
    const { tracer, spans } = makeFakeTracer();
    const mgr = new ScriptSpanManager(tracer as never, 1);
    mgr.onScriptStart(1, info("a.js"));
    mgr.onScriptStart(2, info("b.js"));
    mgr.endAllOpenSpans();
    expect(spans.every((s) => s.ended)).toBe(true);
  });
});
