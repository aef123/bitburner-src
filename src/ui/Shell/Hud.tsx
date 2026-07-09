/**
 * Docked HUD panel (Task 4) — functional replacement for the floating CharacterOverview when the
 * shell is active. 272px column per design-notes-1A: money block with sparkline, skill rows with
 * 4px progress bars, current-action card, Bladeburner line, script-injection hooks, and
 * bottom-pinned Save / Kill Scripts buttons (deliberate deviation from the mock's "Soft reset" —
 * functionality parity with the floating overview, and a destructive button next to Save is a
 * footgun).
 *
 * Script-injection hooks: the floating overview exposes DOM ids that scripts write into
 * (overview-extra-hook-0/1/2 plus per-stat overview-*-hook ids). All of them are preserved here
 * so scripts keep working when the HUD replaces the floating widget. The HUD and the floating
 * overview are never mounted at the same time, so the ids stay unique.
 */
import React, { useState } from "react";
import { alpha, type Theme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { currentNodeMults } from "../../BitNode/BitNodeMultipliers";
import { calculateSkillProgress } from "../../PersonObjects/formulas/skill";
import { RemoteFileApiConnectionStatus } from "../../GameOptions/ui/RemoteFileApiConnectionStatus";
import { Settings } from "../../Settings/Settings";
import { formatExp, formatMoney, formatMoneyNoSuffix, formatNumberNoSuffix, formatSkill } from "../formatNumber";
import { useCycleRerender } from "../React/hooks";
import { KillScriptsModal } from "../React/KillScriptsModal";
import { ActionCard } from "./ActionCard";
import { setHudCollapsed } from "./hudEvents";
import { calculateMoneyRate, getMoneyHistory, Sparkline } from "./Sparkline";

// ─── Skill row data (mirrors CharacterOverview/StatsProgressBar) ──────────

type SkillName = "hacking" | "strength" | "defense" | "dexterity" | "agility" | "charisma" | "intelligence";

interface HudSkillRow {
  /** Short label, matching the floating overview's row names (also used for hook ids). */
  name: "Hack" | "Str" | "Def" | "Dex" | "Agi" | "Cha" | "Int";
  skill: SkillName;
  /** Same mult sources as StatsProgressBar's skillMultUpdaters. */
  mult: () => number;
}

const hudSkillRows: HudSkillRow[] = [
  { name: "Hack", skill: "hacking", mult: () => Player.mults.hacking * currentNodeMults.HackingLevelMultiplier },
  { name: "Str", skill: "strength", mult: () => Player.mults.strength * currentNodeMults.StrengthLevelMultiplier },
  { name: "Def", skill: "defense", mult: () => Player.mults.defense * currentNodeMults.DefenseLevelMultiplier },
  { name: "Dex", skill: "dexterity", mult: () => Player.mults.dexterity * currentNodeMults.DexterityLevelMultiplier },
  { name: "Agi", skill: "agility", mult: () => Player.mults.agility * currentNodeMults.AgilityLevelMultiplier },
  { name: "Cha", skill: "charisma", mult: () => Player.mults.charisma * currentNodeMults.CharismaLevelMultiplier },
  { name: "Int", skill: "intelligence", mult: () => 1 },
];

// ─── Styles ───────────────────────────────────────────────────────────────

const useStyles = makeStyles()((theme: Theme) => {
  const accentGreen = theme.colors.accentGreen as string;
  const accentRed = theme.colors.accentRed as string;
  return {
    hud: {
      width: "272px",
      height: "100%",
      boxSizing: "border-box",
      backgroundColor: theme.colors.bgSidebar,
      borderLeft: `1px solid ${theme.colors.borderDefault as string}`,
      padding: "18px 16px",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      overflowY: "auto",
      overflowX: "hidden",
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": {
        display: "none",
      },
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLabel: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: ".16em",
      color: theme.colors.textTertiary,
      userSelect: "none",
    },
    collapseButton: {
      background: "none",
      border: "none",
      padding: "0 2px",
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "12px",
      color: theme.colors.textTertiary,
      cursor: "pointer",
      lineHeight: 1,
      transition: "color 120ms ease-out",
      "&:hover": {
        color: theme.colors.textSecondary,
      },
    },
    moneyBlock: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: "10px",
    },
    moneyLabel: {
      fontSize: "10.5px",
      fontWeight: 400,
      color: theme.colors.textSecondary,
      marginBottom: "2px",
    },
    moneyValue: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "18px",
      fontWeight: 700,
      color: theme.colors.accentGold,
      whiteSpace: "nowrap",
    },
    moneyRatePositive: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "10px",
      fontWeight: 500,
      color: accentGreen,
      marginTop: "2px",
    },
    moneyRateNegative: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "10px",
      fontWeight: 500,
      color: accentRed,
      marginTop: "2px",
    },
    divider: {
      height: "1px",
      flex: "none",
      backgroundColor: theme.colors.borderDefault,
    },
    stats: {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    },
    statRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      fontSize: "11px",
      fontWeight: 500,
      marginBottom: "4px",
    },
    statValue: {
      fontFamily: Settings.styles.monoFontFamily,
      display: "inline-flex",
      alignItems: "baseline",
      gap: "6px",
    },
    statTrack: {
      height: "4px",
      borderRadius: "2px",
      backgroundColor: theme.colors.track,
      overflow: "hidden",
    },
    statFill: {
      height: "100%",
      // Progress animates per the global interaction rules.
      transition: "width 300ms ease-out",
    },
    hook: {
      fontFamily: Settings.styles.monoFontFamily,
    },
    extraHooks: {
      display: "flex",
      flexDirection: "column",
    },
    bladeburner: {
      fontSize: "11px",
      color: theme.colors.textBody,
    },
    footer: {
      marginTop: "auto",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    footerButton: {
      flex: 1,
      height: "30px",
      border: `1px solid ${theme.colors.borderCard as string}`,
      borderRadius: "8px",
      background: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "11px",
      fontWeight: 500,
      fontFamily: "inherit",
      color: theme.colors.textSecondary,
      cursor: "pointer",
      transition: "border-color 120ms ease-out, color 120ms ease-out",
      "&:hover": {
        borderColor: theme.colors.borderFocus,
        color: theme.colors.textBody,
      },
    },
    footerButtonDanger: {
      color: accentRed,
      "&:hover": {
        color: accentRed,
        borderColor: alpha(accentRed, 0.5),
      },
    },
  };
});

