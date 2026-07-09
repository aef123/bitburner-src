# OpenTelemetry Telemetry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or
> superpowers:subagent-driven-development to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenTelemetry logs, metrics, and script-execution-chain traces to Bitburner,
exportable to the in-game console, stdout/stderr, and/or an OTLP/HTTP endpoint, configured
from a new Settings tab, plus a player `ns.telemetry` logging API — and update the homelab
OTel Collector to receive it.

**Architecture:** One isolated `src/Telemetry/` module owns all `@opentelemetry/*` usage
behind a facade (`initTelemetry`/`reconfigureTelemetry`/`shutdownTelemetry`). The SDK is
lazy-`import()`ed only when telemetry is enabled. Engine code, the NS API, and the script
lifecycle call thin facade functions; nothing else imports OTel. Providers are held by
reference (no global registration) so reconfigure is clean. Sinks fan out via multiple
processors/readers per provider.

**Tech Stack:** TypeScript, React 17, MUI 5, Webpack 5, Jest. OpenTelemetry JS:
`@opentelemetry/api`, `api-logs`, `sdk-logs`, `sdk-metrics`, `sdk-trace-base`,
`exporter-logs-otlp-http`, `exporter-metrics-otlp-http`, `exporter-trace-otlp-http`,
`resources`, `semantic-conventions`.

## Global Constraints

- Design doc is `docs/features/otel/plan.md` — authoritative; this plan implements it.
- `src/` is browser + Electron-renderer + Node — **no Node-only APIs** in `src/`.
- Telemetry is **opt-in, off by default**. With nothing enabled, zero runtime cost and the
  SDK chunk is never fetched.
- **Only `src/Telemetry/**` imports `@opentelemetry/*`.** Everything else calls the facade.
- No global provider registration (`logs.setGlobalLoggerProvider` etc.) — hold refs.
- NS additions must keep the RAM-cost tree 1:1 (tsc + the `RamCalculation` jest test).
- Generated NS docs (`npm run doc`) must be committed (CI `check-docs` gate).
- CI must stay green: `npm run build`, `npm run lint` (`--max-warnings 0`),
  `npm run format:check` (prettier), `npm test`, `check-docs`.
- Pin experimental `0.x` OTel packages to **exact** versions; dedupe `@opentelemetry/api`.
- Commit frequently, one logical change per commit, on branch `otlp`.

---

## Verification commands

- Lint: `npm run lint`  • Format: `npx prettier --check <files>` / `npm run format`
- Types/build: `npx tsc --noEmit` (fast) or `npm run build`
- Tests: `npx jest <path>`  • All tests: `npm test`
- Docs: `npm run doc` (then `git status` must be clean)
- Bundle: `npm run analyze-bundle`

---

## Phase 0 — Scaffolding, deps, settings

### Task 0.1: Add OpenTelemetry dependencies
**Files:** Modify `package.json`, `package-lock.json`.
- [ ] Add deps: `@opentelemetry/api`, `@opentelemetry/api-logs`, `@opentelemetry/sdk-logs`,
  `@opentelemetry/sdk-metrics`, `@opentelemetry/sdk-trace-base`,
  `@opentelemetry/exporter-logs-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`,
  `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`,
  `@opentelemetry/semantic-conventions`. Stable ones with `^`, experimental `0.x` ones
  pinned exact.
- [ ] `npm install`; verify a single `@opentelemetry/api` in the lockfile
  (`npm ls @opentelemetry/api`).
- [ ] Run `npm run build` to confirm nothing breaks. Commit.

### Task 0.2: Settings fields + enum + validation
**Files:** Modify `src/Settings/Settings.ts`, `src/Settings/SettingEnums.ts`,
`src/Settings/SettingsUtils.ts`; Test `test/jest/Settings/TelemetrySettings.test.ts`.

**Interfaces produced:**
- `Settings.TelemetryEnabled: boolean`, `TelemetryLogLevel: OtelLogLevel`,
  `TelemetrySinkGameConsole/Stdio/Otlp: boolean`, `TelemetryOtlpEndpoint: string`,
  `TelemetryMetricsEnabled: boolean`, `TelemetryTracesEnabled: boolean`,
  `TelemetryTraceSampleRatio: number`, `TelemetryExportIntervalMs: number`.
