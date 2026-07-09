# Bitburner UI Refresh: Foundation Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the visual foundation (theme tokens, two-font system), shell architecture (icon rail, top bar, docked HUD, ⌘K palette), World Map (3A), and City Transit Map (3B) from the design handoff at `C:\git\bitburner-scripts\Bitburner interface redesign\design_handoff_bitburner_ui\README.md`.

**Architecture:** Bottom-up layering. (1) Extend the existing flat `ITheme` with 22 new tokens + bundle IBM Plex Sans; (2) replace `SidebarRoot`/floating-`Overview` in `GameRoot.tsx:550-557` with a shell (rail + top bar + HUD); (3) replace ASCII maps with SVG components whose geometry comes verbatim from the design mockups. Each task ships independently.

**Tech Stack:** React 17, MUI v5, TypeScript, tss-react. SVG (not canvas) for maps. Fonts bundled locally as woff2 (JetBrains Mono already at `src/fonts/JetBrainsMono.woff2`).

**Design fidelity sources (extracted verbatim from mockups — implementers MUST read the one for their task):**
- `.superpowers/sdd/design-notes-1A-shell.md` — rail/topbar/HUD geometry, colors, states
- `.superpowers/sdd/design-notes-3A-worldmap.md` — city node positions, flight-arc bezier paths, graticule SVG, popover/index-column structure
- `.superpowers/sdd/design-notes-3B-citymap.md` — transit line paths, station positions, interchange markup, station card, legend

## Global Constraints

- **UI-only.** No gameplay/formula/timing changes; no `ns` API changes; no surfacing undiscovered information.
- **No hardcoded hex in components.** All colors flow through `Settings.theme.*` / `theme.colors.*` tokens (new tokens carry the design hexes as *defaults*). The ONLY place design hexes may appear is theme-data/default files.
- **Two-font system:** IBM Plex Sans for UI labels/prose/buttons; JetBrains Mono for numbers, money, server names, terminal content. Mono comes from new `Settings.styles.monoFontFamily`.
- **Formatting:** all numbers use existing formatters from `src/ui/formatNumber.ts` (`formatMoney`, `formatSkill`, `formatHp`, `formatExp`, `formatPercent`).
- **Navigation:** only `Router.toPage(...)` calls to existing pages. Signatures: `toPage(SimplePage)` / `toPage(Page.Location, { location })`.
- **Preserve:** all sidebar visibility conditions + badges (SidebarRoot.tsx:157-169 etc.), the Alt+X hotkey system (SidebarRoot.tsx:284-310 / KeyBindingUtils), `withSidebar=false` pages (Recovery, BitVerse, Infiltration, BladeburnerCinematic, Work) which render full-bleed with no shell chrome.
- **New UI preferences** go on `Settings` (they serialize automatically): `ClassicMaps: boolean` (default false), `HudCollapsed: boolean` (default false).
- **Verification floor for every task:** `npx tsc --noEmit` clean, `npm run test` green, `npm run lint:report` no new warnings. Commit per task.

## Design tokens (exact values — single source of truth for Task 1)

New flat `ITheme` keys (camelCase) and defaults:

| Key | Hex | | Key | Hex |
|---|---|---|---|---|
| `bgApp` | `#0a0d12` | | `textPrimary` | `#f0f6fb` |
| `bgRail` | `#0c1016` | | `textBody` | `#dbe7f0` |
| `bgPanel` | `#0e141b` | | `textSecondary` | `#7d8fa1` |
| `bgPanelDeep` | `#0c1117` | | `textTertiary` | `#55677a` |
| `bgSidebar` | `#0c1118` | | `textFaint` | `#3d4d5e` |
| `bgActive` | `#152430` | | `accentCyan` | `#4cc9e8` |
| `borderDefault` | `#1a232e` | | `accentGreen` | `#59e0a5` |
| `borderCard` | `#22303e` | | `accentGold` | `#e6c069` |
| `borderFocus` | `#2a4152` | | `accentRed` | `#ee7272` |
| `borderAccent` | `#1f4451` | | `accentViolet` | `#9d8cff` |
| `track` | `#1a232e` | | `accentPink` | `#f2a3c0` |

Radius scale: 4/6/8 chips-buttons-inputs, 10-12 cards. Spacing base 4px; row padding 13×16; page padding 24×26. Hover: border lightens `borderCard`→`borderFocus`, 120ms ease-out, no transform.

---

### Task 1: Fonts + Theme Tokens