// ─── Sub-pieces ───────────────────────────────────────────────────────────

/** Skill value; ports Val's intelligence-override tooltip from CharacterOverview. */
function SkillValue({ row }: { row: HudSkillRow }): React.ReactElement {
  if (row.name === "Int" && Player.bitNodeOptions.intelligenceOverride !== undefined) {
    return (
      <Tooltip
        title={`Persistent Intelligence: ${formatSkill(
          Player.calculateSkill(Player.persistentIntelligenceData.exp, 1),
        )}`}
      >
        <span>
          {formatSkill(Player.skills.intelligence)}
          <sup>*</sup>
        </span>
      </Tooltip>
    );
  }
  // Exact value on hover per the global interaction rules (formatSkill collapses to suffixes at 1e9).
  return (
    <Tooltip title={formatNumberNoSuffix(Player.skills[row.skill])}>
      <span>{formatSkill(Player.skills[row.skill])}</span>
    </Tooltip>
  );
}

interface SkillRowColors {
  label: string | undefined;
  bar: string | undefined;
}

/** Per-skill colors per design-notes-1A (Int is not in the mock; violet matches the game's int accent). */
function getSkillRowColors(row: HudSkillRow, theme: Theme): SkillRowColors {
  switch (row.name) {
    case "Hack":
      return { label: theme.colors.accentCyan, bar: theme.colors.accentCyan };
    case "Cha":
      return { label: theme.colors.accentPink, bar: theme.colors.accentPink };
    case "Int":
      return { label: theme.colors.accentViolet, bar: theme.colors.accentViolet };
    default:
      // Combat rows: near-white label/value, muted bar. Mock bar #5c7186 has no token;
      // textSecondary is the nearest.
      return { label: theme.colors.textBody, bar: theme.colors.textSecondary };
  }
}