- `enum OtelLogLevel { DEBUG="DEBUG", INFO="INFO", WARN="WARN", ERROR="ERROR" }`.
- `isValidOtlpEndpoint(url: string): Result` in `SettingsUtils.ts`.

- [ ] Add `OtelLogLevel` string enum to `SettingEnums.ts`.
- [ ] Add the fields above to the `Settings` object with documented defaults
  (`TelemetryEnabled:false`, `TelemetryLogLevel:OtelLogLevel.INFO`,
  `TelemetrySinkGameConsole:false`, `TelemetrySinkStdio:true`, `TelemetrySinkOtlp:false`,
  `TelemetryOtlpEndpoint:"http://localhost:4318"`, `TelemetryMetricsEnabled:true`,
  `TelemetryTracesEnabled:true`, `TelemetryTraceSampleRatio:1`,
  `TelemetryExportIntervalMs:10000`).
- [ ] Write `isValidOtlpEndpoint` (parseable URL; scheme must be http/https). Test valid +
  invalid cases.
- [ ] In `loadSettings`, after the `Object.assign`, coerce/clamp: reset endpoint to default
  if invalid; clamp `TelemetryExportIntervalMs` to `[1000, 600000]`; clamp
  `TelemetryTraceSampleRatio` to `[0,1]`; coerce log level to a valid enum value; coerce the
  five boolean toggles with `Boolean(...)`.
- [ ] Test: a save with junk telemetry values loads to sane defaults. Commit.

### Task 0.3: Telemetry config + facade stubs (no-ops)
**Files:** Create `src/Telemetry/TelemetryConfig.ts`, `src/Telemetry/Telemetry.ts`,
`src/Telemetry/index.ts`; Test `test/jest/Telemetry/TelemetryConfig.test.ts`.

**Interfaces produced:**
- `interface TelemetryConfig { enabled; logLevel: OtelLogLevel; sinks: {gameConsole; stdio; otlp}; otlpEndpoint; metricsEnabled; tracesEnabled; traceSampleRatio; exportIntervalMs; environment: "browser"|"electron"; serviceVersion: string; bitNode: number }`
- `readTelemetryConfig(): TelemetryConfig` — pulls from `Settings` + `Player.bitNodeN` +
  version + Electron UA check.
- `initTelemetry(): void`, `reconfigureTelemetry(): void`, `shutdownTelemetry(): Promise<void>`
  — all no-op stubs returning immediately when `!Settings.TelemetryEnabled`.

- [ ] Implement `readTelemetryConfig()` (environment via
  `navigator.userAgent.toLowerCase().includes(" electron/")`; version from the app version
  constant). Unit-test the mapping.
- [ ] Implement facade stubs that early-return when disabled. Commit.

---

## Phase 1 — Core logging + stdio & in-game console sinks

### Task 1.1: Severity mapping + log-level filter + rate cap
**Files:** Create `src/Telemetry/TelemetryLogger.ts`; Test
`test/jest/Telemetry/TelemetryLogger.test.ts`.

**Interfaces produced:**
- `type TelemetryAttributes = Record<string, string | number | boolean>`
- `logEvent(level: OtelLogLevel, body: string, attributes?: TelemetryAttributes, scriptKey?: string): void`
- internal `severityNumberFor(level): SeverityNumber` (DEBUG=5, INFO=9, WARN=13, ERROR=17).
- internal `passesLevel(level): boolean`, `passesRate(scriptKey): boolean`
  (token bucket, default 100/sec/key).

- [ ] Test: levels below configured threshold are dropped (no emit); rate cap drops the
  101st call within a second for a key and emits one throttled warning.
- [ ] Implement filtering + token-bucket **before** any record construction. When enabled,
  forward to the active `LoggerProvider` logger (held in `Telemetry.ts`); when disabled,
  no-op. Commit.

### Task 1.2: Stdio + game-console log exporters
**Files:** Create `src/Telemetry/exporters/StdioLogExporter.ts`,
`src/Telemetry/exporters/GameConsoleLogExporter.ts`; Test
`test/jest/Telemetry/exporters.test.ts`.

**Interfaces produced:** both implement OTel `LogRecordExporter`
(`export(records, resultCallback)`, `shutdown()`).
- `StdioLogExporter`: ERROR severity → `console.error`, else `console.log`; formats
  `[time] LEVEL body {attrs}`.
- `GameConsoleLogExporter`: if a record's attributes contain a known `script.pid` mapping to
  a live `WorkerScript`, append to that script's tail (`ws.scriptRef.log(...)`); otherwise
  route to the Terminal (`Terminal.print/warn/error` by severity).

