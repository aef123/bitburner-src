# Sleeve Metrics — Design

**Date:** 2026-08-02
**Branch:** `claude/sleeve-metrics-emission-71f8c7` (rebased onto `otlp`)
**Status:** Approved, ready for implementation planning

## Problem

The engine emits nothing about sleeves. `src/Telemetry/EngineMetrics.ts` covers the player
(money, skills, karma, HP, income), scripts, owned-server RAM, faction reputation, and the gang
— including per-member stats. Sleeves have none of that, even though they carry per-body state
the player actively manages: shock, sync, memory, skills, augmentations, and a current task.

There is also no augmentation count for the player anywhere in the telemetry.

## Scope

Add sleeve metrics plus a player augmentation count to the engine metrics. No changes to the
NS API, the sinks, the settings UI, or the exporters.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Current task encoded as an **info gauge** (always `1`, task in the labels) | Directly answers "what is sleeve N doing", and it's the only encoding that carries the task detail |
| 2 | Idle sleeves emit `task="IDLE"`, never nothing | An absent series keeps serving its last value through Prometheus's staleness window, reading as though the sleeve were still working |
| 3 | Two generic labels, `detail` and `subdetail`, populated by an exhaustive `switch` | Carries the secondary work detail (faction work type, class location, Bladeburner action type) without per-type labels like `crime`/`faction`/`company`, which would sit empty on most series and complicate queries |
| 4 | `city` rides on the task gauge | It's another string state; folding it in avoids a second always-`1` series per sleeve |
| 5 | Player augs split by `state="installed"\|"queued"` | The plain total falls out as a sum, so no second instrument is needed |
| 6 | Registration lives in `EngineMetrics.ts` beside `registerGangMetrics` | Same shape as the existing subsystem block; keeps the module's single job intact |

### Rejected

- **Per-type boolean series** (one series per sleeve × task type, `1`/`0`). Fixed cardinality and
  correct `avg_over_time` aggregation, but no room for the task detail. Detail was judged the more
  valuable half.
- **Numeric enum code** (`task` as an integer). Cheapest, and unreadable without a decoder legend
  in every dashboard.

## Instruments

All series carry the existing base attribute `bitnode`. Sleeve series add `sleeve`, the index into
`Player.sleeves` — sleeves have no names.

| Instrument | Type | Extra labels | Source |
|---|---|---|---|
| `bitburner.sleeve.count` | gauge | — | `Player.sleeves.length` |
| `bitburner.sleeve.shock` | gauge | `sleeve` | `Sleeve.shock` (0–100) |
| `bitburner.sleeve.sync` | gauge | `sleeve` | `Sleeve.sync` (1–100) |
| `bitburner.sleeve.memory` | gauge | `sleeve` | `Sleeve.memory` |
| `bitburner.sleeve.skill` | gauge | `sleeve`, `skill` | `Person.skills`, mirroring `bitburner.player.skill` |
| `bitburner.sleeve.hp.current` | gauge | `sleeve` | `Person.hp.current` |
| `bitburner.sleeve.hp.max` | gauge | `sleeve` | `Person.hp.max` |
| `bitburner.sleeve.augmentation_count` | gauge | `sleeve` | `Person.augmentations.length` |
| `bitburner.sleeve.task` | gauge, always `1` | `sleeve`, `task`, `detail`, `subdetail`, `city` | `Sleeve.currentWork`, `Person.city` |
| `bitburner.player.augmentation_count` | gauge | `state` | `Player.augmentations` / `Player.queuedAugmentations` |

Cardinality per scrape is bounded by the sleeve count (single digits) times a fixed set of
instruments, with `bitburner.sleeve.skill` fanning out over the seven `Person.skills` keys. Label
values all come from finite enums, so total series over a long session stays in the low hundreds.

### Excluded

- `Sleeve.storedCycles` — an internal tick buffer, meaningless on a dashboard.
- `Player.sleevesFromCovenant` — a purchase count, not observable state.