function HudSkill({ row, showBar }: { row: HudSkillRow; showBar: boolean }): React.ReactElement {
  const { classes, theme } = useStyles();
  const colors = getSkillRowColors(row, theme);
  const progress = calculateSkillProgress(Player.exp[row.skill], row.mult());
  const barTooltip = (
    <Typography sx={{ textAlign: "right" }}>
      <strong>Progress:</strong>&nbsp;{formatExp(progress.currentExperience)} ({progress.progress.toFixed(2)}%)
      <br />
      <strong>Remaining:</strong>&nbsp;{formatExp(progress.remainingExperience)} /{" "}
      {formatExp(progress.nextExperience - progress.baseExperience)}
    </Typography>
  );
  return (
    <div data-skill={row.name}>
      <div className={classes.statRow} style={{ color: colors.label }}>
        <span>{row.name}</span>
        <span className={classes.statValue}>
          <SkillValue row={row} />
          {/* Script-injection hook, same id scheme as the floating overview's DataRow. */}
          <span id={`overview-${row.name.toLowerCase()}-hook`} className={classes.hook} />
        </span>
      </div>
      {showBar && (
        <Tooltip title={barTooltip}>
          <div className={classes.statTrack}>
            <div
              className={classes.statFill}
              style={{ width: `${progress.progress}%`, backgroundColor: colors.bar }}
            />
          </div>
        </Tooltip>
      )}
    </div>
  );
}

/** Port of CharacterOverview's BladeburnerText (shown while a Bladeburner action runs). */
function BladeburnerLine(): React.ReactElement | null {
  const { classes } = useStyles();
  const action = Player.bladeburner?.action;
  if (!action) return null;
  return (
    <div className={classes.bladeburner}>
      Bladeburner: {action.type}: {action.name}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export function Hud({ save, killScripts }: { save: () => void; killScripts: () => void }): React.ReactElement {
  useCycleRerender();
  const { classes, cx, theme } = useStyles();
  const [killOpen, setKillOpen] = useState(false);

  const samples = getMoneyHistory().samples();
  const rate = calculateMoneyRate(samples);
  const showBars = !Settings.DisableOverviewProgressBars;
  const hasIntelligence = Player.skills.intelligence > 0;
  const autosaveDisabled = Settings.AutosaveInterval === 0;

  return (
    <aside className={classes.hud} aria-label="Character overview">
      <div className={classes.header}>
        <span className={classes.headerLabel}>OVERVIEW</span>
        <button
          type="button"
          className={classes.collapseButton}
          aria-label="Collapse overview panel"
          onClick={() => setHudCollapsed(true)}
        >
          ⌃
        </button>
      </div>

      <div className={classes.moneyBlock}>
        <div>
          <div className={classes.moneyLabel}>Money</div>
          {/* Formatted numbers show their exact value on hover, per the global interaction rules. */}
          <Tooltip title={formatMoneyNoSuffix(Player.money)}>
            <div className={classes.moneyValue}>
              {formatMoney(Player.money)} <span id="overview-money-hook" className={classes.hook} />
            </div>
          </Tooltip>
          <div className={rate < 0 ? classes.moneyRateNegative : classes.moneyRatePositive}>
            {rate < 0 ? "" : "+"}
            {formatMoney(rate)}/s
          </div>
          {/* HP has no HUD row (the top bar owns it); keep the script-injection hook alive here. */}
          <span id="overview-hp-hook" className={classes.hook} />
        </div>
        <Sparkline values={samples.map((sample) => sample.money)} />
      </div>

      <div className={classes.divider} />

      <div className={classes.stats}>
        {hudSkillRows
          .filter((row) => row.name !== "Int" || hasIntelligence)
          .map((row) => (
            <HudSkill key={row.name} row={row} showBar={showBars} />
          ))}
      </div>

      {/* Same Typography hooks (ids AND hack text color) as the floating overview's extra-hook row. */}
      <div className={classes.extraHooks}>
        <Typography id="overview-extra-hook-0" color={theme.colors.hack} />
        <Typography id="overview-extra-hook-1" color={theme.colors.hack} />
        <Typography id="overview-extra-hook-2" color={theme.colors.hack} />
      </div>

      <ActionCard />
      <BladeburnerLine />

      <div className={classes.footer}>
        <Tooltip title={autosaveDisabled ? "Save game (auto-saves are disabled!)" : "Save game"}>
          <button
            type="button"
            className={cx(classes.footerButton, autosaveDisabled && classes.footerButtonDanger)}
            aria-label="save game"
            onClick={save}
          >
            Save
          </button>
        </Tooltip>
        <RemoteFileApiConnectionStatus showIcon={true} />
        <Tooltip title="Kill all running scripts">
          <button
            type="button"
            className={cx(classes.footerButton, classes.footerButtonDanger)}
            aria-label="kill all scripts"
            onClick={() => setKillOpen(true)}
          >
            Kill Scripts
          </button>
        </Tooltip>
      </div>

      <KillScriptsModal open={killOpen} onClose={() => setKillOpen(false)} killScripts={killScripts} />
    </aside>
  );
}
