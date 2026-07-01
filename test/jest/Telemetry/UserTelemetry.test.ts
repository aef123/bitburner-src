import { type Context, trace } from "@opentelemetry/api";
import { UserMetricsManager } from "../../../src/Telemetry/UserMetricsManager";
import { UserSpanManager } from "../../../src/Telemetry/UserSpanManager";

describe("UserMetricsManager", () => {
  function makeFakeMeter() {
    const created: Array<{ kind: string; name: string }> = [];
    const ops: Array<{ name: string; op: string; value: number; attributes: unknown }> = [];
    const inst = (kind: string, name: string) => {
      created.push({ kind, name });
      return {
        add: (value: number, attributes: unknown) => ops.push({ name, op: "add", value, attributes }),
        record: (value: number, attributes: unknown) => ops.push({ name, op: "record", value, attributes }),
      };
    };
    const meter = {
      createCounter: (n: string) => inst("counter", n),
      createUpDownCounter: (n: string) => inst("upDownCounter", n),
      createGauge: (n: string) => inst("gauge", n),
      createHistogram: (n: string) => inst("histogram", n),
    };
    return { meter, created, ops };
  }

  it("creates an instrument on first use and reuses it after", () => {
    const { meter, created, ops } = makeFakeMeter();
    const m = new UserMetricsManager(meter as never);
    m.record("counter", "hacks", 1, { target: "n00dles" });
    m.record("counter", "hacks", 2, { target: "n00dles" });
    expect(created).toEqual([{ kind: "counter", name: "hacks" }]);
    expect(ops).toEqual([
      { name: "hacks", op: "add", value: 1, attributes: { target: "n00dles" } },
      { name: "hacks", op: "add", value: 2, attributes: { target: "n00dles" } },
    ]);
  });

  it("uses record() for gauge/histogram and add() for counters", () => {
    const { meter, ops } = makeFakeMeter();
    const m = new UserMetricsManager(meter as never);
    m.record("gauge", "profit", 500, {});
    m.record("histogram", "hackTime", 250, {});
    m.record("upDownCounter", "inflight", -1, {});
    expect(ops.map((o) => o.op)).toEqual(["record", "record", "add"]);
  });

  it("ignores a name reused with a different metric type", () => {
    const { meter, created } = makeFakeMeter();
    const m = new UserMetricsManager(meter as never);
    m.record("counter", "x", 1, {});
    m.record("gauge", "x", 5, {}); // ignored — keeps the counter definition
    expect(created).toEqual([{ kind: "counter", name: "x" }]);
  });
});

describe("UserSpanManager", () => {
  interface FakeSpan {
    name: string;
    context: { traceId: string; spanId: string };
    ended: boolean;
    events: Array<{ name: string; attributes: unknown }>;
    extraAttrs: Record<string, unknown>;
    status?: { code: number };
  }
  function makeFakeTracer() {
    const spans: FakeSpan[] = [];
    const tracer = {
      startSpan(name: string, opts: { attributes?: Record<string, unknown> }, ctx?: Context) {
        const parent = ctx ? trace.getSpan(ctx) : undefined;
        const n = spans.length + 1;
        const span: FakeSpan = {
          name,
          context: { traceId: parent ? parent.spanContext().traceId : `t${n}`, spanId: `s${n}` },
          ended: false,
          events: [],
          extraAttrs: {},
        };
        spans.push(span);
        return {
          spanContext: () => span.context,
          setAttributes: (a: Record<string, unknown>) => Object.assign(span.extraAttrs, a),
          addEvent: (name: string, attributes: unknown) => span.events.push({ name, attributes }),
          setStatus: (s: { code: number }) => (span.status = s),
          end: () => (span.ended = true),
        };
      },
    };
    return { tracer, spans };
  }

  it("start returns a handle; child (explicit parent) shares the trace, otherwise root", () => {
    const { tracer, spans } = makeFakeTracer();
    const mgr = new UserSpanManager(tracer as never);
    const root = mgr.start("root", {});
    const child = mgr.start("child", { parent: root });
    const other = mgr.start("other", {});
    expect(root).not.toBe("");
    expect(spans[1].context.traceId).toBe(spans[0].context.traceId); // child shares root's trace
    expect(spans[2].context.traceId).not.toBe(spans[0].context.traceId); // other is its own trace
  });

  it("addEvent / setAttributes / end operate by handle; end is idempotent", () => {
    const { tracer, spans } = makeFakeTracer();
    const mgr = new UserSpanManager(tracer as never);
    const h = mgr.start("op", { attributes: { a: 1 } });
    mgr.addEvent(h, "checkpoint", { step: 2 });
    mgr.setAttributes(h, { threads: 50 });
    mgr.end(h, { error: true, attributes: { done: true } });
    expect(spans[0].events).toEqual([{ name: "checkpoint", attributes: { step: 2 } }]);
    expect(spans[0].extraAttrs).toMatchObject({ threads: 50, done: true });
    expect(spans[0].status).toEqual({ code: 2 }); // SpanStatusCode.ERROR
    expect(spans[0].ended).toBe(true);
    mgr.end(h, {}); // already ended/removed → no throw, no double count
    expect(spans).toHaveLength(1);
  });

  it("endAllOpenSpans closes anything still open", () => {
    const { tracer, spans } = makeFakeTracer();
    const mgr = new UserSpanManager(tracer as never);
    mgr.start("a", {});
    mgr.start("b", {});
    mgr.endAllOpenSpans();
    expect(spans.every((s) => s.ended)).toBe(true);
  });
});