## Task encoding

`sleeveTaskLabels(work: SleeveWork | null): { task: string; detail: string; subdetail: string }` is
exported from `EngineMetrics.ts` so it can be tested directly. The `switch` is exhaustive over
`SleeveWorkType`, so adding a tenth work type is a compile error rather than a silently empty
`detail`.

`detail` is the thing being worked on; `subdetail` is the qualifier on it, and is `""` wherever the
work type has no second field. The names are deliberately generic — the nine work types have no
shared semantics to name more specifically, and a pair like `target`/`mode` would misdescribe
`CLASS`, where the qualifier is a location.

| `work.type` | `task` | `detail` | `subdetail` |
|---|---|---|---|
| `COMPANY` | `"COMPANY"` | `companyName` | `""` |
| `FACTION` | `"FACTION"` | `factionName` | `factionWorkType` |
| `CRIME` | `"CRIME"` | `crimeType` | `""` |
| `CLASS` | `"CLASS"` | `classType` | `location` |
| `BLADEBURNER` | `"BLADEBURNER"` | `actionId.name` | `actionId.type` |
| `RECOVERY` | `"RECOVERY"` | `""` | `""` |
| `SYNCHRO` | `"SYNCHRO"` | `""` | `""` |
| `INFILTRATE` | `"INFILTRATE"` | `""` | `""` |
| `SUPPORT` | `"SUPPORT"` | `""` | `""` |
| `null` | `"IDLE"` | `""` | `""` |

## Structure

`registerSleeveMetrics(meter, base)` in `src/Telemetry/EngineMetrics.ts`, called from
`registerEngineMetrics` immediately after `registerGangMetrics`. The module lands around 190 lines.

Every callback iterates `Player.sleeves`, so a BitNode without sleeves observes nothing from an
empty array — no explicit BitNode-10 guard, matching how the gang gauges no-op on
`Player.gang === null`.

The file is reached only through the dynamic `import()` in `Telemetry.ts`, which is what lets it
statically import `@opentelemetry/*` and game state. Nothing here changes that. If the file later
outgrows itself, the clean split is a `SleeveMetrics.ts` imported *by* `EngineMetrics.ts`, which
keeps it off the eager path.

## Testing

Extends `test/jest/Telemetry/EngineMetrics.test.ts` using its existing `makeFakeMeter()` harness,
which captures observable callbacks and replays them through `collect(name)`.

Unlike the gang tests, which fake a `Gang` with an object literal cast `as never`, the sleeve tests
use real `Sleeve` instances and real `Sleeve*Work` objects. Their constructors are trivial and need
no BitNode-10 setup, so there is nothing to gain by faking them — and a real work object catches a
renamed field that a partial literal would not. Note that `new Sleeve()` calls `shockRecovery()`,
so a fresh sleeve starts on `RECOVERY` work; the idle case must null `currentWork` explicitly.

1. No sleeves → `bitburner.sleeve.count` observes `0`; every other sleeve gauge collects `[]`.
2. Two sleeves → shock, sync, memory, and augmentation count land on the right `sleeve` index;
   skill series count equals `2 × Object.keys(skills).length`.
3. A sleeve on `SleeveCrimeWork` → task gauge observes `1` with `task="CRIME"`, the crime in
   `detail`, an empty `subdetail`, and the sleeve's city.
4. A sleeve with `currentWork === null` → `task="IDLE"`, `detail=""`, `subdetail=""`.
5. `sleeveTaskLabels` directly, one case per work type: the four detail-free types return `""` for
   both labels, and `FACTION`, `CLASS`, and `BLADEBURNER` each return their `subdetail`.
6. Player augmentations → installed and queued observed as separate `state` series.

## Verification

`npm install` first — this worktree has no `node_modules`.

```
npm test
npm run lint
npx tsc --noEmit
```
