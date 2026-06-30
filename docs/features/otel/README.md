# OpenTelemetry Support for Bitburner

This folder holds the design and implementation plan for adding OpenTelemetry (OTel)
logging and metrics to Bitburner.

## Documents

- **[plan.md](./plan.md)** — the full design + phased implementation plan. Start here.

## TL;DR

Three layers, built on the **standard OpenTelemetry JavaScript SDK** (works in browser,
Electron renderer, and Node):

1. **Engine telemetry** — the game emits structured logs and periodic metrics (player
   money, skills, running scripts, RAM usage, faction rep, etc.) from the main tick loop.
2. **Player-facing NS API** — a new `ns.log` namespace lets player scripts emit leveled,
   structured logs through the same pipeline.
3. **Settings UI** — a new "Telemetry" options tab to enable/disable telemetry, set the
   log level, and choose the sink (console, file, or OTLP endpoint).

## Status

**Plan under review. Implementation has NOT started and will not begin until the plan is
approved.**

## Decisions locked / pending

| # | Decision | Status |
|---|----------|--------|
| 1 | Use the **standard OpenTelemetry JS SDK** (not hand-rolled), must run in browser + Electron + Node | **Locked** (user) |
| 2 | Signals in v1: **Logs + Metrics** (Traces deferred) | Recommended default — pending confirmation |
| 3 | NS API shape: **`ns.log`** leveled logging; custom player metrics deferred | Recommended default — pending confirmation |
| 4 | "File" sink is **Electron-only** (browser can't write files) | Recommended default — pending confirmation |