- [ ] Test each exporter with a couple of fake records (spy on console / Terminal).
- [ ] Implement. Commit.

### Task 1.3: Sink builder + provider lifecycle (logs)
**Files:** Create `src/Telemetry/TelemetrySinks.ts`; flesh out `src/Telemetry/Telemetry.ts`;
Test `test/jest/Telemetry/TelemetrySinks.test.ts`.

**Interfaces produced:**
- `buildLogProcessors(cfg): LogRecordProcessor[]` — one per enabled sink: gameConsole/stdio
  via `SimpleLogRecordProcessor`, otlp via `BatchLogRecordProcessor` +
  `OTLPLogExporter({url: cfg.otlpEndpoint + "/v1/logs"})`.
- `Telemetry.ts`: lazy `await import()` of the SDK on first enable; build a
  `LoggerProvider({resource, processors})`; hold it; `getTelemetryLogger()` returns
  `provider.getLogger("bitburner")`. `reconfigureTelemetry` shuts down old + rebuilds.
  `shutdownTelemetry` `forceFlush()`+`shutdown()`.

- [ ] Test: with only stdio enabled, one processor; stdio+otlp → two; none → empty array.
- [ ] Implement lazy SDK load + provider construction + reconfigure/shutdown.
- [ ] Wire `initTelemetry()` into game load and `shutdownTelemetry()` into the unload path
  (see Task 1.4). Commit.

### Task 1.4: Wire init/shutdown + reconfigure-on-settings-change
**Files:** Modify `src/engine.tsx` (call `initTelemetry()` in `load`), the unload/`beforeunload`
handler (find via `addEventListener("beforeunload"` — likely `src/index.tsx`), and the
Settings page save (Task 6) calls `reconfigureTelemetry()`.

- [ ] Add `initTelemetry()` near the end of `Engine.load`. Add `shutdownTelemetry()` to the
  existing unload handler. Manually verify enabling telemetry in code logs structured events
  to the JS console / in-game terminal per the sink toggles. Commit.

---

## Phase 2 — Engine metrics

### Task 2.1: Metric instruments + collectors
**Files:** Create `src/Telemetry/EngineMetrics.ts`; modify `src/Telemetry/Telemetry.ts`
(build `MeterProvider`), `src/Telemetry/TelemetrySinks.ts` (`buildMetricReaders`); Test
`test/jest/Telemetry/EngineMetrics.test.ts`.

**Interfaces produced:**
- `registerEngineMetrics(meter: Meter): void` — creates observable gauges/counters and
  `addCallback`s that read `Player`/servers:
  `bitburner.player.money`, `bitburner.player.skill{skill}`, `bitburner.player.karma`,
  `bitburner.player.hp.current/.max`, `bitburner.scripts.running` (from `workerScripts.size`),
  `bitburner.servers.ram_used/.ram_total`, `bitburner.faction.reputation{faction}`.
- `buildMetricReaders(cfg): MetricReader[]` — `PeriodicExportingMetricReader` per enabled
  sink (stdio → `ConsoleMetricExporter`; otlp → `OTLPMetricExporter({url:.../v1/metrics})`),
  `exportIntervalMillis: cfg.exportIntervalMs`. (Game-console sink: none — logs only.)

- [ ] Test: the observable callbacks observe expected values from a mock Player/servers.
- [ ] Implement; gate on `cfg.metricsEnabled`. Commit.

### Task 2.2: Income counter via recordMoneySource
**Files:** Modify `src/PersonObjects/Player/PlayerObjectGeneralMethods.ts` (`recordMoneySource`),
add a thin facade call `recordIncome(source, amount)` in `src/Telemetry/EngineMetrics.ts`;
Test extends `EngineMetrics.test.ts`.

**Interfaces produced:** `recordIncome(source: string, amount: number): void` — increments
`bitburner.player.income` counter with attribute `source`. No-op when disabled/metrics off.

- [ ] Test counter increments by source. Implement + call from `recordMoneySource`. Commit.

---

## Phase 3 — Tracing (script execution chain)

