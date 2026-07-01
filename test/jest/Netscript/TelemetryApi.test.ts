import type { NetscriptContext } from "../../../src/Netscript/APIWrapper";
import { NetscriptTelemetry } from "../../../src/NetscriptFunctions/Telemetry";
import { EmittedLog, resetRateLimiter, setLogEmitter, setMinLogLevel } from "../../../src/Telemetry/TelemetryLogger";
import { OtelLogLevel } from "../../../src/Settings/SettingEnums";
import { setUserMetricsImpl, type UserMetricKind } from "../../../src/Telemetry/UserMetrics";
import { setUserSpansImpl } from "../../../src/Telemetry/UserSpans";

function fakeCtx(pid: number): NetscriptContext {
  return {
    workerScript: { pid, name: "s.js", hostname: "home", scriptRef: { args: [1, "a"] } },
    function: "test",
    functionPath: "telemetry.test",
  } as unknown as NetscriptContext;
}

describe("ns.telemetry.logs", () => {
  let emitted: EmittedLog[];
  beforeEach(() => {
    emitted = [];
    resetRateLimiter();
    setMinLogLevel(OtelLogLevel.DEBUG);
    setLogEmitter((log) => emitted.push(log));
  });
  afterAll(() => setLogEmitter(null));

  it("emits with severity, body, source=user, and script attrs", () => {
    NetscriptTelemetry().logs.info(fakeCtx(7))("hello", { custom: "x", n: 3 });
    expect(emitted[0]).toMatchObject({ severityText: "INFO", severityNumber: 9, body: "hello" });
    expect(emitted[0].attributes).toMatchObject({
      custom: "x",
      n: 3,
      source: "user",
      "script.pid": 7,
      "script.filename": "s.js",
      "script.server": "home",
    });
  });

  it("maps each method to its level", () => {
    const logs = NetscriptTelemetry().logs;
    logs.debug(fakeCtx(1))("d");
    logs.warn(fakeCtx(1))("w");
    logs.error(fakeCtx(1))("e");
    expect(emitted.map((e) => e.severityText)).toEqual(["DEBUG", "WARN", "ERROR"]);
  });
});

describe("ns.telemetry.metrics", () => {
  const recorded: Array<{ kind: UserMetricKind; name: string; value: number; attributes: unknown }> = [];
  beforeAll(() => {
    setUserMetricsImpl({ record: (kind, name, value, attributes) => recorded.push({ kind, name, value, attributes }) });
  });
  afterAll(() => setUserMetricsImpl(null));
  beforeEach(() => (recorded.length = 0));

  it("counter defaults to 1 and passes dimensions", () => {
    NetscriptTelemetry().metrics.counter(fakeCtx(1))("hacks", undefined, { target: "n00dles" });
    expect(recorded[0]).toEqual({ kind: "counter", name: "hacks", value: 1, attributes: { target: "n00dles" } });
  });

  it("gauge/histogram/upDownCounter record the given value and kind", () => {
    const m = NetscriptTelemetry().metrics;
    m.gauge(fakeCtx(1))("profit", 500, {});
    m.histogram(fakeCtx(1))("t", 250, {});
    m.upDownCounter(fakeCtx(1))("inflight", -2, {});
    expect(recorded.map((r) => [r.kind, r.value])).toEqual([
      ["gauge", 500],
      ["histogram", 250],
      ["upDownCounter", -2],
    ]);
  });
});

describe("ns.telemetry.traces", () => {
  const calls: string[] = [];
  beforeAll(() => {
    setUserSpansImpl({
      start: (name, options) => {
        calls.push(`start:${name}:${options.parent ?? "root"}`);
        return "h1";
      },
      end: (handle, options) => calls.push(`end:${handle}:${options.error ? "err" : "ok"}`),
      addEvent: (handle, name) => calls.push(`event:${handle}:${name}`),
      setAttributes: (handle) => calls.push(`attrs:${handle}`),
    });
  });
  afterAll(() => setUserSpansImpl(null));
  beforeEach(() => (calls.length = 0));

  it("startSpan returns a handle and forwards parent + name", () => {
    const t = NetscriptTelemetry().traces;
    const h = t.startSpan(fakeCtx(1))("prep", { attributes: { a: 1 } });
    expect(h).toBe("h1");
    t.startSpan(fakeCtx(1))("child", { parent: h });
    t.spanEvent(fakeCtx(1))(h, "cp", {});
    t.setSpanAttributes(fakeCtx(1))(h, { k: 1 });
    t.endSpan(fakeCtx(1))(h, { error: true });
    expect(calls).toEqual(["start:prep:root", "start:child:h1", "event:h1:cp", "attrs:h1", "end:h1:err"]);
  });
});