**Files:**
- Create: `src/fonts/` IBM Plex Sans woff2 files (weights 400/500/600/700; download from Google Fonts CDN, OFL license)
- Modify: `src/css/font.css` (four `@font-face` blocks for "IBM Plex Sans", pattern matches existing JetBrainsMono block)
- Modify: `src/Themes/Themes.ts` (add the 22 keys to `ITheme`, required)
- Create: `src/Themes/data/uiRefreshDefaults.ts` (exports `uiRefreshTokens: Pick<ITheme, ...22 keys>` with the hex values above)
- Modify: all 16 files `src/Themes/data/*/index.ts` (add `...uiRefreshTokens` spread into each `colors`)
- Modify: `src/JsonSchema/Data/ThemeSchema.ts` (add 22 properties to `getThemeSchemaProperties()`)
- Modify: `src/ScriptEditor/NetscriptDefinitions.d.ts` (add 22 keys to `UserInterfaceTheme`; add `monoFontFamily` to `IStyleSettings`)
- Modify: `src/Themes/ui/ThemeEditorModal.tsx` (add `<ColorEditor>` rows for the 22 keys, grouped under a "UI Refresh" section)
- Modify: `src/Themes/Styles.ts` (`fontFamily` default → `"IBM Plex Sans", "Segoe UI", sans-serif`; add `monoFontFamily: 'JetBrainsMono, "Courier New", monospace'`)
- Modify: `src/JsonSchema/Data/StylesSchema.ts` (+`monoFontFamily`)
- Modify: `src/Themes/ui/StyleEditorModal.tsx` (+ monoFontFamily field)
- Modify: `src/Settings/SettingsUtils.ts` (migration: if loaded `styles.fontFamily === 'JetBrainsMono, "Courier New", monospace'` exactly, replace with new default so existing saves get the two-font system; users with custom fonts keep theirs)
- Modify: `src/Themes/ui/Theme.tsx` (expose all 22 new keys on `theme.colors`; MUI declaration merge; keep `typography.fontFamily = Settings.styles.fontFamily`)
- Modify: terminal/log mono consumers: `src/Terminal/ui/TerminalRoot.tsx` (or its input/output styles) and `src/ui/React/LogBoxManager.tsx` get explicit `fontFamily: Settings.styles.monoFontFamily` so terminal/tail stay mono when UI font becomes Plex Sans.
- Test: `test/jest/Themes/uiRefreshTokens.test.ts` (all 22 keys present on defaultTheme with exact hex; all 16 predefined themes have all 22 keys; schema accepts them; styles migration behaves)

**Interfaces produced (later tasks consume):** `theme.colors.bgApp` … `theme.colors.accentPink`, `theme.colors.track` via `useTheme()`/`makeStyles`; `Settings.styles.monoFontFamily`; CSS vars `--bb-theme-bgApp` etc. (automatic from Theme.tsx:440-447).

**Steps:**
- [ ] Download 4 IBM Plex Sans woff2 files into `src/fonts/`; add `@font-face` blocks with correct `font-weight` per file
- [ ] Write failing test for tokens/themes/schema/migration; run it (RED)
- [ ] Add ITheme keys + `uiRefreshDefaults.ts` + spread into 16 themes + schema + d.ts + editor rows
- [ ] Styles: new default fontFamily, `monoFontFamily`, schema, editor field, save migration
- [ ] Theme.tsx: expose keys on `theme.colors`; verify CSS vars pick up new keys automatically
- [ ] Terminal + LogBox mono font wiring
- [ ] Test (GREEN), full suite, tsc, lint; commit `feat: two-font system + UI refresh theme tokens`

---

### Task 2: Shell — Icon Rail, Top Bar, Layout integration

**Files:**
- Create: `src/ui/Shell/ShellLayout.tsx` — grid `60px 1fr [272px]` × `52px 1fr`; renders rail + topbar + content; HUD column added in Task 4
- Create: `src/ui/Shell/IconRail.tsx` + `src/ui/Shell/RailItem.tsx`
- Create: `src/ui/Shell/TopBar.tsx`
- Modify: `src/ui/GameRoot.tsx` — replace the `{withSidebar ? ...}` block (lines 550-557): `withSidebar` → `<ShellLayout page={currentPage}>{mainPage}</ShellLayout>`, else bare `mainPage` (unchanged full-bleed path)
- Test: `test/jest/ui/Shell/IconRail.test.tsx` (visibility conditions mirror SidebarRoot; badges; active detection incl. `alternateKeys` e.g. City active on Page.Location)

