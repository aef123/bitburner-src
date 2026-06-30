import type { NetscriptContext } from "../../../src/Netscript/APIWrapper";
import { NetscriptTelemetry } from "../../../src/NetscriptFunctions/Telemetry";
import { EmittedLog, resetRateLimiter, setLogEmitter, setMinLogLevel } from "../../../src/Telemetry/TelemetryLogger";
import { OtelLogLevel } from "../../../src/Settings/SettingEnums";

function fakeCtx(pid: number): NetscriptContext {
  return {
    workerScript: { pid, name: "s.js", hostname: "home", scriptRef: { args: [1, "a"] } },
    function: "info",
    functionPath: "telemetry.info",
  } as unknown as NetscriptContext;
}

describe("ns.telemetry", () => {
  let emitted: EmittedLog[];
  beforeEach(() => {
    emitted = [];
    resetRateLimiter();
    setMinLogLevel(OtelLogLevel.DEBUG);
    setLogEmitter((log) => emitted.push(log));
  });
  afterAll(() => setLogEmitter(null));

  it("emits a record with the right severity, body, script attrs, and user attrs", () => {
    const api = NetscriptTelemetry();
    api.info(fakeCtx(7))("hello", { custom: "x", n: 3 });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ severityText: "INFO", severityNumber: 9, body: "hello" });
    expect(emitted[0].attributes).toMatchObject({
      custom: "x",
      n: 3,
      source: "user",
      "script.pid": 7,
      "script.filename": "s.js",
      "script.server": "home",
      "script.args": JSON.stringify([1, "a"]),
    });
  });

  it("maps each method to its level", () => {
    const api = NetscriptTelemetry();
    api.debug(fakeCtx(1))("d");
    api.warn(fakeCtx(1))("w");
    api.error(fakeCtx(1))("e");
    expect(emitted.map((e) => e.severityText)).toEqual(["DEBUG", "WARN", "ERROR"]);
  });

  it("drops non-primitive attribute values", () => {
    const api = NetscriptTelemetry();
    api.info(fakeCtx(2))("m", { ok: 1, bad: { nested: true } } as never);
    expect(emitted[0].attributes.ok).toBe(1);
    expect(emitted[0].attributes.bad).toBeUndefined();
  });
});
