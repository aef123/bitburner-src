# OpenTelemetry Support for Bitburner — Design & Implementation Plan

**Status:** Draft, revised after subagent review. No implementation until approved.
**Target branch:** `otlp` (current) → PR into `dev`.

> **Revision note:** This plan was reviewed by three independent subagents (OpenTelemetry
> correctness, Bitburner codebase fit, and API/UX & scope). Their findings are folded in
> below; a summary of changes is in [§12 Review outcomes](#12-review-outcomes).

---

## 1. Goal

Add OpenTelemetry support to Bitburner in three layers:

1. **Engine telemetry** — the game engine emits structured **logs** and periodic
   **metrics** (player money, stats, etc.).
2. **Player NS API** — script authors can emit structured logs from their own scripts.
3. **Configuration** — a settings page section to enable telemetry, set the log level,
   and choose where signals go (console, file, or an OTLP endpoint).

Built on the **standard OpenTelemetry JavaScript SDK** so it works in the browser, the
Electron renderer, and Node (tests / headless).

---

## 2. Key decisions

| # | Decision | Rationale | Status |
|---|----------|-----------|--------|
| 1 | Use the official `@opentelemetry/*` packages, not a hand-rolled exporter | User preference for standard libraries; must work in browser + Electron + Node. The OTLP/HTTP exporters have documented web support. | **Locked** |
| 2 | v1 signals = **Logs + Metrics**. Traces deferred. | Matches the goal. Tracing across the 200ms tick loop adds context-propagation complexity with unclear payoff. | Default — confirm |
| 3 | Player API namespace = **`ns.telemetry`** (`.debug/.info/.warn/.error`) | **Changed from `ns.log` after review.** `ns.log` collides conceptually with the existing `ns.disableLog`/`enableLog`/`isLogEnabled`/`clearLog`/`getScriptLogs`/`print` family, which all govern the *player-visible tail log*. Telemetry goes to an *external sink* — opposite concept. `ns.telemetry` is collision-free, self-documenting, and pairs with a future `ns.telemetry.counter/gauge`. | **Changed — confirm** |
| 4 | **File** sink is **Electron-only**; in browser it's disabled with a tooltip | Browsers can't write arbitrary files; Electron can via the IPC bridge. | Default — confirm |
| 5 | The OTel SDK is **lazy-loaded** (dynamic `import()`) only when telemetry is enabled; gated by a **runtime** toggle, **not** a compile-time build flag | Keeps the SDK out of the initial bundle/hot path for players who never enable it, while avoiding the CI-matrix / "works on my build" cost of two build variants. The lazy chunk already gives the "zero cost when off" property a build flag would. | **Decided — confirm** |
| 6 | Telemetry is **opt-in, off by default** | Privacy + zero overhead. Telemetry that phones home must never be silent/default-on. | **Strong recommendation** |
| 7 | **Maintainer buy-in on the dependency footprint is a Phase 0 gate** | Adding ~8 runtime deps to a dependency-conservative project is the top acceptance risk. Confirm in principle *before* building Phases 1–7. | **Process — recommended** |

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

### Existing logging
- In-game tail log (`ns.print` → `RunningScript.log()`), Terminal (`ns.tprint`), Recently
  Killed Scripts, toasts (`SnackbarEvents`), dialogs (`dialogBoxCreate`).
- `console.*` ad hoc. **No central app-side logger or log-level enum today** — we add one.
- Uncaught script errors: hook the existing path at
  `src/utils/helpers/exceptionAlert.tsx` (imported by `engine.tsx:34`). *(Not
  `ErrorHelper.ts` — corrected from the first draft.)*
- Electron main uses `electron-log`.

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
- **Electron detection idiom (verified):** `navigator.userAgent.toLowerCase().includes("
  electron/")` — must lowercase (real UAs say `"Electron/"`). Used at `Electron.tsx:55`,
  `NetscriptFunctions/UserInterface.ts:205`, `utils/ErrorHelper.ts:101`.
- Electron file writes: `window.electronBridge.send(channel, data)` (fire-and-forget,
  whitelisted in `electron/preload.js:7`) → `ipcMain.on` handler (`electron/main.js:167`)
  → `fs` helper in `electron/storage.js`. **Path resolution (`app.getPath(...)`) is
  main-process only** — the renderer passes a filename, not an absolute path.

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
                       │     Sinks: Console | File* | OTLP(HTTP) ──────┼─▶ collector :4318
                       │     * File = Electron-only via IPC bridge     │
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
| `TelemetrySinks.ts` | Builds log + metric processors/readers per configured sink. Derives per-signal OTLP URLs (`/v1/logs`, `/v1/metrics`). |
| `FileExporter.ts` | Electron-only exporter implementing the `LogRecordExporter`/`PushMetricExporter` interface; serializes OTLP-JSON and ships over the IPC bridge. Resolves optimistically (bridge is fire-and-forget). Never constructed outside Electron. |
| `TelemetryConfig.ts` | Normalizes `Settings.*`; level enum mapping; resource attributes. |
| `index.ts` | Barrel exports. |

### 4.3 Packages to add

Core (small, browser-safe): `@opentelemetry/api`, `@opentelemetry/api-logs`.

SDK + exporters (lazy-loaded): `@opentelemetry/sdk-logs`, `@opentelemetry/sdk-metrics`,
`@opentelemetry/exporter-logs-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`,
`@opentelemetry/resources`, `@opentelemetry/semantic-conventions`.

**Version pinning (review finding — do not hand-wave):** the packages split across two
release lines:
- **Stable** (1.x/2.x): `api`, `sdk-metrics`, `resources`, `semantic-conventions`.
- **Experimental** (0.x): `api-logs`, `sdk-logs`, `exporter-logs-otlp-http`,
  `exporter-metrics-otlp-http`.

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
TelemetryEnabled: boolean          // default false
TelemetryLogLevel: OtelLogLevel    // default INFO
TelemetrySink: OtelSink            // default CONSOLE  (console | file | otlp)
TelemetryOtlpEndpoint: string      // default "http://localhost:4318"  (BASE url)
TelemetryMetricsEnabled: boolean   // default true (when telemetry on)
TelemetryExportIntervalMs: number  // default 10000, clamped
TelemetryFileName: string          // Electron-only; a filename, NOT an absolute path
```
Enums in `SettingEnums.ts`: `OtelLogLevel` (DEBUG|INFO|WARN|ERROR), `OtelSink`
(CONSOLE|FILE|OTLP).

**OTLP URL handling (review finding):** `TelemetryOtlpEndpoint` is the **base** URL. The
`url` constructor option of the HTTP exporters is treated as the *full* signal path and is
**not** auto-suffixed. `TelemetrySinks` must derive `${base}/v1/logs` and
`${base}/v1/metrics` itself.

Load/sanitize in `SettingsUtils.ts` `loadSettings` (the merge is a blind `Object.assign`,
so validate defensively):
- `isValidOtlpEndpoint(url)` — parseable http/https URL (modeled on
  `isValidConnectionHostname`/`Port`).
- Clamp `TelemetryExportIntervalMs`; coerce unknown enum values to defaults; **coerce the
  boolean toggles** (nothing else type-checks booleans on load).

### 7.2 Settings UI — new "Telemetry" tab
- Add `"Telemetry"` to `OptionsTabName` + `tabs` (`GameOptionsRoot.tsx`) **and** a
  `<SideBarTab>` in `GameOptionsSidebar.tsx`.
- New `src/GameOptions/ui/TelemetryPage.tsx`:
  - `OptionSwitch` — **Enable telemetry** (master; disables the rest when off).
  - `Select` — **Log level**. `Select` — **Sink**.
  - `TextField` (validated, `RemoteAPIPage` pattern) — **OTLP endpoint** (sink = OTLP).
    **Warn on non-localhost/non-private endpoints** ("This sends your game data to an
    external server"). One-line **CORS hint** under the field.
  - `TextField` — **Log file name** (sink = File **and** Electron; else `disabled` with
    tooltip "Available in the desktop app only").
  - `OptionSwitch` — **Export game metrics**. Number field — **Export interval (s)**.
  - **Test connection** button (sink = OTLP) — best-effort POST + result toast.
    *In-scope*: the #1 failure mode is "configured an endpoint, saw nothing."
  - A short sentence stating **what is collected** and that it goes only to the configured
    endpoint.
- Any change → write `Settings.*` and call `reconfigureTelemetry()`.

### 7.3 Sinks
| Sink | Logs exporter | Metrics exporter | Browser | Electron | Node |
|------|---------------|------------------|---------|----------|------|
| Console | `ConsoleLogRecordExporter` | `ConsoleMetricExporter` | ✅ | ✅ | ✅ |
| OTLP | `OTLPLogExporter` (http/json) | `OTLPMetricExporter` (http/json) | ✅ | ✅ | ✅ |
| File | custom `FileExporter` (IPC) | custom `FileExporter` (IPC) | ❌ disabled | ✅ | ✅ |

**File sink (Electron):** add `"otel-write"` to the `send` whitelist in `preload.js`, an
`ipcMain.on("otel-write", …)` handler in `main.js`, and an append helper in `storage.js`
writing OTLP-JSON lines. **Main process resolves the path** (under `app.getPath("logs")` +
the configured filename); the renderer only sends the filename + payload. The bridge is
fire-and-forget, so `FileExporter.export()` resolves optimistically.

---

## 8. Testing & CI

CI jobs that must stay green (verified in `.github/workflows/ci.yml`): **`build`** (tsc +
webpack), **`lint`** (`--max-warnings 0`), **`prettier`**, **`test`** (jest), and
**`check-docs`** (runs `npm run doc`, fails if `git status` is dirty → **generated docs
must be committed**).

- **Unit (Jest):** config normalization + validation; level filtering; rate cap (drop +
  throttled warn); no-op when disabled; attribute coercion/size caps;
  `EngineMetrics.collect()` against a mock `Player`; `FileExporter` never built outside
  Electron.
- **NS API:** `ns.telemetry.*` produces records with correct severity + script attributes;
  RAM cost 0; the RAM-calculation jest test auto-discovers and exercises the new methods.
- **Lazy import under ts-jest:** dynamic-importing ESM-heavy OTel packages in Node tests
  may need `transformIgnorePatterns`/`moduleNameMapper` tweaks — budget for it.
- **Integration (manual):** local `otel/opentelemetry-collector` on `:4318`; confirm logs
  + metrics arrive (JSON OTLP). Console sink in dev tools. File sink in an Electron build.
- **Bundle gate:** `npm run analyze-bundle` — **hard requirement: initial-bundle delta for
  telemetry-off users ≈ 0 KB** (SDK lands in a lazy chunk). Put the number in the PR.

---

## 9. Risks & open questions

1. **Maintainer acceptance (top risk).** ~8 runtime deps into a lean project. Mitigations:
   Phase 0 buy-in conversation, the ~0 KB bundle proof, and the facade isolation. *Open:*
   maintainers' verdict on the dependency footprint — get it before building.
2. **OTel logs are experimental (0.x).** Breaking changes can land between minors. The
   `src/Telemetry/` facade is the containment boundary. Metrics is stable; logs is the
   churn surface.
3. **Bundle size** — mitigated by lazy chunk; proven by the bundle gate (§8).
4. **Browser OTLP needs CORS** — collector must allow the game origin. Surfaced in-UI.
5. **Unload flush is best-effort** in the browser (§4.4) — rely on periodic export.
6. **Save/version compat** — additive, default-safe fields; old saves load fine; load-time
   validation guards tampered values.
7. **Traces & player-defined metrics deferred** — confirm acceptable for v1.

---

## 10. Phased implementation plan

### Phase 0 — Buy-in, scaffolding & deps
- **Gate: maintainer agreement in principle on the dependency footprint** (open a
  discussion/issue). Don't build 1–7 on an unconfirmed premise.
- Add `@opentelemetry/*` deps (experimental pinned exact); verify lockfile dedupes `api`,
  lint/build pass, and confirm the lazy-chunk / ~0 KB bundle delta **with a number**.
- Create `src/Telemetry/` facade + config types as no-op stubs.
- Add settings fields + enums + load-time validation (no UI). Telemetry off by default.
- **Exit:** game builds/runs identically; telemetry inert; bundle delta ≈ 0; maintainers
  on board.

### Phase 1 — Core + console sink
- `Telemetry.ts` lifecycle (lazy load, init/reconfigure/shutdown, no global registration).
- `TelemetryLogger` + level filter + **rate cap** + `ConsoleLogRecordExporter`.
- Wire `initTelemetry()`/`shutdownTelemetry()` into load/unload.
- **Exit:** enabling telemetry logs structured events to the console.

### Phase 2 — Engine metrics
- `EngineMetrics` observable instruments + `collect()`; `PeriodicExportingMetricReader`
  (console first); hook `recordMoneySource` for the income counter.
- **Exit:** metrics appear in console on the interval.

### Phase 3 — OTLP sink
- OTLP log + metric HTTP exporters; per-signal URL derivation; endpoint from settings.
- **Exit:** logs + metrics arrive at a local collector.

### Phase 4 — `ns.telemetry` NS API
- `NetscriptFunctions/Telemetry.ts`, mount, `NSTelemetry` type, RAM costs (0), rate cap,
  regenerate + commit docs.
- **Exit:** a player script's `ns.telemetry.info(...)` flows through the pipeline.
  **Re-verify zero overhead when telemetry is off** (this is the player-reachable hot path).

### Phase 5 — Settings UI
- `TelemetryPage.tsx` + tab/sidebar/page wiring; live `reconfigureTelemetry()`;
  conditional fields; endpoint validation + external-endpoint warning + CORS hint; Test
  Connection button; Electron detection for the file field.
- **Exit:** players configure everything from options.

### Phase 6 — File sink (Electron) — *cuttable*
- IPC channel + main handler (path resolution) + storage append helper; `FileExporter`;
  browser fallback (disabled).
- **Exit:** Electron build writes telemetry to a file.
- *Note:* a reviewer recommended deferring this to v2 to shrink the review surface (it's
  the only Electron-main / custom-exporter piece). **Kept in v1 because the file sink is an
  explicit requirement**, but it's the last phase and can be split into a follow-up PR if
  the maintainers prefer a smaller first PR.

### Phase 7 — Tests, docs, polish
- Unit + integration tests; in-game/markdown docs; bundle re-check; changelog entry.
- **Exit:** CI green (build/lint/prettier/test/check-docs), docs committed, ready for PR.

---

## 11. Out of scope (v1)
- Distributed tracing / spans.
- Player-defined custom metrics (`ns.telemetry.counter/gauge`) — v2 candidate, same
  namespace.
- Auto-instrumentation of NS calls; bundled collector / dashboards.

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
- **Sidebar is a separate edit**; **file path resolved in main process**; **boolean
  coercion** on settings load.
- **Decisions added:** runtime opt-in (not compile-time flag); Phase 0 maintainer buy-in +
  ~0 KB bundle gate; privacy guarantees + external-endpoint warning + CORS hint; Test
  Connection promoted to in-scope.
- **File sink kept in v1** (explicit requirement) but marked cuttable per reviewer concern.
