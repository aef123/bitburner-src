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
import {
  ConsoleMetricExporter,
  PeriodicExportingMetricReader,
  type MetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
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

/**
 * One periodic metric reader per enabled exporting sink. The in-game console sink is
 * logs-only, so it produces no reader.
 */
export function buildMetricReaders(config: TelemetryConfig): MetricReader[] {
  const readers: MetricReader[] = [];
  if (config.sinks.stdio) {
    readers.push(
      new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: config.exportIntervalMs,
      }),
    );
  }
  if (config.sinks.otlp) {
    readers.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: otlpUrl(config.otlpEndpoint, "metrics") }),
        exportIntervalMillis: config.exportIntervalMs,
      }),
    );
  }
  return readers;
}

/** One span processor per enabled exporting sink. The in-game console sink emits no spans. */
export function buildSpanProcessors(config: TelemetryConfig): SpanProcessor[] {
  const processors: SpanProcessor[] = [];
  if (config.sinks.stdio) {
    processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }
  if (config.sinks.otlp) {
    processors.push(new BatchSpanProcessor(new OTLPTraceExporter({ url: otlpUrl(config.otlpEndpoint, "traces") })));
  }
  return processors;
}
