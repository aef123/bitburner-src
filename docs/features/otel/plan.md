# OpenTelemetry Support for Bitburner — Design & Implementation Plan

**Status:** Draft, under review. No implementation until approved.
**Author:** Initial draft generated for review.
**Target branch:** `otlp` (current) → PR into `dev`.

---

## 1. Goal

Add OpenTelemetry support to Bitburner in three layers:

1. **Engine telemetry** — the game engine emits structured **logs** and periodic
   **metrics** (player money, stats, etc.).
2. **Player NS API** — script authors can emit structured logs from their own scripts
   via a new `ns.log` namespace.
3. **Configuration** — a settings page section to enable telemetry, set the log level,
   and choose where signals go (console, file, or an OTLP endpoint).

Built on the **standard OpenTelemetry JavaScript SDK** so it works in the browser, the
Electron renderer, and Node (tests / headless).

---

## 2. Key decisions

| # | Decision | Rationale | Status |
|---|----------|-----------|--------|
| 1 | Use the official `@opentelemetry/*` packages, not a hand-rolled exporter | User preference for standard libraries; must work in browser + Electron + Node. The OTLP/HTTP exporters have documented web support. | **Locked** |
| 2 | v1 signals = **Logs + Metrics**. Traces deferred. | Matches the stated goal. Tracing across the 200ms tick loop adds context-propagation complexity with unclear payoff for an incremental game. | Default — confirm |
| 3 | Player API = **`ns.log`** with leveled methods. Custom player-defined metrics deferred to a later iteration. | The goal explicitly asks for player *logging*. Metrics for players is a bigger API/RAM surface; ship logging first. | Default — confirm |
| 4 | **File** sink is **Electron-only**; in the pure browser build the file option is disabled with an explanatory tooltip. | Browsers cannot write to arbitrary disk paths. Electron can, via the existing IPC bridge. | Default — confirm |
| 5 | The OTel SDK is **lazy-loaded** (dynamic `import()`) only when telemetry is enabled. | Keeps the SDK out of the hot path and out of the initial bundle for players who never enable it (separate webpack chunk). | Default — confirm |
| 6 | Telemetry is **opt-in, off by default**. | Privacy + zero overhead for players who don't want it. Telemetry that phones home should never be silent or default-on. | **Strong recommendation** |

---

## 3. Background: relevant Bitburner architecture

Findings from a code survey (file:line references current as of the `otlp` branch).

### Engine / tick loop
- `src/engine.tsx` — `Engine` object. `Engine.start()` (`~:403`) is a self-rescheduling
  `setTimeout` loop running every `CONSTANTS.MilliPerCycle` (200ms = one cycle).
- `Engine.updateGame(numCycles)` (`~:76`) advances per-tick state (player work, stocks,
  gang, corp, bladeburner, sleeves, hacknet, running-script times).
- `Engine.Counters` (`~:139`) + `Engine.checkCounters()` (`~:169`) is the established
  pattern for "do something every N cycles" (autosave = 300 cycles, achievements = 5,
  etc.). **This is the hook for a periodic metrics flush.**
- `GameCycleEvents` EventEmitter (`~:69`) fires each advancing cycle.

### Player state (metric sources)
- `src/PersonObjects/Player/PlayerObject.ts` — the `Player` singleton.
- Money mutations funnel through `PlayerObjectGeneralMethods.ts`: `gainMoney`,
  `loseMoney`, `recordMoneySource` (`~:244`). `recordMoneySource` is the natural hook for
  income/expense counters by category.
- Skills / exp live on the PlayerObject.

### NS API
- `src/NetscriptFunctions.ts` — root `ns` object assembled as `InternalAPI<NSFull>`
  (`~:147`). Sub-namespaces mounted as properties (`gang`, `go`, `sleeve`, `corporation`,
  …). Per-script wrapping via `NSProxy`.
- Each function is curried: `(ctx: NetscriptContext) => (...args) => result`.
  `ctx.workerScript` identifies the calling script (pid, filename, server, args).
