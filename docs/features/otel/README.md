# OpenTelemetry Support for Bitburner

This folder holds the design and implementation plan for adding OpenTelemetry (OTel)
logging and metrics to Bitburner.

## Documents

- **[plan.md](./plan.md)** — the full design + phased implementation plan. Start here.

## TL;DR

Three layers, built on the **standard OpenTelemetry JavaScript SDK** (works in browser,
Electron renderer, and Node):

1. **Engine telemetry** — the game emits structured logs, periodic metrics (player money,
   skills, running scripts, RAM usage, faction rep, etc.), and **traces of the script
   execution chain** (which script launched which, across run/exec/spawn).
2. **Player-facing NS API** — a new `ns.telemetry` namespace lets player scripts emit
   leveled, structured logs through the same pipeline.
3. **Settings UI** — a new "Telemetry" options tab to enable/disable telemetry, set the
   log level, and choose the sink (console, file, or OTLP endpoint).

## Status

**Plan reviewed by subagents and revised. Implementation has NOT started and will not
begin until you approve.**

## Decisions locked / pending

| # | Decision | Status |
|---|----------|--------|
| 1 | Use the **standard OpenTelemetry JS SDK** (not hand-rolled), must run in browser + Electron + Node | **Locked** (user) |
| 2 | Signals in v1: **Logs + Metrics + Traces** (script execution chain) | **Locked** (user) — traces added |
| 3 | NS API shape: **`ns.telemetry`** leveled logging (renamed from `ns.log` after review); custom player metrics deferred | Recommended — pending confirmation |
| 4 | "File" sink is **Electron-only** (browser can't write files) | Recommended default — pending confirmation |
| 5 | Runtime opt-in (off by default) + lazy-loaded SDK, **not** a compile-time build flag | Decided — pending confirmation |
| 6 | Built for **this fork** first; upstream PR is a non-blocking nice-to-have | **Locked** (user) |