**Requirements:**
1. **IconRail** (read design-notes-1A): 60px, bg `bgRail`, right border `borderDefault`. Same page list/groups as SidebarRoot (Hacking/Character/World/Help separated by hairline dividers), **same icons** (`LastPageIcon`, `CreateIcon`, `StorageIcon`, `BugReportIcon`, `DeveloperBoardIcon`, `EqualizerIcon`, `ContactsIcon`, rotated `DoubleArrowIcon`, `AccountTreeIcon`, `PeopleAltIcon`, `BiotechIcon`, `LocationCityIcon`, `AirplanemodeActiveIcon`, `WorkIcon`, `TrendingUpIcon`, `FormatBoldIcon`, `BusinessIcon`, `SportsMmaIcon`, `BorderInnerSharpIcon`, `ShareIcon`, `CheckIcon`, `HelpIcon`, `EmojiEventsIcon`, `SettingsIcon`), **same visibility conditions and badge counts** — extract the condition/badge logic from SidebarRoot into a shared module (`src/Sidebar/navigationItems.ts`) consumed by both (SidebarRoot stays in the tree for now, unused, deleted in a later stage) so nothing drifts. Active item: 36px rounded-6px square, bg `bgActive`, icon `accentCyan`, 2px inset left indicator; badges 14px `accentRed` dots; MUI Tooltip flyout labels (right placement). `useCycleRerender()` keeps conditions/badges live.
2. **Hotkeys:** move the `keydown` effect from SidebarRoot.tsx:284-310 into the shell (same suppression rules: `Settings.DisableHotkeys`, modifier-state, key-binding-setup event, focused work, BitVerse). Alt+X navigation must keep working.
3. **TopBar** (design-notes-1A): 52px, bg per mock, bottom border `borderDefault`. Left: breadcrumb `Section / Page` — section = nav group name of current page, 12.5px, section `textSecondary`, page `textBody` semibold. Center: 340px search field (bg/border/radius per notes, placeholder "Jump to anything…", kbd chip "Ctrl K") — click opens palette (Task 3 wires it; for now render + no-op). Right: money (`monoFontFamily` 13px `accentGold`, `formatMoney(Player.money)`) and HP pill (`formatHp` current/max, green on dark-green pill per notes). Update via `useCycleRerender()`.
4. Content area: `overflow: auto`, page padding preserved (existing `classes.root` padding 8px stays on the content wrapper).
5. Floating `<Overview>` stays mounted for now (Task 4 replaces it).

**Steps:**
- [ ] Extract `navigationItems.ts` (pure data + condition fns) with tests
- [ ] RailItem + IconRail per mock geometry; wire hotkey effect
- [ ] TopBar with breadcrumb/search-stub/money/HP
- [ ] ShellLayout + GameRoot integration; verify full-bleed pages unaffected
- [ ] tsc/tests/lint; commit `feat: shell icon rail + top bar`

---

### Task 3: Command Palette (Ctrl/⌘+K)

**Files:**
- Create: `src/ui/Shell/CommandPalette.tsx`
- Modify: `src/ui/Shell/TopBar.tsx` (open on click), `src/ui/Shell/ShellLayout.tsx` (global Ctrl/⌘+K listener — registered with the same suppression rules as other hotkeys except it must ALSO work when `Settings.DisableHotkeys` is false and terminal focused? No: palette obeys the same suppression list; simplicity wins)
- Test: `test/jest/ui/Shell/CommandPalette.test.tsx` (filter+rank, hidden pages excluded, Enter navigates, Esc closes)

**Requirements:**
- MUI Dialog styled per design-notes-1A search styling: bg `bgPanel`, border `borderCard`, input row + result list; kbd hints.
- Searches **visible pages only** (reuse `navigationItems.ts` conditions). Ranking: case-insensitive substring match first, then `fast-dice-coefficient` similarity (already a dependency) for fuzzy fallback; stable order by nav order on ties.
- Keyboard: ↑/↓ move selection, Enter = `Router.toPage(selected)`, Esc closes. Selecting closes + clears query.
- Pure navigation only (per handoff: "nothing else").

**Steps:**
- [ ] RED tests for ranking/visibility/keyboard → implement → GREEN
- [ ] Wire Ctrl/⌘+K + TopBar click; manual smoke via `npm run start:dev`
- [ ] tsc/tests/lint; commit `feat: command palette`

---

### Task 4: Docked HUD (replaces floating Overview)