- Sub-namespace template: `src/NetscriptFunctions/Go.ts` — `export function
  NetscriptGo(): InternalAPI<NSGo> { return { ... } }`.
- Type defs (hand-authored, source of truth): `src/ScriptEditor/NetscriptDefinitions.d.ts`
  (aliased `@nsdefs`). The `NS` interface lives here with TSDoc `@remarks`/`@example`.
- Docs are **generated** from the `.d.ts` via `npm run doc` (`tools/doc.sh` →
  api-extractor → api-documenter).
- RAM costs: `src/Netscript/RamCostGenerator.ts` — `RamCosts: RamCostTree<NSFull>`
  (`~:545`). Logging funcs are free (`print: 0`, `tprint: 0`, `toast: 0`). The RAM tree
  must match the `ns` structure 1:1 or the build errors out.

### Existing logging
- In-game script log (tail window): `RunningScript.log()`, what `ns.print` writes to.
- Terminal: `Terminal.print/error/...` (what `ns.tprint` writes to).
- Recently Killed Scripts, toasts (`SnackbarEvents`), dialogs (`dialogBoxCreate`).
- `console.*` used ad hoc. **There is no central app-side logger or log-level enum
  today** — we will introduce one.
- Electron main process uses `electron-log`.

### Settings UI
- `src/GameOptions/ui/GameOptionsRoot.tsx` — `OptionsTabName` union (`:13`) + `tabs`
  record (`:31`). Add a tab by extending both, plus the sidebar.
- Control patterns: `OptionSwitch` (toggle), `RemoteAPIPage.tsx` (text field + validation
  — ideal template for the OTLP endpoint URL), `OptionsSlider`, MUI `Select` (for the log
  level dropdown; enums go in `src/Settings/SettingEnums.ts`).
- Persistence: `src/Settings/Settings.ts` (flat defaults object — add fields here),
  loaded/sanitized in `src/Settings/SettingsUtils.ts` (`loadSettings`), serialized with
  the save game.

### Build / runtime constraints
- Webpack 5. Bundle size matters to the community; deps are lean.
- `src/` runs in **browser + Electron renderer** — **no Node APIs** (`fs`, `net`).
- `fetch` is available and already used (`ns.wget`, Terminal `wget`). OTLP/HTTP exporters
  use it.
- Electron: separate Node process (`electron/`), its own `package.json`. File writes go
  through the `window.electronBridge` IPC whitelist (`electron/preload.js`) →
  `ipcMain.on` handlers (`electron/main.js`) → `fs` in `electron/storage.js`. Detect
  Electron in `src/` via the `navigator.userAgent` includes `" electron/"` check (already
  used in a couple places).

---

## 4. Architecture

### 4.1 Component overview

```
                       ┌─────────────────────────────────────────────┐
                       │              Telemetry module                │
                       │            (src/Telemetry/*)                  │
                       │                                               │
  Engine tick ───────▶ │  EngineMetrics   ─┐                          │
  recordMoneySource ─▶ │  (gauges/counters)│                          │
                       │                   ├─▶ MeterProvider ──┐       │
  ns.log.* ──────────▶ │  Logger facade ───┼─▶ LoggerProvider ─┤       │
  engine logs ───────▶ │                   │                   │       │
                       │                   ▼                   ▼       │
                       │            ┌──────────────┐   ┌──────────────┐│
                       │            │ Sink: console│   │ Sink: OTLP   ││──▶ collector
                       │            │ Sink: file*  │   │ (HTTP)       ││    (HTTP :4318)
                       │            └──────────────┘   └──────────────┘│
                       │   * file = Electron-only via IPC bridge       │
                       └─────────────────────────────────────────────┘
                                          ▲
                                          │ reads
                              ┌───────────────────────┐
                              │ Settings (enabled,     │
                              │ level, sink, endpoint) │
                              └───────────────────────┘
```

### 4.2 New module: `src/Telemetry/`

A single, well-bounded module that owns all OTel wiring. Nothing else in the codebase
touches `@opentelemetry/*` directly — they call this module's facade. This keeps the
dependency isolated and swappable.

