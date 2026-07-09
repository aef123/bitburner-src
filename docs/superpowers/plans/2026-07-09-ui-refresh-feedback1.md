# UI Refresh — Playtest Feedback Wave 1 (2026-07-09)

> Executed via superpowers:subagent-driven-development on branch UIRefresh (base 63a094281 — the readability pass). Global Constraints from the stage 1/2 plans still bind (tokens-only `as string`, mono via Settings.styles.monoFontFamily, formatters, no 100vh, gates per task, Fable co-author trailer).

**NEW GLOBAL PRINCIPLE (binds this plan and all future stages):** *Clunky is a feature.* The UI must NOT surface derived analytics or cross-entity comparisons at all times (no "best gym" stars, no gym/uni-vs-your-city summaries, no rich "why go" text). Players write scripts to enhance their info. Screens show: primary facts the old screen showed, actionable honest signals (pending invitation), and nothing more. Familiar original-game spatial layouts beat mock-invented geometry.

### Task F1 — Quick fixes: palette scroll + income consistency ✅ small
- `src/ui/Shell/CommandPalette.tsx` + `src/ScriptEditor/ui/QuickOpen.tsx`: keyboard ↑/↓ selection must scroll the selected row into view (`scrollIntoView({block:"nearest"})` on selection-index effect, or ref-per-selected). Mouse-wheel behavior unchanged. Test where the pattern is cheaply assertable.
- `src/ui/ActiveScripts/`: header "income $X/s" currently = `Player.scriptProdSinceLastAug/playtime` (avg since aug) while group rows sum live per-script `onlineMoneyMade/onlineRunningTime` → wildly different numbers (user saw $89m/s header vs single groups >$100m/s). Fix: header income/s = SAME live sum as groups (sum over workerScripts — the exp/s total already does this; mirror it). The existing "total $X earned since last augmentation" footer line stays (correctly labeled). Update tests.

### Task F2 — Terminal: reclaim output width (alignment regression)
User's space-padded script output wraps because history (250px) + target (280px) panels shrank the output column. Fix:
- Both panels collapsible: slim edge toggles (~20px collapsed rails with an icon), state persisted as `Settings.TerminalHistoryCollapsed` / `Settings.TerminalTargetCollapsed` (default: **history collapsed, target collapsed** — the terminal ships full-width by default per the clunky-is-a-feature principle; panels are opt-in).
- Collapse/expand 160ms; output `<ul>` must reflow and autoscroll must survive.
- Verify a full-width terminal renders ≥ the pre-refresh usable width (old: full pane minus 16px padding).
- Tests: settings persistence, toggle render, layout class switching.

### Task F3 — World map: original geography + less info
- **Positions:** city nodes move to the ORIGINAL ASCII world map's relative positions — parse/derive from `src/ui/React/WorldMap.tsx` ASCII art (V/C/S/N/A/I letter coordinates → normalized x/y). Volhaven NW-center, Chongqing E, Sector-12 W, New Tokyo E-SE, Aevum W-center, Ishima E-SE per the art.
- **Landmass outlines:** replace the blurred blobs with stroked outline paths tracing the ASCII art's continents (hand-author SVG paths that evoke the original coastline shapes; faint `borderDefault`-ish stroke, no fill or near-transparent fill). Keep graticule.
- **Less info (philosophy):** popover = city name, ticket cost, Fly-to button, pending-invitation line if any (actionable+honest), member-faction rep lines. REMOVE gym/uni quality comparisons, company/flavor summaries. Index column: slim to name + one-line status (current city / invitation pending / nothing) + cost — or evaluate whether the column earns its 330px at all; if not, shrink to a compact list. `cityIntel.ts` simplifies: "has something" = pending invitation only (cyan node rule); joinable-money-threshold and gym/uni comparison logic REMOVED (delete dead code + tests updated).
- Flight arcs + node states otherwise keep current styling.

### Task F4 — City maps: original layout, single-color subway
- **Kill the category system:** no Commerce/Training/Street colors, no interchanges-by-category, no legend rows for categories, no ★ best-gym glyph (derived analytics). `StationCard` keeps name + "Enter" (neutral primary styling) + the same per-location content the old location screen previews (Slums crime list stays — it's what the in-location screen shows).
- **Station positions from the original ASCII art:** each `City.asciiArt` encodes location positions as A-Z letters (see `ASCIICity` letterMap, `src/Locations/ui/City.tsx:67-135`). Parse letter row/col per city → normalized SVG coords (module `cityAsciiPositions.ts`, unit-tested against all 6 cities: every location letter found exactly once, positions in bounds). The Void stays hidden (existing HIDDEN_CITY_LOCATIONS).
- **Subway lines, one color:** connect stations with subway-style polylines (rounded 5px, 45°/90° segments) in ONE new color distinct from the old category palette (recommend a steel/slate blue derived from `borderFocus`/`textTertiary` family, or a single muted violet — implementer picks ONE, documents token mapping). Route lines to pass through/near station sequence sensibly (nearest-neighbor chain or per-city hand-authored waypoint list following the ASCII art's street shapes — implementer judgment, tested for: every station touched by a line).
- Station glyphs: single style (8px circle, line-color stroke); labels stay per readability pass; hover/selection + click-to-location unchanged; legend reduces to a single "station" entry or disappears.
- `cityMapLayouts.ts` category machinery: delete or reduce; coverage tests (every location exactly once, positions in bounds, clickable) survive and keep passing.

**Order:** F1 → F2 → F3 → F4, review each (F1 may skip to a light review). Push after the wave passes a final gate run.
