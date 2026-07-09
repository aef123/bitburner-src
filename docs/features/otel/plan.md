# OpenTelemetry Support for Bitburner — Design & Implementation Plan

**Status:** Draft, revised after subagent review. No implementation until approved.
**Target branch:** `otlp` (current) → PR into `dev`.

> **Revision note:** This plan was reviewed by three independent subagents (OpenTelemetry
> correctness, Bitburner codebase fit, and API/UX & scope). Their findings are folded in
> below; a summary of changes is in [§12 Review outcomes](#12-review-outcomes).

---

## 1. Goal

Add OpenTelemetry support to Bitburner in three layers:

1. **Engine telemetry** — the game engine emits structured **logs**, periodic **metrics**
   (player money, stats, etc.), and **traces** of the script execution chain (which script
   launched which).
2. **Player NS API** — script authors can emit structured logs from their own scripts.
3. **Configuration** — a settings page section to enable telemetry, set the log level,
   and choose where signals go. Three sinks — **in-game console** (the `ns.print`/Terminal
   surface), **stdout/stderr** (the JS console), and an **OTLP endpoint** — any combination
   of which can be active at once.

Built on the **standard OpenTelemetry JavaScript SDK** so it works in the browser, the
Electron renderer, and Node (tests / headless).

---

## 2. Key decisions

| # | Decision | Rationale | Status |
|---|----------|-----------|--------|
| 1 | Use the official `@opentelemetry/*` packages, not a hand-rolled exporter | User preference for standard libraries; must work in browser + Electron + Node. The OTLP/HTTP exporters have documented web support. | **Locked** |
| 2 | v1 signals = **Logs + Metrics + Traces**. | **Changed — traces added at user request** to visualize the script execution chain (top-level → children → grandchildren). Feasible: Bitburner's pid/parent process tree maps onto OTel spans with clean start/end chokepoints (see §5.3). | **Changed — confirm** |
| 3 | Player API namespace = **`ns.telemetry`** (`.debug/.info/.warn/.error`) | **Changed from `ns.log` after review.** `ns.log` collides conceptually with the existing `ns.disableLog`/`enableLog`/`isLogEnabled`/`clearLog`/`getScriptLogs`/`print` family, which all govern the *player-visible tail log*. Telemetry goes to an *external sink* — opposite concept. `ns.telemetry` is collision-free, self-documenting, and pairs with a future `ns.telemetry.counter/gauge`. | **Changed — confirm** |
| 4 | Three **multi-selectable** sinks: **in-game console** (`ns.print`/Terminal), **stdout/stderr** (JS console), **OTLP** (HTTP). Any combination can be on at once. No file sink. | User direction. OTel providers support multiple processors, so fan-out to several sinks is natural. File sink dropped (was Electron-only and the messiest surface). | **Locked (user)** |
| 5 | The OTel SDK is **lazy-loaded** (dynamic `import()`) only when telemetry is enabled; gated by a **runtime** toggle, **not** a compile-time build flag | Keeps the SDK out of the initial bundle/hot path for players who never enable it, while avoiding the CI-matrix / "works on my build" cost of two build variants. The lazy chunk already gives the "zero cost when off" property a build flag would. | **Decided — confirm** |
| 6 | Telemetry is **opt-in, off by default**; each signal (logs / metrics / traces) independently toggleable | Privacy + zero overhead. Telemetry that phones home must never be silent/default-on. Traces are high-churn, so a separate toggle matters. | **Strong recommendation** |

---

## 3. Background: relevant Bitburner architecture

Findings from a code survey, verified against the `otlp` branch.

### Engine / tick loop
- `src/engine.tsx` — `Engine` object. `Engine.start()` (`:403`) is a self-rescheduling
  `setTimeout` loop running every `CONSTANTS.MilliPerCycle` (200ms = one cycle;
  `Constants.ts:19`).
- `Engine.updateGame(numCycles)` (`:76`) advances per-tick state.
- `Engine.Counters` (`:139`, e.g. `autoSaveCounter: 300`) + `Engine.checkCounters()`
  (`:169`) is the established "every N cycles" pattern. **Hook for the metrics flush** (or
  just let the OTel `PeriodicExportingMetricReader` own its own interval — see §5.1).
- `GameCycleEvents` EventEmitter (`:69`) fires each advancing cycle.

### Player state (metric sources)
- `src/PersonObjects/Player/PlayerObject.ts` — the `Player` singleton.
- Money funnels through `PlayerObjectGeneralMethods.ts`: `gainMoney`, `loseMoney`,
  `recordMoneySource` (`:244`) — the hook for an income counter, tagged by source.
- Skills/exp, karma, hp live on the PlayerObject.

### NS API
- `src/NetscriptFunctions.ts` — root `ns` assembled as `InternalAPI<NSFull>` (`:147`);
  sub-namespaces mounted as properties (`gang`, `go`, …).
- Curried functions: `(ctx: NetscriptContext) => (...args) => result`.
- **`ctx.workerScript` accessors (verified):** `ws.pid`, `ws.name` (filename getter →
  `scriptRef.filename`), `ws.hostname` (server getter → `scriptRef.server`), and
  `ws.scriptRef.args`. **There is no `ws.filename`/`ws.server`/`ws.args`** — use the
  getters above for auto-tagging.
- Sub-namespace template: `src/NetscriptFunctions/Go.ts:43`.
- Type defs (hand-authored source of truth): `src/ScriptEditor/NetscriptDefinitions.d.ts`
  (`@nsdefs`); existing log family at `:7666`–`:7756`.
- Docs generated via `npm run doc`; **the generated markdown is committed and CI-gated**
  (see §8).
- RAM costs: `src/Netscript/RamCostGenerator.ts` — `RamCosts: RamCostTree<NSFull>`
  (`:545`). Mismatch is caught **twice**: a tsc type error (missing entries) and a runtime
  jest test (`test/jest/Netscript/RamCalculation.test.ts`) that walks the ns tree and
  throws "Missing ramcost for …". The new namespace must have matching `0`-cost entries.

### Script process model (for tracing)
- Every script is a `WorkerScript` (`src/Netscript/WorkerScript.ts:20`) with a unique
  `pid` (`:61`). It has **no parent object reference**; the parent linkage is the parent's
  **numeric pid** on the backing `RunningScript.parent` (`RunningScript.ts:60`, `0` = no
  parent), set in `runScriptFromScript` (`NetscriptWorker.ts:349`).
- **Span-start chokepoint:** `createAndAddWorkerScript(runningScript, server, parent?)`
  (`NetscriptWorker.ts:105`) is the single place where both the **parent** WorkerScript
  and the **newly-created child** WorkerScript are in scope at once (child built at `:138`).
- **Span-end chokepoint:** `stopAndCleanUpWorkerScript(ws)` (`killWorkerScript.ts:56`) —
  every termination path (natural exit `:148`, kill, error `:153`) funnels through it;
  idempotent. The reliable "this script ended" hook.
- **PID/running set:** pids from `generateNextPid()` (`Pid.ts:6`); global
  `workerScripts = Map<pid, WorkerScript>` (`WorkerScripts.ts:4`).
- **`ns.spawn`** (`NetscriptFunctions.ts:646`) kills the caller, then launches the child
  from a `setTimeout` after a delay — the parent object is already removed from
  `workerScripts` but its reference (and thus stored span context) is still passed through,
  so child→parent linkage survives.
- **Trace roots** (launched with no parent): Terminal `run` (`commands/runScript.ts:73`),
  autoexec / restored scripts on load (`NetscriptWorker.ts:259`), tail relaunch
  (`LogBoxManager.tsx:251`), Script Editor run button, Singularity after-reset.

### Existing logging
- In-game tail log (`ns.print` → `RunningScript.log()`), Terminal (`ns.tprint`), Recently
  Killed Scripts, toasts (`SnackbarEvents`), dialogs (`dialogBoxCreate`).
- `console.*` ad hoc. **No central app-side logger or log-level enum today** — we add one.
- Uncaught script errors: hook the existing path at
  `src/utils/helpers/exceptionAlert.tsx` (imported by `engine.tsx:34`). *(Not
  `ErrorHelper.ts` — corrected from the first draft.)*
- The **in-game console sink** routes log records to the same surfaces `ns.print`/
  `ns.tprint` use: a script's tail log (`RunningScript.log()`) for script-originated
  records and the Terminal (`Terminal.print/warn/error`) for engine records.

### Settings UI
- `src/GameOptions/ui/GameOptionsRoot.tsx` — `OptionsTabName` union (`:13`) + `tabs`
  record (`:31`). **The sidebar is NOT data-driven off `tabs`** — also add a `<SideBarTab>`
  in `GameOptionsSidebar.tsx` (`:122`–`:128`). So a new tab = three edits.
- Control patterns: `OptionSwitch` (has a `disabled` prop), `RemoteAPIPage.tsx`
  (validated text field — ideal endpoint-URL template), `OptionsSlider`, MUI `Select`.
- Persistence: `src/Settings/Settings.ts` (flat defaults), loaded via
  `SettingsUtils.ts` `loadSettings` (a blind `Object.assign(Settings, save, …)` at
  `:113`), serialized in `SaveObject.ts:184` (`JSON.stringify(Settings)`).

### Build / runtime constraints
- Webpack 5; lean deps; bundle size matters to the community.
- `src/` runs in **browser + Electron renderer** — **no Node APIs**. `fetch` available.
- **Electron detection idiom (verified)**, used only to set the `deployment.environment`
  resource attribute: `navigator.userAgent.toLowerCase().includes(" electron/")` — must
  lowercase (real UAs say `"Electron/"`). Used at `Electron.tsx:55`,
  `NetscriptFunctions/UserInterface.ts:205`, `utils/ErrorHelper.ts:101`.

---

## 4. Architecture

### 4.1 Component overview

```
                       ┌─────────────────────────────────────────────┐
                       │              Telemetry module                │
                       │            (src/Telemetry/*)                  │
  Engine tick ───────▶ │  EngineMetrics (observable gauges/counters)  │
  recordMoneySource ─▶ │        │                                     │
  ns.telemetry.* ────▶ │  Logger facade ──┬─▶ MeterProvider ──┐       │
  engine logs ───────▶ │                  └─▶ LoggerProvider ─┤       │
                       │                                       ▼       │
                       │     Sinks (any combination, fan-out):         │
                       │       • in-game console (ns.print/Terminal)   │
                       │       • stdout/stderr (JS console)            │
                       │       • OTLP (HTTP) ──────────────────────────┼─▶ collector :4318
                       └─────────────────────────────────────────────┘
                                          ▲ reads
                              Settings (enabled, level, sink, endpoint, …)
```

### 4.2 New module: `src/Telemetry/`

A single, well-bounded module that owns all OTel wiring. **Nothing else in the codebase
imports `@opentelemetry/*` directly** — they call this facade. This isolation is the
mitigation for the OTel logs SDK being experimental (see §9): churn stays contained here.

| File | Responsibility |
|------|----------------|
| `Telemetry.ts` | Public facade + lifecycle: `initTelemetry()`, `shutdownTelemetry()`, `reconfigureTelemetry()`. Lazy-loads the SDK on first enable. **Holds the provider references directly — does NOT call `logs.setGlobalLoggerProvider` / `metrics.setGlobalMeterProvider`** (those register only once per process and would break reconfigure). |
| `TelemetryLogger.ts` | `logEvent(level, body, attributes)` for engine + NS API. Maps level → `SeverityNumber` (DEBUG=5, INFO=9, WARN=13, ERROR=17). **Rate-check and level-check happen FIRST, before any record/attribute allocation.** No-ops when disabled. |
| `EngineMetrics.ts` | Observable instruments + `collect()` callbacks reading `Player`/server state. |
| `ScriptTracer.ts` | Owns the `Map<pid, Span>`. `onScriptStart(childWs, parentWs?)` opens a span (parented to the launcher's span when present), `onScriptEnd(ws)` ends it, and both emit the `script.start`/`script.exit` log backbone. Keeps OTel out of `WorkerScript`. |
| `TelemetrySinks.ts` | Builds the **array** of log/metric/trace processors/readers for every **enabled** sink (fan-out). Derives per-signal OTLP URLs (`/v1/logs`, `/v1/metrics`, `/v1/traces`). |
| `exporters/GameConsoleLogExporter.ts` | Custom `LogRecordExporter` → in-game surfaces: a script's tail log for script-originated records (via the worker context on the record), the Terminal otherwise; severity maps to `print`/`warn`/`error`. Logs only. |
| `exporters/StdioLogExporter.ts` | Custom `LogRecordExporter` → JS console: `console.error` for ERROR severity, `console.log` otherwise (so logs hit stdout and errors hit stderr under Node). Metrics/traces on this sink use OTel's built-in `ConsoleMetricExporter`/`ConsoleSpanExporter`. |
| `TelemetryConfig.ts` | Normalizes `Settings.*`; level enum mapping; resource attributes. |
| `index.ts` | Barrel exports. |

### 4.3 Packages to add

Core (small, browser-safe): `@opentelemetry/api`, `@opentelemetry/api-logs`.

SDK + exporters (lazy-loaded): `@opentelemetry/sdk-logs`, `@opentelemetry/sdk-metrics`,
`@opentelemetry/sdk-trace-base` (portable `BasicTracerProvider` + `BatchSpanProcessor` +
`ConsoleSpanExporter`; we manage context manually via the pid map, so we don't need the
web/node context-manager variants), `@opentelemetry/exporter-logs-otlp-http`,
`@opentelemetry/exporter-metrics-otlp-http`, `@opentelemetry/exporter-trace-otlp-http`,
`@opentelemetry/resources`, `@opentelemetry/semantic-conventions`.

**Version pinning (review finding — do not hand-wave):** the packages split across two
release lines:
- **Stable** (1.x/2.x): `api`, `sdk-metrics`, `sdk-trace-base`, `resources`,
  `semantic-conventions`.
- **Experimental** (0.x): `api-logs`, `sdk-logs`, `exporter-logs-otlp-http`,
  `exporter-metrics-otlp-http`, `exporter-trace-otlp-http`. (Trace is the most mature
  signal, but its OTLP-HTTP exporter still ships from the experimental line — pin it too.)

A stable release pairs with a *specific* experimental release. **Pin the experimental
0.x packages to exact versions** (not caret), bump them together, and verify the lockfile
dedupes `@opentelemetry/api` to a single version (it's a peer dep). All exporters listed
have documented browser/web support (fetch/XHR) and run under Node.

### 4.4 Lifecycle
- Game load → `initTelemetry()` once. If disabled, does nothing and the SDK chunk is never
  fetched.
- Settings change → `reconfigureTelemetry()`: lazy-import SDK if needed, **shut down old
  providers, build new ones** (no global registration, so this is clean).
- Game unload / pre-save → `shutdownTelemetry()` → `forceFlush()` then `shutdown()`.
  **Browser caveat:** fetch/XHR are usually killed on `unload`, so the final flush is
  genuinely best-effort. Delivery relies on the periodic batch/export intervals, not the
  unload flush. (We will not depend on `sendBeacon` in v1 — it can't set OTLP auth headers.)

### 4.5 Resource attributes (verified: `resourceFromAttributes`)
- `service.name = "bitburner"`, `service.version` = game version,
  `bitburner.bitnode` = current BitNode, `deployment.environment` = `electron`|`browser`.
- **Privacy guarantee (stated explicitly):** resource attributes contain **nothing
  personally identifying**. Data is sent only to the endpoint the player configures;
  Bitburner itself never receives it.

---

## 5. Layer 1 — Engine telemetry (logs + metrics)

### 5.1 Metrics

**Observable** instruments (`createObservableGauge` + `addCallback`/`observe`,
`createObservableCounter`) collected by a `PeriodicExportingMetricReader`
(`exportIntervalMillis`, default 10s). Reading state on the exporter's schedule decouples
it from the 200ms tick. **Use a single instrument + an attribute rather than baking names
into the metric** (OTel best practice).

| Metric | Type | Attributes | Source |
|--------|------|-----------|--------|
| `bitburner.player.money` | gauge | — | `Player.money` |
| `bitburner.player.skill` | gauge | `skill=hacking\|strength\|…` | per-skill level |
| `bitburner.player.karma` | gauge | — | `Player.karma` |
| `bitburner.player.hp.current` / `.max` | gauge ×2 | — | HP (split, not one gauge) |
| `bitburner.player.playtime` | counter | — | total playtime (ms) |
| `bitburner.scripts.running` | gauge | — | live `WorkerScript` count |
| `bitburner.scripts.income_rate` | gauge | — | aggregate script income ($/s) |
| `bitburner.servers.ram_used` / `.ram_total` | gauge ×2 | — | summed owned servers (GB) |
| `bitburner.player.income` | counter | `source=hacking\|corp\|hacknet\|…`, `bitnode` | hooked from `recordMoneySource` |
| `bitburner.faction.reputation` | gauge | `faction` | per-faction rep |

All tagged with `bitnode`. **Trimmed from the first draft:** dropped per-skill `exp`
(redundant with skill level for dashboards) and `bitnode.multipliers` (large, low value).
~8 instruments. YAGNI — final list trimmable in review.

### 5.2 Engine logs
A small fixed set through `TelemetryLogger`: game loaded / save / autosave (info),
BitNode entered / destroyed (info), uncaught script errors (error — hook
`src/utils/helpers/exceptionAlert.tsx`), optional aug-installed / faction-joined (info).
These are **additive** — they do not change the existing in-game log/terminal/toast UX.

### 5.3 Traces — the script execution chain

**Goal:** visualize which top-level script launched which children, and so on — the full
process tree across `run`/`exec`/`spawn`.

**Model:** one span per script, automatically (engine-side; no NS API needed).

- **Open** at `createAndAddWorkerScript` (`NetscriptWorker.ts:105`): call
  `ScriptTracer.onScriptStart(childWs, parentWs?)`.
  - Span name: the script filename. Attributes: `script.pid`, `script.filename`,
    `script.server`, `script.args`, `script.thread_count`, `bitnode`,
    `script.launch_method` (`run`/`exec`/`spawn`/`root`).
  - Parent context: look up `parentWs.pid` in the `Map<pid, Span>`. Found → child span via
    `tracer.startSpan(name, opts, trace.setSpan(ROOT_CONTEXT, parentSpan))` (use
    `ROOT_CONTEXT` explicitly — we manage context by the pid map, not OTel's context
    manager), sharing the launcher's `traceId`. Absent → `startSpan` with no parent context
    → **root span, new trace** (terminal run, autoexec, restored scripts, tail relaunch,
    editor run, after-reset).
- **Close** at `stopAndCleanUpWorkerScript` (`killWorkerScript.ts:56`): call
  `ScriptTracer.onScriptEnd(ws)` → set status (ok / error from the script's exit) and
  `span.end()`, then drop it from the map. `BatchSpanProcessor` exports ended spans on its
  interval.
- **`ns.spawn`**: the new script is modeled as a **child of the spawning script** (parent
  reference still flows through `runScriptFromScript`), so a spawn chain reads as a lineage.

**The long-running-script reality (the user's concern, addressed):**
- Spans export **individually when each ends**, and the backend assembles a trace from
  spans arriving over time by `traceId`. So you do **not** wait for the root to end to see
  the chain — every child that completes shows up immediately under the shared trace.
- A long-running root (a days-long orchestrator) that spawns short-lived hack/grow/weaken
  children: all those children export continuously; you watch the chain grow in real time.
  Only the root's own span box (and total duration) is pending until it finally ends.
- **Backbone for never-ending scripts:** `onScriptStart`/`onScriptEnd` also emit
  `script.start` / `script.exit` **log events** carrying `{pid, parentPid, traceId,
  spanId, filename, server, args}`. These export immediately, independent of span
  completion — so the full process tree is always queryable from logs even if no span ever
  closes (game closed, script truly immortal).
- On clean shutdown, `ScriptTracer` best-effort `end()`s open spans with an `interrupted`
  status so they flush. Spans open at an unclean close are lost (logs backbone covers it).

**Controls (traces are high-churn):**
- Independently toggleable (`TelemetryTracesEnabled`), off unless telemetry is on.
- **Sampling**: a configurable head sampler (parent-based + ratio, default e.g. 100%) so a
  player spawning thousands of scripts/sec can dial it down. Sampling decision is made at
  root and inherited by children, so sampled traces stay whole.
- Span churn is cheap, but the open-span map is bounded by concurrent live scripts (which
  in-game RAM already bounds).
- Long-lived root spans carry only fixed start attributes — **no per-event
  `span.addEvent(...)`** (events accumulate in the open span's memory until it ends).

> **No NS API for tracing in v1.** Tracing is automatic engine instrumentation. A future
> `ns.telemetry.span(...)` for custom in-script spans is a v2 candidate.

---

## 6. Layer 2 — Player NS API (`ns.telemetry`)

### 6.1 Surface

```typescript
ns.telemetry.debug(message: string, attributes?: Record<string, string | number | boolean>): void;
ns.telemetry.info(message: string, attributes?: ...): void;
ns.telemetry.warn(message: string, attributes?: ...): void;
ns.telemetry.error(message: string, attributes?: ...): void;
```

Semantics:
- Emits an OTel log record: matching `SeverityNumber`, `message` as `body`, optional
  attributes.
- **Auto-tagged** from the worker script (verified accessors): `script.pid = ws.pid`,
  `script.filename = ws.name`, `script.server = ws.hostname`,
  `script.args = JSON.stringify(ws.scriptRef.args)`.
- Records below the configured level are dropped before construction.
- **RAM cost: 0** (consistent with `print`/`tprint`). Observability shouldn't be gated by
  RAM. Because 0 RAM = no natural backpressure, the rate cap (below) is the only guard.

### 6.2 Relationship to existing log functions
This is a **separate external-observability channel**, unrelated to the tail-log family
(`ns.print`, `ns.disableLog`, `ns.getScriptLogs`, …). The `ns.telemetry` name was chosen
specifically to avoid implying any connection to those. `ns.print` is unchanged.

### 6.3 Wiring
- New `src/NetscriptFunctions/Telemetry.ts` → `NetscriptTelemetry(): InternalAPI<NSTelemetry>`
  (follows `Go.ts`). Each method validates args via `helpers.string`/`helpers.object`,
  then calls `TelemetryLogger.logEvent(...)` with the worker context.
- Mount `telemetry: NetscriptTelemetry()` in `NetscriptFunctions.ts`.
- Add `NSTelemetry` interface + `readonly telemetry: NSTelemetry;` to
  `NetscriptDefinitions.d.ts` with TSDoc + `@example`.
- Add `telemetry: { debug: 0, info: 0, warn: 0, error: 0 }` to `RamCosts`.
- `npm run doc` and **commit the regenerated markdown** (CI-gated).

### 6.4 Abuse / safety (concrete, not a TODO)
- **Rate cap, checked first:** before constructing any record or coercing attributes,
  `TelemetryLogger` checks a per-script token bucket. **Default: 100 records/sec/script**
  (tunable constant); over-limit calls are dropped and a single throttled warning is
  emitted per script per window. This is the only thing between a player's `while(true)`
  and a meltdown.
- Attribute values coerced to primitives and size-capped (e.g. 1KB/value, max N keys).
- No per-script flush hook is needed: in-flight records flush on the batch interval and on
  `shutdownTelemetry()`. Script death does not drop already-queued records. (Intentional.)

---

## 7. Layer 3 — Settings & configuration

### 7.1 New settings (`src/Settings/Settings.ts`)
```
TelemetryEnabled: boolean          // default false  (master toggle)
TelemetryLogLevel: OtelLogLevel    // default INFO
// Sinks — independently toggleable; any combination may be active at once:
TelemetrySinkGameConsole: boolean  // default false — route logs to ns.print/Terminal
TelemetrySinkStdio: boolean        // default true  — JS console (stdout/stderr)
TelemetrySinkOtlp: boolean         // default false — OTLP/HTTP exporter
TelemetryOtlpEndpoint: string      // default "http://localhost:4318"  (BASE url)
TelemetryMetricsEnabled: boolean   // default true (when telemetry on)
TelemetryTracesEnabled: boolean    // default true (when telemetry on) — script-chain spans
TelemetryTraceSampleRatio: number  // default 1.0, clamped 0..1
TelemetryExportIntervalMs: number  // default 10000, clamped
```
Enums in `SettingEnums.ts`: `OtelLogLevel` (DEBUG|INFO|WARN|ERROR). (No sink enum — sinks
are independent booleans so they can combine.)

> The in-game console sink applies to **logs only** (a stream of metrics/spans in the
> Terminal isn't useful). Stdout/stderr and OTLP carry all enabled signals.

**OTLP URL handling (review finding):** `TelemetryOtlpEndpoint` is the **base** URL. The
`url` constructor option of the HTTP exporters is treated as the *full* signal path and is
**not** auto-suffixed. `TelemetrySinks` must derive `${base}/v1/logs`,
`${base}/v1/metrics`, and `${base}/v1/traces` itself.

Load/sanitize in `SettingsUtils.ts` `loadSettings` (the merge is a blind `Object.assign`,
so validate defensively):
- `isValidOtlpEndpoint(url)` — parseable http/https URL (modeled on
  `isValidConnectionHostname`/`Port`).
- Clamp `TelemetryExportIntervalMs` and `TelemetryTraceSampleRatio`; coerce unknown
  `OtelLogLevel` values to default; **coerce all the boolean toggles** including the three
  sink booleans (nothing else type-checks booleans on load).

### 7.2 Settings UI — new "Telemetry" tab
- Add `"Telemetry"` to `OptionsTabName` + `tabs` (`GameOptionsRoot.tsx`) **and** a
  `<SideBarTab>` in `GameOptionsSidebar.tsx`.
- New `src/GameOptions/ui/TelemetryPage.tsx`:
  - `OptionSwitch` — **Enable telemetry** (master; disables the rest when off).
  - `Select` — **Log level**.
  - **Sinks** (three independent `OptionSwitch`es — any combination):
    - **In-game console** (`ns.print`/Terminal).
    - **Stdout / stderr** (JS console).
    - **OTLP endpoint** — reveals the endpoint field + Test Connection when on.
  - `TextField` (validated, `RemoteAPIPage` pattern) — **OTLP endpoint** (shown when the
    OTLP sink is on). **Warn on non-localhost/non-private endpoints** ("This sends your
    game data to an external server"). One-line **CORS hint** under the field.
  - `OptionSwitch` — **Export game metrics**. Number field — **Export interval (s)**.
  - `OptionSwitch` — **Trace script execution chain**. `OptionsSlider` — **Trace sample
    rate** (0–100%, shown when traces on; warn that 100% is heavy for big script fleets).
  - **Test connection** button (shown when the OTLP sink is on) — best-effort POST +
    result toast. *In-scope*: the #1 failure mode is "configured an endpoint, saw nothing."
  - A short sentence stating **what is collected** and that it leaves the game only via the
    OTLP sink, to the endpoint you configure.
- Any change → write `Settings.*` and call `reconfigureTelemetry()`.

### 7.3 Sinks
All sinks are independent and combine by fanning out to multiple processors/readers on
each provider. The in-game console sink is logs-only.

| Sink | Logs | Metrics | Traces | Browser | Electron | Node |
|------|------|---------|--------|---------|----------|------|
| In-game console | custom `GameConsoleLogExporter` → tail log / Terminal (by severity) | — | — | ✅ | ✅ | ✅ |
| Stdout / stderr | custom `StdioLogExporter` (`console.log` / `console.error`) | `ConsoleMetricExporter` | `ConsoleSpanExporter` | ✅ | ✅ | ✅ |
| OTLP | `OTLPLogExporter` (http/json) | `OTLPMetricExporter` (http/json) | `OTLPTraceExporter` (http/json) | ✅ | ✅ | ✅ |

Console-type exporters use `SimpleLogRecordProcessor` (immediate); OTLP uses
`BatchLogRecordProcessor`. With no sink enabled, telemetry produces nothing (and the UI
notes that).

---

## 8. Testing & CI

CI jobs that must stay green (verified in `.github/workflows/ci.yml`): **`build`** (tsc +
webpack), **`lint`** (`--max-warnings 0`), **`prettier`**, **`test`** (jest), and
**`check-docs`** (runs `npm run doc`, fails if `git status` is dirty → **generated docs
must be committed**).

- **Unit (Jest):** config normalization + validation; level filtering; rate cap (drop +
  throttled warn); no-op when disabled; attribute coercion/size caps;
  `EngineMetrics.collect()` against a mock `Player`; `TelemetrySinks` builds one
  processor/reader per **enabled** sink and an empty set when all are off; the in-game
  console sink is logs-only.
- **NS API:** `ns.telemetry.*` produces records with correct severity + script attributes;
  RAM cost 0; the RAM-calculation jest test auto-discovers and exercises the new methods.
- **Tracing:** a child launched via `runScriptFromScript` gets a span parented to the
  launcher's span (shared `traceId`); a terminal/autoexec launch is a root; `onScriptEnd`
  closes the span and removes it from the pid map (no leak across many start/stop cycles);
  the `script.start`/`script.exit` log events fire with the right ids; sampling decision is
  inherited by children; spawn chains link correctly.
- **Lazy import under ts-jest:** dynamic-importing ESM-heavy OTel packages in Node tests
  may need `transformIgnorePatterns`/`moduleNameMapper` tweaks — budget for it.
- **Integration (manual):** local `otel/opentelemetry-collector` on `:4318`; confirm logs
  + metrics + traces arrive (JSON OTLP). Stdout/stderr sink in dev tools (errors on
  `console.error`). In-game console sink shows log records in the Terminal/tail. Confirm
  multiple sinks active at once fan out correctly.
- **Bundle gate:** `npm run analyze-bundle` — **hard requirement: initial-bundle delta for
  telemetry-off users ≈ 0 KB** (SDK lands in a lazy chunk). Put the number in the PR.

---

## 9. Risks & open questions

1. **OTel logs are experimental (0.x).** Breaking changes can land between minors. The
   `src/Telemetry/` facade is the containment boundary. Metrics + traces are stable-ish;
   logs is the churn surface.
2. **Bundle size** — ~9 deps now; mitigated by lazy chunk; proven by the bundle gate (§8).
3. **Browser OTLP needs CORS** — collector must allow the game origin. Surfaced in-UI.
4. **Unload flush is best-effort** in the browser (§4.4) — rely on periodic export.
5. **Trace-specific:** long-running / immortal root spans never export until they end (and
   are lost on unclean close) — mitigated by the `script.start`/`script.exit` log backbone
   (§5.3); open-span map bounded by live-script count; high churn handled by sampling.
6. **Save/version compat** — additive, default-safe fields; old saves load fine; load-time
   validation guards tampered values.
7. **Player-defined metrics & custom spans deferred** — confirm acceptable for v1.

---

## 10. Phased implementation plan

### Phase 0 — Scaffolding & deps
- Add `@opentelemetry/*` deps (experimental pinned exact); verify lockfile dedupes `api`,
  lint/build pass, and confirm the lazy-chunk / ~0 KB bundle delta **with a number**.
- Create `src/Telemetry/` facade + config types as no-op stubs.
- Add settings fields + enums + load-time validation (no UI). Telemetry off by default.
- **Exit:** game builds/runs identically; telemetry inert; bundle delta ≈ 0.

### Phase 1 — Core + stdout/stderr & in-game console sinks
- `Telemetry.ts` lifecycle (lazy load, init/reconfigure/shutdown, no global registration).
- `TelemetryLogger` + level filter + **rate cap**.
- Multi-sink fan-out in `TelemetrySinks`; `StdioLogExporter` and `GameConsoleLogExporter`.
- Wire `initTelemetry()`/`shutdownTelemetry()` into load/unload.
- **Exit:** enabling telemetry logs structured events to the JS console and/or the in-game
  Terminal, per the sink toggles; multiple sinks can be on together.

### Phase 2 — Engine metrics
- `EngineMetrics` observable instruments + `collect()`; `PeriodicExportingMetricReader`
  (`ConsoleMetricExporter` first); hook `recordMoneySource` for the income counter.
- **Exit:** metrics appear on stdout on the interval.

### Phase 3 — Tracing (script execution chain)
- `ScriptTracer` with the `Map<pid, Span>`; hook `onScriptStart` into
  `createAndAddWorkerScript` and `onScriptEnd` into `stopAndCleanUpWorkerScript`.
- Parent/root resolution, `script.launch_method` attribute, sampler, and the
  `script.start`/`script.exit` log backbone. Console span exporter first.
- Best-effort end-open-spans on shutdown. `WorkerScript` stays free of OTel imports.
- **Exit:** running a script that `exec`s children produces a parented trace tree in the
  console; roots vs children are correct; no span-map leak.

### Phase 4 — OTLP sink
- OTLP log + metric + trace HTTP exporters; per-signal URL derivation; endpoint from
  settings.
- **Exit:** logs + metrics + traces arrive at a local collector; the script chain is
  visible in a trace UI (e.g. Jaeger/Tempo).

### Phase 5 — `ns.telemetry` NS API
- `NetscriptFunctions/Telemetry.ts`, mount, `NSTelemetry` type, RAM costs (0), rate cap,
  regenerate + commit docs.
- **Exit:** a player script's `ns.telemetry.info(...)` flows through the pipeline.
  **Re-verify zero overhead when telemetry is off** (this is the player-reachable hot path).

### Phase 6 — Settings UI
- `TelemetryPage.tsx` + tab/sidebar/page wiring; live `reconfigureTelemetry()`;
  the three sink toggles, conditional OTLP fields, trace toggle + sample-rate slider;
  endpoint validation + external-endpoint warning + CORS hint; Test Connection button.
- **Exit:** players configure everything (sinks, level, endpoint, metrics, traces) from
  options.

### Phase 7 — Tests, docs, polish
- Unit + integration tests; in-game/markdown docs; bundle re-check; changelog entry.
- **Exit:** CI green (build/lint/prettier/test/check-docs), docs committed, ready for PR.

---

## 11. Out of scope (v1)
- Player-defined custom metrics (`ns.telemetry.counter/gauge`) and custom in-script spans
  (`ns.telemetry.span`) — v2 candidates, same namespace.
- Auto-instrumentation of individual NS calls as spans (e.g. a span per hack/grow/weaken).
  v1 tracing is one span **per script**, not per NS call.
- Bundled collector / prebuilt dashboards.

---

## 12. Review outcomes

Three subagents reviewed the first draft. No feasibility blockers; the package list and
architecture were confirmed correct against current OTel JS docs. Changes folded in:

- **API rename `ns.log` → `ns.telemetry`** (naming collision with the existing tail-log
  family — flagged as a blocker by the API/UX reviewer).
- **OTLP per-signal URL derivation** (`/v1/logs`, `/v1/metrics` are not auto-appended to a
  base `url`).
- **No global provider registration** — hold provider refs so `reconfigure` works.
- **Exact version pins for experimental 0.x packages**; dedupe `@opentelemetry/api`.
- **Corrected accessors** (`ws.pid/name/hostname`, `ws.scriptRef.args`), **corrected error
  hook path** (`exceptionAlert.tsx`), **lowercased Electron UA check**.
- **Single-instrument metrics + attributes** (skill/income); dropped exp & multipliers;
  split HP; added faction rep.
- **Concrete rate cap** (100/sec/script, checked before allocation).
- **CI specifics** (named jobs; generated docs committed; ts-jest transform caveat).
- **Sidebar is a separate edit**; **boolean coercion** on settings load.
- **Decisions added:** runtime opt-in (not compile-time flag); ~0 KB bundle gate; privacy
  guarantees + external-endpoint warning + CORS hint; Test Connection promoted to in-scope.

### Post-review user direction
- **Traces added to v1** (§5.3) — script-execution-chain tracing, one span per script,
  with the `script.start`/`script.exit` log backbone to handle long-running/immortal roots.
- **Sink model reworked**: three independent, **multi-selectable** sinks — in-game console
  (`ns.print`/Terminal), stdout/stderr (JS console), and OTLP. **File sink dropped.**
- **Upstream/maintainer discussion removed** from the plan — out of scope for the design.