Proposed files:

| File | Responsibility |
|------|----------------|
| `Telemetry.ts` | Public facade + lifecycle: `initTelemetry()`, `shutdownTelemetry()`, `reconfigureTelemetry()`. Lazy-loads the SDK on first enable. Holds the singleton providers. |
| `TelemetryLogger.ts` | `logEvent(level, body, attributes)` used by engine code and the NS API. Maps our log level → `SeverityNumber`. No-ops when disabled or below threshold. |
| `EngineMetrics.ts` | Defines the metric instruments (gauges/counters) and the `collectMetrics()` callback that reads `Player`/server state. Registered with the MeterProvider as observable callbacks. |
| `TelemetrySinks.ts` | Builds the log + metric processors/readers for the configured sink (console / file / OTLP). Centralizes exporter construction. |
| `FileExporter.ts` | Electron-only log/metric exporter that serializes OTLP-JSON and ships it over the IPC bridge to be appended to a file. Guarded so it's never constructed in a pure browser. |
| `TelemetryConfig.ts` | Reads `Settings.*` into a normalized config object; defines the log-level enum mapping; resource attributes (`service.name = "bitburner"`, version, bitNode, etc.). |
| `index.ts` | Barrel exports for the rest of the app. |

### 4.3 Packages to add

Core (small, browser-safe):
- `@opentelemetry/api`
- `@opentelemetry/api-logs`

SDK + exporters (loaded lazily):
- `@opentelemetry/sdk-logs` — `LoggerProvider`, `BatchLogRecordProcessor`,
  `ConsoleLogRecordExporter`
- `@opentelemetry/sdk-metrics` — `MeterProvider`, `PeriodicExportingMetricReader`,
  `ConsoleMetricExporter`
- `@opentelemetry/exporter-logs-otlp-http` — `OTLPLogExporter` (web-compatible)
- `@opentelemetry/exporter-metrics-otlp-http` — `OTLPMetricExporter` (web-compatible)
- `@opentelemetry/resources` — `resourceFromAttributes`
- `@opentelemetry/semantic-conventions` — attribute name constants

> All exporters listed have documented browser/web support and use `fetch`/`XHR`. They
> also run under Node, satisfying the browser + Electron + Node requirement. Exact version
> pinning to be decided at implementation time against the latest stable line; we add them
> with the same caret-range convention as existing deps and verify the lockfile.

### 4.4 Lifecycle

- On game load, `initTelemetry()` is called once. If telemetry is disabled it does
  nothing (and the SDK chunk is never fetched).
- When the user toggles telemetry on (or changes sink/level/endpoint) in settings,
  `reconfigureTelemetry()` runs: lazy-imports the SDK if needed, tears down old providers,
  builds new providers for the current config.
- On game unload / before save, `shutdownTelemetry()` flushes pending batches (best
  effort; `forceFlush()` then `shutdown()`).

### 4.5 Resource attributes

Every signal is tagged with a shared OTel `Resource`:
- `service.name = "bitburner"`
- `service.version` = game version (`package.json` version, already surfaced in-app)
- `bitburner.bitnode` = current BitNode number
- `bitburner.source_files` = optional, level summary
- `deployment.environment` = `"electron"` | `"browser"`

---

## 5. Layer 1 — Engine telemetry (logs + metrics)

### 5.1 Metrics

Registered as **observable** instruments collected by a
`PeriodicExportingMetricReader` (default export interval configurable, e.g. 10s). Using
observables means we read state on the exporter's schedule rather than emitting on every
tick — cheap and decoupled from the 200ms loop.

Proposed v1 metric set (all prefixed `bitburner.`):

