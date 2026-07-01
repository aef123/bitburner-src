import type { InternalAPI, NetscriptContext } from "../Netscript/APIWrapper";
import type { NSTelemetry } from "@nsdefs";
import { OtelLogLevel } from "../Settings/SettingEnums";
import { helpers } from "../Netscript/NetscriptHelpers";
import { logEvent, type TelemetryAttributes } from "../Telemetry/TelemetryLogger";
import { recordUserMetric, type UserMetricKind } from "../Telemetry/UserMetrics";
import { addUserSpanEvent, endUserSpan, setUserSpanAttributes, startUserSpan } from "../Telemetry/UserSpans";

/** Keeps only primitive attribute values (string/number/boolean). */
function coerceAttributes(attributes: unknown): TelemetryAttributes {
  const out: TelemetryAttributes = {};
  if (attributes && typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
      }
    }
  }
  return out;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Builds a log method that emits a "user" telemetry log record at the given level. */
function emitLog(level: OtelLogLevel) {
  return (ctx: NetscriptContext) =>
    (_message: unknown, _attributes?: unknown): void => {
      const message = helpers.string(ctx, "message", _message);
      const ws = ctx.workerScript;
      const scriptKey = `${ws.hostname}/${ws.name}#${ws.pid}`;
      const attributes: TelemetryAttributes = {
        ...coerceAttributes(_attributes),
        "script.pid": ws.pid,
        "script.filename": ws.name,
        "script.server": ws.hostname,
        "script.args": JSON.stringify(ws.scriptRef.args),
      };
      logEvent(level, message, attributes, scriptKey, "user");
    };
}

/** Builds a metric method. `hasDefault` gives counters a default increment of 1. */
function recordMetric(kind: UserMetricKind, hasDefault: boolean) {
  return (ctx: NetscriptContext) =>
    (_name: unknown, _value?: unknown, _attributes?: unknown): void => {
      const name = helpers.string(ctx, "name", _name);
      const raw = _value === undefined && hasDefault ? 1 : _value;
      const value = helpers.number(ctx, "value", raw);
      recordUserMetric(kind, name, value, coerceAttributes(_attributes));
    };
}

export function NetscriptTelemetry(): InternalAPI<NSTelemetry> {
  return {
    logs: {
      debug: emitLog(OtelLogLevel.DEBUG),
      info: emitLog(OtelLogLevel.INFO),
      warn: emitLog(OtelLogLevel.WARN),
      error: emitLog(OtelLogLevel.ERROR),
    },
    metrics: {
      counter: recordMetric("counter", true),
      upDownCounter: recordMetric("upDownCounter", false),
      gauge: recordMetric("gauge", false),
      histogram: recordMetric("histogram", false),
    },
    traces: {
      startSpan: (ctx) => (_name, _options?) => {
        const name = helpers.string(ctx, "name", _name);
        const options = asObject(_options);
        const parent = typeof options.parent === "string" ? options.parent : undefined;
        return startUserSpan(name, { attributes: coerceAttributes(options.attributes), parent });
      },
      endSpan: (ctx) => (_handle, _options?) => {
        const handle = helpers.string(ctx, "handle", _handle);
        const options = asObject(_options);
        endUserSpan(handle, { error: options.error === true, attributes: coerceAttributes(options.attributes) });
      },
      spanEvent: (ctx) => (_handle, _name, _attributes?) => {
        const handle = helpers.string(ctx, "handle", _handle);
        const name = helpers.string(ctx, "name", _name);
        addUserSpanEvent(handle, name, coerceAttributes(_attributes));
      },
      setSpanAttributes: (ctx) => (_handle, _attributes) => {
        const handle = helpers.string(ctx, "handle", _handle);
        setUserSpanAttributes(handle, coerceAttributes(_attributes));
      },
    },
  };
}
