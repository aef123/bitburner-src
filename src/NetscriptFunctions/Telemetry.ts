import type { InternalAPI, NetscriptContext } from "../Netscript/APIWrapper";
import type { NSTelemetry } from "@nsdefs";
import { OtelLogLevel } from "../Settings/SettingEnums";
import { helpers } from "../Netscript/NetscriptHelpers";
import { logEvent, type TelemetryAttributes } from "../Telemetry/TelemetryLogger";

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

/** Builds a method that emits a telemetry log record at the given level. */
function emitAt(level: OtelLogLevel) {
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
      logEvent(level, message, attributes, scriptKey);
    };
}

export function NetscriptTelemetry(): InternalAPI<NSTelemetry> {
  return {
    debug: emitAt(OtelLogLevel.DEBUG),
    info: emitAt(OtelLogLevel.INFO),
    warn: emitAt(OtelLogLevel.WARN),
    error: emitAt(OtelLogLevel.ERROR),
  };
}