**Files:**
- Create: `src/ui/Shell/Hud.tsx`, `src/ui/Shell/Sparkline.tsx`, `src/ui/Shell/ActionCard.tsx`
- Modify: `src/ui/Shell/ShellLayout.tsx` (third grid column when `!Settings.HudCollapsed`)
- Modify: `src/Settings/Settings.ts` (+`HudCollapsed: boolean` default false)
- Modify: `src/ui/GameRoot.tsx` — floating `<Overview>` renders **only when** `Settings.HudCollapsed` is true or page is shell-less (preserves "floating widget for small windows" per handoff)
- Test: `test/jest/ui/Shell/Sparkline.test.tsx` (ring buffer: fixed capacity, correct polyline points, $/s rate calc incl. zero-window guard)

**Requirements (design-notes-1A HUD section):**
- 272px column, bg `bgSidebar`, left border `borderDefault`. Sections top→bottom: money block (mono `accentGold` value via `formatMoney`, `$/s` subline, 1.5px polyline SVG sparkline of a ~60-sample ring buffer sampled on `GameCycleEvents`); skill rows (label Plex, value mono, 4px progress bar using `calculateSkillProgress(Player.exp[skill], mult)` — colors: hack `accentCyan`-family per notes, combat rows, cha `accentPink`, int shown only when `Player.skills.intelligence > 0`); current action card (border `borderAccent`, conic-gradient progress ring, action name, subline, "Focus →" link = `Player.startFocusing(); Router.toPage(Page.Work)`, hidden when `Player.focus` or no work — mirror CharacterOverview's `Work` logic incl. all work types); bottom-pinned buttons: **Save** (`saveGame()`) and **Kill Scripts** (existing `KillScriptsModal`) — deviation from mock's "Soft reset" noted deliberately (destructive button next to Save is a footgun; functionality parity with current overview).
- Keep the three `overview-extra-hook-0/1/2` Typography hooks (scripts inject into them) and `<BladeburnerText/>` — port from CharacterOverview.
- Collapse chevron in HUD header → sets `Settings.HudCollapsed = true` (floating Overview reappears); a reopen affordance in the TopBar (small icon button) sets it false.
- Update cadence: 600ms interval pattern like CharacterOverview (only while visible), or `useCycleRerender`.

**Steps:**
- [ ] Sparkline ring buffer + tests (RED→GREEN)
- [ ] Hud sections per notes; ActionCard covering all work types
- [ ] Collapse/restore ↔ floating Overview switch; Settings.HudCollapsed
- [ ] tsc/tests/lint; commit `feat: docked HUD`

---

### Task 5: World Map 3A

**Files:**
- Create: `src/ui/Maps/WorldMap3A.tsx` (SVG map), `src/ui/Maps/CityIndexColumn.tsx`, `src/ui/Maps/worldMapData.ts` (node positions + arc paths **verbatim from design-notes-3A**), `src/ui/Maps/cityIntel.ts` (pure selectors)
- Modify: `src/Locations/ui/TravelAgencyRoot.tsx` — render `WorldMap3A` unless `Settings.ClassicMaps` (then old ASCII/list behavior per `DisableASCIIArt`)
- Modify: `src/Settings/Settings.ts` (+`ClassicMaps: boolean` default false), `src/GameOptions/ui/InterfacePage.tsx` (+"Use classic ASCII maps" toggle next to DisableASCIIArt)
- Test: `test/jest/ui/Maps/cityIntel.test.ts`

**Requirements:**
- SVG per design-notes-3A: dark radial canvas, graticule ellipses, 6 city nodes at mock positions (current city 30px + bright ring + "◄ you" label; others 22px), dashed quadratic-bezier flight arcs from current city (dim/highlight variants per notes). Node color: `accentCyan` when city "has something for you now", `textTertiary`/slate otherwise. Hover lightens; click selects.
- `cityIntel.ts` (pure, unit-tested) computes per city from player state ONLY: (a) pending invitation from a faction requiring that city; (b) city faction joinable — `!member && !invited && Player.money >= threshold` (thresholds from FactionInfo inviteReqs: Aevum 40e6, Sector-12 15e6, Chongqing 20e6, NewTokyo 20e6, Ishima 30e6, Volhaven 50e6; multi-city: TheSyndicate/Tetrads/TianDiHui/TheDarkArmy per FactionInfo); (c) better gym/university than current city's best (`expMult` from LocationsMetadata — public data); (d) ticket affordability (`Player.money >= CONSTANTS.TravelCost`). NO undiscovered-server info.
- City popover on select (structure per notes): name, ticket cost (`formatMoney(CONSTANTS.TravelCost)`), known contents (factions w/ current rep if member, gym/uni line, honesty line "No university · no gym" where true), primary "Fly to X" button → existing `startTravel` flow (confirmation modal per `Settings.SuppressTravelConfirmation` preserved).
- Right index column (330px, per notes): one card per city with "why go" summary from cityIntel; current city card highlighted cyan; legend bottom-left.
- All text: city/server names mono; prose Plex. Colors via theme tokens only.

**Steps:**
- [ ] `worldMapData.ts` from design notes (verbatim geometry) + `cityIntel.ts` with RED→GREEN tests
- [ ] WorldMap3A SVG + popover + index column
- [ ] TravelAgencyRoot integration + ClassicMaps setting + options toggle
- [ ] tsc/tests/lint; manual smoke; commit `feat: world map (3A)`

---

### Task 6: City Transit Map 3B

**Files:**
- Create: `src/ui/Maps/CityMap3B.tsx`, `src/ui/Maps/StationCard.tsx`, `src/ui/Maps/cityMapLayouts.ts`
- Modify: `src/Locations/ui/City.tsx` — render `CityMap3B` unless `Settings.ClassicMaps` (then existing ASCII/list per `DisableASCIIArt`)
- Test: `test/jest/ui/Maps/cityMapLayouts.test.ts` (every location of every city appears exactly once; category assignment total; all stations clickable targets exist in `Locations`)

**Requirements:**
- Category mapping: **Commerce gold** = Company/TechVendor/StockMarket/Casino/TravelAgency; **Training green** = Gym/University/Hospital; **Street violet** = Slums/Special. Multi-category locations (e.g. CIA = Company+Special, ECorp = Company+TechVendor within same category-group stays single) that span category groups render as **interchanges** (12px, white stroke per notes); single-category stations 8px circle, 3px category-color stroke on dark fill.
- `cityMapLayouts.ts`: per-city layout data — three polyline/path line routes + station positions along them. The mock city's layout comes **verbatim from design-notes-3B**; the other five cities get hand-authored layouts in the same visual language (lines 5px rounded, similar composition, no overlaps). Station labels mono 11px; best-in-city gym gets ★, faction HQ locations get ⚑; notable stations glow (text-shadow per notes).
- Interactions: every station is a real click target → existing `toLocation` logic (TravelAgency→Page.Travel, WorldStockExchange→Page.StockMarket, else Page.Location with `{location}`). Hover/select shows StationCard (right-top, 262px per notes): name, line membership chips, contextual content — for Slums: crime list with `crime.type`, `formatPercent(crime.successRate(Player))`, `formatMoney(crime.money)` (same data SlumsLocation shows); "Enter" button colored by category.
- Legend pinned bottom-left (per notes, incl. interchange marker).

**Steps:**
- [ ] Layout data + coverage tests (RED→GREEN)
- [ ] CityMap3B SVG + StationCard (+Slums crime content)
- [ ] City.tsx integration under ClassicMaps
- [ ] tsc/tests/lint; manual smoke all 6 cities; commit `feat: city transit map (3B)`

---

### Task 7: Verification & polish pass

- [ ] `npx tsc --noEmit`, `npm run test`, `npm run lint:report`, `npm run build:dev` all clean
- [ ] Sweep new components for hardcoded hexes (`grep -rn "#[0-9a-fA-F]\{6\}" src/ui/Shell src/ui/Maps` → only allowed in theme data)
- [ ] Global interaction rules audit: hover border-lighten 120ms, progress bars animate 300ms, collapse animations 160ms, tooltips show exact values on formatted numbers
- [ ] Manual checklist (human): rail nav + hotkeys, palette, HUD collapse↔floating, travel via map incl. confirmation setting, all 6 city maps, theme switch (pick 2 predefined themes), old save import
- [ ] Final whole-branch review (most capable model), fix wave, re-verify

---

## Deliberate deviations from the handoff (flag to human at the end)
1. HUD bottom buttons: Save + Kill Scripts instead of Save + Soft Reset (destructive-action footgun; parity with current overview).
2. ASCII maps kept behind new `Settings.ClassicMaps` toggle (handoff's "inverted: honor whatever the player set" is ambiguous; new maps default-on, classic opt-in).
3. SidebarRoot left in codebase unused (shared `navigationItems.ts` prevents drift; deletion deferred to a later stage).
