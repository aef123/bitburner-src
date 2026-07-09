/**
 * Right index column of the World Map (3A): one card per city with a "why go"
 * summary built from the cityIntel selectors. Current city card highlighted
 * cyan. Geometry/typography per design-notes-3A (330px, 10px-radius cards).
 *
 * Mock hex → token mapping (all exact matches, per the plan's token table):
 *   column bg #0c1118 = bgSidebar; card #0e141b/#22303e = bgPanel/borderCard
 *   current card #152430/#1f4451 = bgActive/borderAccent
 *   names #f0f6fb = textPrimary; descriptions #7d8fa1 = textSecondary
 *   footer #55677a = textTertiary; badges: accentGreen (actionable) / textSecondary
 */
import React from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import type { CityName } from "@enums";
import { Factions } from "../../Faction/Factions";
import { Settings } from "../../Settings/Settings";
import { formatReputation } from "../formatNumber";

import type { CityIntel } from "./cityIntel";
import { worldMapCities } from "./worldMapData";

const useStyles = makeStyles()((theme: Theme) => ({
  column: {
    width: "330px",
    flex: "none",
    boxSizing: "border-box",
    borderLeft: `1px solid ${theme.colors.borderDefault as string}`,
    backgroundColor: theme.colors.bgSidebar,
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  header: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "9.5px",
    fontWeight: 600,
    color: theme.colors.textTertiary,
    letterSpacing: "0.16em",
    marginBottom: "6px",
  },
  card: {
    display: "block",
    width: "100%",
    textAlign: "left",
    boxSizing: "border-box",
    backgroundColor: theme.colors.bgPanel,
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "10px",
    padding: "12px 14px",
    font: "inherit",
    cursor: "pointer",
    transition: "border-color 120ms ease-out",
    "&:hover": {
      borderColor: theme.colors.borderFocus,
    },
  },
  cardCurrent: {
    backgroundColor: theme.colors.bgActive,
    border: `1px solid ${theme.colors.borderAccent as string}`,
    cursor: "default",
  },
  cardSelected: {
    borderColor: theme.colors.borderFocus,
  },
  nameRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: "8px",
    fontSize: "12.5px",
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  nameCurrent: {
    color: theme.colors.accentCyan,
  },
  badge: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "9.5px",
    fontWeight: 500,
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
  },
  badgeGood: {
    color: theme.colors.accentGreen,
  },
  description: {
    fontSize: "10.5px",
    color: theme.colors.textSecondary,
    marginTop: "3px",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  spacer: {
    flex: 1,
  },
  footer: {
    fontSize: "10.5px",
    lineHeight: 1.6,
    color: theme.colors.textTertiary,
  },
}));

/** Badge on a city card: current > actionable factions > better training > static neutral. */
function badgeFor(intel: CityIntel): { text: string; good: boolean } {
  if (intel.isCurrent) return { text: "YOU ARE HERE", good: false };
  const actionable = intel.joinableFactions.length + intel.pendingInvitations.length;
  if (actionable > 0) return { text: `${actionable} faction${actionable > 1 ? "s" : ""} ⚑`, good: true };
  if (intel.hasBetterGym || intel.hasBetterUniversity) return { text: "better training", good: false };
  return { text: worldMapCities[intel.city].neutralBadge, good: false };
}

/** "Why go" summary: actionable facts from cityIntel first, static flavor as fallback. */
function whyGo(intel: CityIntel): string {
  const parts: string[] = [];
  if (intel.joinableFactions.length > 0) parts.push(`Join ${intel.joinableFactions.join(", ")}`);
  if (intel.pendingInvitations.length > 0) parts.push(`Invite pending: ${intel.pendingInvitations.join(", ")}`);
  for (const name of intel.memberFactions) {
    parts.push(`${name} rep ${formatReputation(Factions[name].playerReputation)}`);
  }
  if (intel.hasBetterUniversity && intel.bestUniversity) parts.push(`${intel.bestUniversity.name} (better uni)`);
  if (intel.hasBetterGym && intel.bestGym) parts.push(`${intel.bestGym.name} (better gym)`);
  if (parts.length === 0) return worldMapCities[intel.city].flavor;
  return parts.join(" · ");
}

export function CityIndexColumn({
  intel,
  selectedCity,
  onSelect,
}: {
  intel: CityIntel[];
  selectedCity: CityName | null;
  onSelect: (city: CityName) => void;
}): React.ReactElement {
  const { classes, cx } = useStyles();
  // Current city first, like the mock; others keep enum order.
  const ordered = [...intel].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));

  return (
    <div className={classes.column}>
      <div className={classes.header}>CITIES · WHY GO</div>
      {ordered.map((cityIntel) => {
        const badge = badgeFor(cityIntel);
        return (
          <button
            type="button"
            key={cityIntel.city}
            className={cx(
              classes.card,
              cityIntel.isCurrent && classes.cardCurrent,
              cityIntel.city === selectedCity && classes.cardSelected,
            )}
            data-index-city={cityIntel.city}
            onClick={() => onSelect(cityIntel.city)}
          >
            <span className={classes.nameRow}>
              <span className={cx(cityIntel.isCurrent && classes.nameCurrent)}>{cityIntel.city}</span>
              <span className={cx(classes.badge, badge.good && classes.badgeGood)}>{badge.text}</span>
            </span>
            <span className={classes.description}>{whyGo(cityIntel)}</span>
          </button>
        );
      })}
      <div className={classes.spacer} />
      <div className={classes.footer}>
        Cyan = a faction you can join, a pending invite, or a better gym/university than where you are.
      </div>
    </div>
  );
}
