/**
 * Exports log records to the JS console: ERROR severity → console.error (stderr under
 * Node), everything else → console.log (stdout). Lives in the lazily-loaded telemetry chunk.
 */
import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";

const ERROR_SEVERITY = 17; // OTel SeverityNumber.ERROR

function formatRecord(record: ReadableLogRecord): string {
  const level = record.severityText ?? "LOG";
  const body = typeof record.body === "string" ? record.body : JSON.stringify(record.body);
  const attrs =
    record.attributes && Object.keys(record.attributes).length ? ` ${JSON.stringify(record.attributes)}` : "";
  return `[bitburner] ${level} ${body}${attrs}`;
}

export class StdioLogExporter implements LogRecordExporter {
  export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
    for (const log of logs) {
      const line = formatRecord(log);
      if ((log.severityNumber ?? 0) >= ERROR_SEVERITY) {
        console.error(line);
      } else {
        console.log(line);
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
