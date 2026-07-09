import type { ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { StdioLogExporter } from "../../../src/Telemetry/exporters/StdioLogExporter";
import { GameConsoleLogExporter } from "../../../src/Telemetry/exporters/GameConsoleLogExporter";
import { Terminal } from "../../../src/Terminal";
import { workerScripts } from "../../../src/Netscript/WorkerScripts";

function rec(severityNumber: number, severityText: string, body: string, attributes: Record<string, unknown> = {}) {
  return { severityNumber, severityText, body, attributes } as unknown as ReadableLogRecord;
}

describe("StdioLogExporter", () => {
  it("routes ERROR to console.error and others to console.log", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const exporter = new StdioLogExporter();
    const cb = jest.fn();
    exporter.export([rec(9, "INFO", "hello"), rec(17, "ERROR", "boom")], cb);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ code: 0 }); // ExportResultCode.SUCCESS === 0
  });
});

describe("GameConsoleLogExporter", () => {
  it("appends to a live script's tail when script.pid maps to a WorkerScript", () => {
    const log = jest.fn();
    workerScripts.set(4242, { scriptRef: { log } } as never);
    const exporter = new GameConsoleLogExporter();
    exporter.export([rec(9, "INFO", "from script", { "script.pid": 4242 })], jest.fn());
    expect(log).toHaveBeenCalledTimes(1);
    workerScripts.delete(4242);
  });

  it("routes to the Terminal by severity when there is no live script", () => {
    const printSpy = jest.spyOn(Terminal, "print").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Terminal, "warn").mockImplementation(() => undefined);
    const errSpy = jest.spyOn(Terminal, "error").mockImplementation(() => undefined);
    const exporter = new GameConsoleLogExporter();
    exporter.export([rec(9, "INFO", "i"), rec(13, "WARN", "w"), rec(17, "ERROR", "e")], jest.fn());
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
