/**
 * Right index column of the World Map (3A): a compact list, one row per city —
 * mono city name plus a single status line ("you are here" / "invitation
 * waiting" / ticket cost). No derived "why go" summaries (UI-refresh feedback
 * wave 1: clunky is a feature). Narrowed from the mock's 330px to 220px since
 * the list no longer earns the width.
 *
 * Mock hex → token mapping (all exact matches, per the plan's token table):
 *   column bg #0c1118 = bgSidebar; card #0e141b/#22303e = bgPanel/borderCard
 *   current card #152430/#1f4451 = bgActive/borderAccent
 *   names #f0f6fb = textPrimary; footer #55677a = textTertiary
 */
import React from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import type { CityName } from "@enums";
import { CONSTANTS } from "../../Constants";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { formatMoney } from "../formatNumber";

import type { CityIntel } from "./cityIntel";

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
    column: {
      width: "220px",
      flex: "none",
      boxSizing: "border-box",
      borderLeft: `1px solid ${theme.colors.borderDefault as string}`,
      backgroundColor: theme.colors.bgSidebar,
      padding: "20px 14px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    },
    header: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: typeScale.eyebrow, // mock: 9.5px
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
      borderRadius: "8px",
      padding: "8px 12px",
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
    name: {
      display: "block",
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: typeScale.cardTitle, // mock: 12.5px
      fontWeight: 600,
      color: theme.colors.textPrimary,
    },
    nameCurrent: {
      color: theme.colors.accentCyan,
    },
    status: {
      display: "block",
      fontSize: typeScale.caption, // mock: 10.5px
      fontWeight: 500,
      color: theme.colors.textTertiary,
      marginTop: "2px",
      whiteSpace: "nowrap",
    },
    statusMono: {
      fontFamily: Settings.styles.monoFontFamily,
    },
    // Invitation status echoes the map's cyan invitation nodes.
    statusInvite: {
      color: theme.colors.accentCyan,
    },
  };
});

/** One-line status: current city > pending invitation > ticket cost. */
function statusFor(intel: CityIntel): { text: string; invite: boolean; mono: boolean } {
  if (intel.isCurrent) return { text: "you are here", invite: false, mono: false };
  if (intel.pendingInvitations.length > 0) return { text: "invitation waiting", invite: true, mono: false };
  return { text: formatMoney(CONSTANTS.TravelCost), invite: false, mono: true };
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
  // Current city first; others keep enum order.
  const ordered = [...intel].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));

  return (
    <div className={classes.column}>
      <div className={classes.header}>CITIES</div>
      {ordered.map((cityIntel) => {
        const status = statusFor(cityIntel);
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
            <span className={cx(classes.name, cityIntel.isCurrent && classes.nameCurrent)}>{cityIntel.city}</span>
            <span className={cx(classes.status, status.invite && classes.statusInvite, status.mono && classes.statusMono)}>
              {status.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