### Task 3.1: ScriptTracer (span lifecycle by pid)
**Files:** Create `src/Telemetry/ScriptTracer.ts`; modify `src/Telemetry/Telemetry.ts`
(build `BasicTracerProvider` w/ `ParentBasedSampler(TraceIdRatioBasedSampler(ratio))`),
`src/Telemetry/TelemetrySinks.ts` (`buildSpanProcessors`); Test
`test/jest/Telemetry/ScriptTracer.test.ts`.

**Interfaces produced:**
- `onScriptStart(pid: number, info: {filename; server; threads; args; launchMethod: "run"|"exec"|"spawn"|"root"}, parentPid?: number): void`
- `onScriptEnd(pid: number, error?: boolean): void`
- `endAllOpenSpans(): void` (shutdown best-effort).
- Internal `Map<number, Span>`. Child parent context built with
  `trace.setSpan(ROOT_CONTEXT, parentSpan)` via `tracer.startSpan(name, {attributes}, ctx)`;
  no parent → root. Also emits `script.start`/`script.exit` log events via `logEvent`.
- `buildSpanProcessors(cfg)`: stdio → `SimpleSpanProcessor(ConsoleSpanExporter)`;
  otlp → `BatchSpanProcessor(OTLPTraceExporter({url:.../v1/traces}))`.

- [ ] Test: start root → start child(parentPid=root) → both share traceId, child.parentSpanId
  = root.spanId; `onScriptEnd` ends + removes from map (no leak); `script.start`/`exit` logs
  emitted; gated on `cfg.tracesEnabled`.
- [ ] Implement. Commit.

### Task 3.2: Hook the script lifecycle
**Files:** Modify `src/NetscriptWorker.ts` (`createAndAddWorkerScript` — call `onScriptStart`
right after `workerScripts.set(pid, workerScript)`, deriving `launchMethod` from a new param
or from `parent` presence), `src/Netscript/killWorkerScript.ts`
(`stopAndCleanUpWorkerScript` — call `onScriptEnd(ws.pid)` just before `removeWorkerScript`).
`WorkerScript` stays free of OTel imports (facade call only).

- [ ] Pass `launchMethod` through: `runScriptFromScript` already knows `caller`
  ("run"/"exec"/"spawn"); thread it into `startWorkerScript`/`createAndAddWorkerScript` (new
  optional param, default "root"). Top-level callers pass nothing → "root".
- [ ] Add facade calls. Build + run a script that `exec`s a child; verify a parented trace in
  the console. Commit.

---

## Phase 4 — OTLP sink end-to-end

### Task 4.1: OTLP exporters wired for all three signals
**Files:** Already built in `TelemetrySinks.ts` (Tasks 1.3/2.1/3.1). This task verifies + adds
per-signal URL derivation helper.
**Interfaces produced:** `otlpUrl(base, signal: "logs"|"metrics"|"traces"): string` →
`${base.replace(/\/$/,"")}/v1/${signal}`.

- [ ] Test the URL helper (trailing slash handling). Use it in all three exporter builders.
- [ ] Manual: run a local `otel/opentelemetry-collector-contrib` and confirm logs+metrics+
  traces arrive (covered fully by the homelab collector task). Commit.

---

## Phase 5 — `ns.telemetry` NS API

### Task 5.1: NSTelemetry type in NetscriptDefinitions
**Files:** Modify `src/ScriptEditor/NetscriptDefinitions.d.ts` — add the `NSTelemetry`
interface (with TSDoc `@remarks RAM cost: 0 GB` + `@example`) and `readonly telemetry:
NSTelemetry;` on the `NS` interface (near `readonly go: Go;`).

**Interfaces produced:** `NSTelemetry` with `debug/info/warn/error(message: string,
attributes?: Record<string, string|number|boolean>): void`.

- [ ] Add the interface + member. `npm run build` to typecheck. Commit.

### Task 5.2: NetscriptTelemetry implementation + mount + RAM cost
**Files:** Create `src/NetscriptFunctions/Telemetry.ts`; modify `src/NetscriptFunctions.ts`
(import + mount `telemetry: NetscriptTelemetry()` in the `ns` object), `src/Netscript/
RamCostGenerator.ts` (add `telemetry: { debug:0, info:0, warn:0, error:0 }` and include
`telemetry` in the `RamCosts` object); Test `test/jest/Netscript/TelemetryApi.test.ts`.

