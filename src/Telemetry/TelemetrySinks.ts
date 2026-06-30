/**
 * Builds the processors/readers for every ENABLED sink (fan-out). This module statically
 * imports @opentelemetry/* and the custom exporters, so it must only ever be reached via the
 * dynamic import() in Telemetry.ts — that keeps the whole SDK in a lazy webpack chunk.
 */
import {
  BatchLogRecordProcessor,
  SimpleLogRecordProcessor,
  type LogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import type { TelemetryConfig } from "./TelemetryConfig";
import { StdioLogExporter } from "./exporters/StdioLogExporter";
import { GameConsoleLogExporter } from "./exporters/GameConsoleLogExporter";

/** Derives a per-signal OTLP/HTTP URL from a base endpoint (paths are NOT auto-appended). */
export function otlpUrl(base: string, signal: "logs" | "metrics" | "traces"): string {
  return `${base.replace(/\/+$/, "")}/v1/${signal}`;
}

/** One log processor per enabled sink. Console-type sinks export immediately; OTLP batches. */
export function buildLogProcessors(config: TelemetryConfig): LogRecordProcessor[] {
  const processors: LogRecordProcessor[] = [];
  if (config.sinks.gameConsole) {
    processors.push(new SimpleLogRecordProcessor(new GameConsoleLogExporter()));
  }
  if (config.sinks.stdio) {
    processors.push(new SimpleLogRecordProcessor(new StdioLogExporter()));
  }
  if (config.sinks.otlp) {
    processors.push(new BatchLogRecordProcessor(new OTLPLogExporter({ url: otlpUrl(config.otlpEndpoint, "logs") })));
  }
  return processors;
}
