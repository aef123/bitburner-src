/**
 * Exports log records to the in-game console — the same surfaces ns.print/ns.tprint use.
 * If a record carries a script.pid that maps to a live WorkerScript, it is appended to that
 * script's tail log; otherwise it goes to the Terminal, routed by severity. Logs only.
 * Lives in the lazily-loaded telemetry chunk.
 */
import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { Terminal } from "../../Terminal";
import { workerScripts } from "../../Netscript/WorkerScripts";

const WARN_SEVERITY = 13; // OTel SeverityNumber.WARN
const ERROR_SEVERITY = 17; // OTel SeverityNumber.ERROR

function bodyText(record: ReadableLogRecord): string {
  const level = record.severityText ?? "LOG";
  const body = typeof record.body === "string" ? record.body : JSON.stringify(record.body);
  return `${level}: ${body}`;
}

function routeToTerminal(severityNumber: number, text: string): void {
  if (severityNumber >= ERROR_SEVERITY) {
    Terminal.error(text);
  } else if (severityNumber >= WARN_SEVERITY) {
    Terminal.warn(text);
  } else {
    Terminal.print(text);
  }
}

export class GameConsoleLogExporter implements LogRecordExporter {
  export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
    for (const log of logs) {
      const pid = log.attributes?.["script.pid"];
      const ws = typeof pid === "number" ? workerScripts.get(pid) : undefined;
      const text = bodyText(log);
      if (ws) {
        ws.scriptRef.log(text);
      } else {
        routeToTerminal(log.severityNumber ?? 0, text);
      }
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