**Interfaces consumed:** `logEvent` from `TelemetryLogger`; `InternalAPI`, `NetscriptContext`,
`helpers` from Netscript.
**Implementation:** each method validates with `helpers.string(ctx,"message",_msg)` +
optional attributes object; builds the script key/attributes from `ctx.workerScript`
(`pid`, `name`, `hostname`, `JSON.stringify(scriptRef.args)`) and calls
`logEvent(level, message, {...attrs, "script.pid":..., ...}, scriptKey)`.

- [ ] Add cost entries (keep tree 1:1). Run `npx jest RamCalculation` — must pass.
- [ ] Test: `ns.telemetry.info("x",{a:1})` calls `logEvent` with INFO + script attrs; RAM 0.
- [ ] `npm run doc`; commit regenerated markdown + code together.

---

## Phase 6 — Settings UI

### Task 6.1: TelemetryPage component
**Files:** Create `src/GameOptions/ui/TelemetryPage.tsx`; modify
`src/GameOptions/ui/GameOptionsRoot.tsx` (`OptionsTabName` union + `tabs` record) and
`src/GameOptions/ui/GameOptionsSidebar.tsx` (add the `<SideBarTab>`).

- [ ] Build the page from `OptionSwitch`/MUI `Select`/`TextField` (model on
  `RemoteAPIPage.tsx`): master enable; log-level select; three sink `OptionSwitch`es; OTLP
  endpoint `TextField` (validated via `isValidOtlpEndpoint`, shown when OTLP on, with the
  non-localhost warning + CORS hint); metrics switch + interval field; traces switch + sample
  slider; a "Test connection" button (best-effort `fetch` POST to `.../v1/logs`, toast
  result); a sentence on what's collected.
- [ ] Every change writes `Settings.*` then calls `reconfigureTelemetry()`.
- [ ] Add `"Telemetry"` to the union/record/sidebar. `npm run build` + `npm run lint`.
  Manually verify the tab works. Commit.

---

## Phase 7 — Homelab collector, tests, docs, polish

### Task 7.1: Update the homelab OTel Collector (separate repo)
**Files (repo `c:\git\Homelab`):** Modify
`DockerCompose/DMZ_Observability/otel-collector-config.yml` and `docker-compose.yml`.
**Context:** The collector already forwards OTLP → Prometheus/Loki/Tempo. The only thing
missing for a **browser** sender is CORS, and we don't want the public bearer token in a
browser. So add a second, intranet-only, no-auth, CORS-enabled OTLP/HTTP receiver for game
telemetry and wire it into all three pipelines.

- [ ] In `otel-collector-config.yml` add receiver `otlp/bitburner` with
  `protocols.http.endpoint: 0.0.0.0:4319` and
  `cors: { allowed_origins: ["*"], allowed_headers: ["*"] }` (intranet-only port → wildcard
  CORS is acceptable, mirrors the no-auth syslog stance).
- [ ] Add `otlp/bitburner` to the `receivers:` list of the `metrics`, `logs`, and `traces`
  pipelines.
- [ ] In `docker-compose.yml` publish `"4319:4319"` on the collector with a comment that it's
  intranet-only and must NOT be added to the Cloudflare tunnel.
- [ ] Commit in the Homelab repo (separate commit/branch). Point Bitburner's OTLP endpoint at
  `http://<collector-host>:4319` and confirm data lands in Grafana (Loki logs, Prometheus
  metrics `bitburner.*`, Tempo traces under `service.name=bitburner`).

### Task 7.2: Full verification + changelog
**Files:** `changelog.md` (add an entry); regenerate docs.
- [ ] Run `npm run lint`, `npm run format` (or prettier check), `npm test`, `npm run build`,
  `npm run doc` (commit any doc changes). Confirm all green.
- [ ] `npm run analyze-bundle` — confirm OTel lands in a lazy chunk; record the
  telemetry-off initial-bundle delta in the PR/commit message.
- [ ] Add a changelog entry. Final commit.

---

## Self-review notes
- Every `plan.md` section maps to a task: deps (0.1), settings (0.2), facade/config (0.3,
  1.3), logger+rate cap (1.1), sinks (1.2,1.3,2.1,3.1,4.1), metrics (2.x), traces (3.x),
  NS API (5.x), UI (6.1), collector (7.1), tests/docs/bundle (throughout + 7.2).
- Naming is consistent: `logEvent`, `readTelemetryConfig`, `onScriptStart/End`,
  `buildLogProcessors/MetricReaders/SpanProcessors`, `otlpUrl`.
- No file-sink / no maintainer-gate content (dropped per latest direction).