| Metric | Type | Unit | Source |
|--------|------|------|--------|
| `player.money` | gauge | `$` | `Player.money` |
| `player.skill.<name>` | gauge | level | hacking, strength, defense, dexterity, agility, charisma, intelligence |
| `player.exp.<name>` | gauge | exp | per-skill experience |
| `player.karma` | gauge | — | `Player.karma` |
| `player.hp` | gauge | — | current / max |
| `player.playtime_ms` | counter | ms | total playtime |
| `scripts.running` | gauge | — | count of live `WorkerScript`s |
| `scripts.income_rate` | gauge | `$/s` | aggregate script income |
| `servers.ram_used` | gauge | GB | summed across owned servers |
| `servers.ram_total` | gauge | GB | summed across owned servers |
| `player.income` | counter | `$` | incremented from `recordMoneySource`, tagged by `source` |
| `bitnode.multipliers` | — | — | (deferred; large, low value) |

Attributes: `bitnode`, and for income, `source` (hacking, corp, hacknet, etc.).

> The exact metric list is a starting point. Final selection to be trimmed/extended in
> review — YAGNI applies; we ship a useful core, not everything.

### 5.2 Engine logs

A small, fixed set of structured engine log events routed through `TelemetryLogger`:
- game loaded / save / autosave (info)
- BitNode entered / destroyed (info)
- script runtime errors / uncaught exceptions (error) — hook the existing error path
  (`src/utils/ErrorHelper.ts` / `exceptionAlert`)
- augmentation installed, faction joined (info) — optional, low volume

Engine logs are **in addition to**, not a replacement for, the existing in-game log /
terminal / toasts. We are adding an observability sink, not changing player-visible UX.

---

## 6. Layer 2 — Player NS API (`ns.log`)

### 6.1 Surface

A new sub-namespace `ns.log` with leveled methods:

```typescript
ns.log.debug(message: string, attributes?: Record<string, string | number | boolean>): void;
ns.log.info(message: string, attributes?: ...): void;
ns.log.warn(message: string, attributes?: ...): void;
ns.log.error(message: string, attributes?: ...): void;
```

Semantics:
- Each call emits an OTel log record with the matching `SeverityNumber`, the message as
  the `body`, and the optional attributes.
- The record is **auto-tagged** with the calling script's identity from
  `ctx.workerScript`: `script.filename`, `script.pid`, `script.server`,
  `script.args` (stringified). Players don't have to pass these.
- Records below the configured log level are dropped cheaply (no record constructed).
- When telemetry is disabled, every method is a no-op (constant-time guard).
- **RAM cost: 0** (consistent with `print`/`tprint`). Logging shouldn't tax a script's
  RAM budget, and a zero cost avoids gating observability behind RAM.

### 6.2 Relationship to `ns.print`

`ns.print` stays exactly as-is (writes to the tail window). `ns.log.*` is a *separate*
channel aimed at external observability. They're complementary:
- `ns.print` → human watching the tail window in-game.
- `ns.log.info` → structured event shipped to console/file/OTLP for dashboards.

> **Naming note for review:** `ns.log` is clean but risks confusion with `ns.print`/the
> tail log. Alternative names: `ns.otel`, `ns.telemetry`. Flagging for the maintainers'
> preference, since NS API naming is a long-term commitment.

### 6.3 Wiring

- New file `src/NetscriptFunctions/Log.ts` exporting `NetscriptLog(): InternalAPI<NSLog>`,
  following the `Go.ts` pattern. Each method validates args via `helpers`, then calls
  `TelemetryLogger.logEvent(...)` with the worker script context.
- Mount `log: NetscriptLog()` in `src/NetscriptFunctions.ts`.
- Add the `NSLog` interface + `readonly log: NSLog;` to `NetscriptDefinitions.d.ts` with
  full TSDoc + examples.
- Add the `log` namespace (with `debug/info/warn/error: 0`) to `RamCosts` in
  `RamCostGenerator.ts`.
- Regenerate docs via `npm run doc`.

### 6.4 Abuse / safety considerations

- A tight loop calling `ns.log.info` could flood the exporter. Mitigations: the
  `BatchLogRecordProcessor` coalesces; we add a **rate cap / max queue** with drop-on-
  overflow and a single throttled warning. Cap is configurable but has a sane default.
- Attribute values are coerced to primitives and size-capped to avoid unbounded payloads.

---

## 7. Layer 3 — Settings & configuration

### 7.1 New settings (`src/Settings/Settings.ts`)

```
TelemetryEnabled: boolean        // default false
TelemetryLogLevel: OtelLogLevel  // default INFO
TelemetrySink: OtelSink          // default "console"  (console | file | otlp)
TelemetryOtlpEndpoint: string    // default "http://localhost:4318"
TelemetryMetricsEnabled: boolean // default true (when telemetry on)
TelemetryExportIntervalMs: number// default 10000
TelemetryFilePath: string        // Electron-only; default under userData/logs
```

Enums in `src/Settings/SettingEnums.ts`:
- `OtelLogLevel` = DEBUG | INFO | WARN | ERROR
- `OtelSink` = CONSOLE | FILE | OTLP

Load/sanitize in `SettingsUtils.ts` `loadSettings`:
- Validate the endpoint with a new `isValidOtlpEndpoint(url)` (http/https, parseable URL)
  — modeled on the existing `isValidConnectionHostname`/`isValidConnectionPort`.
- Clamp the export interval to a sane range.
- Coerce unknown enum values back to defaults.

### 7.2 Settings UI — new "Telemetry" tab

- Add `"Telemetry"` to `OptionsTabName` and `tabs` in `GameOptionsRoot.tsx`; add to the
  sidebar.
- New `src/GameOptions/ui/TelemetryPage.tsx`:
  - `OptionSwitch` — **Enable telemetry** (master toggle; disables the rest when off).
  - MUI `Select` — **Log level** (DEBUG/INFO/WARN/ERROR).
  - MUI `Select` — **Sink** (Console / File / OTLP endpoint).
  - `TextField` w/ validation — **OTLP endpoint URL** (shown only when sink = OTLP),
    copying `RemoteAPIPage.tsx`'s validated-field pattern.
  - `TextField` — **File path** (shown only when sink = File **and** running in Electron;
    in browser the File option is disabled with a tooltip: "Available in the desktop app
    only").
  - `OptionSwitch` — **Export game metrics** (player money/stats/etc.).
  - `OptionsSlider`/number field — **Export interval (s)**.
  - A "Test connection" button for OTLP (best-effort POST + result toast) — *optional,
    flagged for review.*
- On any change → write `Settings.*` and call `reconfigureTelemetry()`.

### 7.3 Sinks

| Sink | Logs exporter | Metrics exporter | Browser | Electron | Node |
|------|---------------|------------------|---------|----------|------|
| Console | `ConsoleLogRecordExporter` | `ConsoleMetricExporter` | ✅ | ✅ | ✅ |
| OTLP | `OTLPLogExporter` (http) | `OTLPMetricExporter` (http) | ✅ | ✅ | ✅ |
| File | custom `FileExporter` via IPC | custom `FileExporter` via IPC | ❌ (disabled) | ✅ | ✅ |

**File sink (Electron):** add a whitelisted IPC channel (e.g. `"otel-write"`) in
`electron/preload.js`, an `ipcMain.on` handler in `electron/main.js`, and an append helper
in `electron/storage.js` writing OTLP-JSON lines under `app.getPath("logs")` or the
configured path. The `FileExporter` in `src/` serializes records and posts them across the
bridge. In a pure browser the File option is not selectable.

---

## 8. Testing

- **Unit (Jest):** `TelemetryConfig` normalization + validation; log-level filtering;
  no-op behavior when disabled; attribute coercion/size caps; `EngineMetrics.collect()`
  reads expected values from a mock `Player`.
- **NS API:** `ns.log.*` calls produce records with correct severity + script attributes;
  RAM cost is 0; methods are safe when telemetry is off.
- **Sink construction:** given a config, `TelemetrySinks` builds the right
  exporter/processor combo; File sink is never constructed in a non-Electron environment.
- **Manual / integration:** point OTLP at a local collector (docker
  `otel/opentelemetry-collector`) and confirm logs + metrics arrive. Confirm console sink
  in dev tools. Confirm file sink in an Electron build.
- **Bundle check:** run `npm run analyze-bundle` (or equivalent) before/after to confirm
  the SDK lands in a lazy chunk and the initial bundle isn't bloated for disabled users.
- Existing CI: `npm run lint`, `npm run format`, `npm test`, type-check, and
  `npm run doc` must all pass. The RAM-cost-tree 1:1 check must pass.

---

## 9. Risks & open questions

1. **Bundle size.** The OTel SDK is not tiny. Mitigation: lazy `import()` so it only loads
   when enabled; verify with the bundle analyzer. *Open:* is a lazy chunk acceptable to
   maintainers, or do they want telemetry behind a build flag entirely?
2. **Browser exporter quirks.** OTLP/HTTP from a browser is subject to **CORS** — the
   collector must allow the game's origin. Document this clearly in-game/in-docs.
3. **Maintainer acceptance.** This adds 8 runtime deps to a dependency-conservative
   project. *Open:* do maintainers prefer this gated/optional, or is a hand-rolled
   exporter still on the table as a fallback? (User has chosen standard libs.)
4. **NS API naming** (`ns.log` vs `ns.otel` vs `ns.telemetry`) — long-term commitment.
5. **Metric cardinality.** Per-skill/per-source attributes are bounded and safe; avoid
   anything unbounded (e.g. per-script-pid metrics).
6. **Save/version compat.** New settings are additive and default-safe; old saves load
   fine (the `Object.assign` merge fills defaults).
7. **Traces deferred** — confirm that's acceptable for v1.

---

## 10. Phased implementation plan

Each phase is independently reviewable and leaves the game working.

### Phase 0 — Scaffolding & deps
- Add the `@opentelemetry/*` dependencies; verify lockfile, lint, build, bundle chunking.
- Create `src/Telemetry/` with the facade + config types as no-op stubs.
- Add settings fields + enums + validation (no UI yet). Defaults make telemetry off.
- **Exit:** game builds and runs identically; telemetry is inert.

### Phase 1 — Telemetry core + console sink
- Implement `Telemetry.ts` lifecycle (lazy SDK load, init/reconfigure/shutdown).
- Implement `TelemetryLogger` + log-level filtering + `ConsoleLogRecordExporter`.
- Wire `initTelemetry()` into game load and `shutdownTelemetry()` into unload.
- **Exit:** enabling telemetry in code logs structured events to the console.

### Phase 2 — Engine metrics
- Implement `EngineMetrics` observable instruments + `collectMetrics()`.
- Register the `PeriodicExportingMetricReader` (console first).
- Hook `recordMoneySource` for the income counter.
- **Exit:** metrics appear in console on the export interval.

### Phase 3 — OTLP sink
- Implement OTLP log + metric exporters in `TelemetrySinks`.
- Endpoint config plumbed from settings.
- **Exit:** logs + metrics arrive at a local collector.

### Phase 4 — `ns.log` NS API
- `src/NetscriptFunctions/Log.ts`, mount in `NetscriptFunctions.ts`, `NSLog` type in
  `.d.ts`, RAM costs (0), rate cap, regenerate docs.
- **Exit:** a player script calling `ns.log.info(...)` emits records through the pipeline.

### Phase 5 — Settings UI
- `TelemetryPage.tsx` + tab/sidebar wiring; live `reconfigureTelemetry()` on change.
- Conditional fields (endpoint/file), validation, Electron detection.
- **Exit:** players configure everything from the options page.

### Phase 6 — File sink (Electron)
- IPC channel + main-process handler + storage append helper; `FileExporter`.
- Browser fallback (option disabled).
- **Exit:** Electron build writes telemetry to a file.

### Phase 7 — Tests, docs, polish
- Unit + integration tests; in-game/markdown docs; bundle re-check; changelog entry.
- **Exit:** CI green, docs regenerated, ready for PR into `dev`.

---

## 11. Out of scope (v1)

- Distributed tracing / spans.
- Player-defined custom metrics (`ns.metrics.counter/gauge`) — candidate for v2.
- Auto-instrumentation of NS calls (e.g. spans around hack/grow/weaken).
- Shipping a bundled collector or dashboards.
