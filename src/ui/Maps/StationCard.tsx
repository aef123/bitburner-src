/**
 * Station card for the City Transit Map (3B): right-top popover (262px) with
 * the station name, its location types, contextual content and an "Enter" CTA.
 *
 * Contextual content ("clunky is a feature": only what the in-location screen
 * itself shows):
 *  - Slums: crime list — same data SlumsLocation shows (crime.type, success %,
 *    payout). Success-rate coloring: ≥40% accentGreen, ≥20% accentGold, else
 *    accentRed.
 *  - Everything else: nothing beyond the types line. Gym/university
 *    multipliers and other derived previews are deliberately NOT shown.
 *
 * The CTA is the neutral primary (accentCyan, like other primary buttons) —
 * no category coloring, no line-membership chips.
 *
 * Token mapping: card bg → bgPanel; border → borderFocus; name → textPrimary;
 * types line → textSecondary; CTA bg → accentCyan, CTA text → bgApp.
 */
import React from "react";
import { lighten, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { LocationType } from "@enums";
import { Crimes } from "../../Crime/Crimes";
import type { Location } from "../../Locations/Location";
import { Player } from "@player";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { formatMoney, formatPercent } from "../formatNumber";

export const STATION_CARD_WIDTH = 262;

/** Success-rate color thresholds (48% green / 31% gold / 12% red in the mock). */
const SUCCESS_GOOD = 0.4;
const SUCCESS_MID = 0.2;

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
    card: {
      position: "absolute",
      right: "24px",
      top: "20px",
      width: `${STATION_CARD_WIDTH}px`,
      boxSizing: "border-box",
      backgroundColor: theme.colors.bgPanel,
      border: `1px solid ${theme.colors.borderFocus as string}`,
      borderRadius: "12px",
      padding: "14px 16px",
      boxShadow: "0 16px 40px rgba(0, 0, 0, 0.55)",
      zIndex: 4,
    },
    name: {
      fontSize: typeScale.cardTitle,
      fontWeight: 600,
      color: theme.colors.textPrimary,
      marginBottom: "2px",
    },
    typeLine: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      marginBottom: "10px",
    },
    infoList: {
      display: "flex",
      flexDirection: "column",
      gap: "5px",
      fontSize: typeScale.body,
      marginBottom: "12px",
    },
    infoRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: "8px",
    },
    infoLeft: {
      color: theme.colors.textSecondary,
    },
    infoValue: {
      fontFamily: Settings.styles.monoFontFamily,
      fontWeight: 500, // weight floor: small mono values never render at 400
      whiteSpace: "nowrap",
    },
    successGood: {
      color: theme.colors.accentGreen,
    },
    successMid: {
      color: theme.colors.accentGold,
    },
    successLow: {
      color: theme.colors.accentRed,
    },
    cta: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "30px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: theme.colors.accentCyan,
      color: theme.colors.bgApp,
      font: "inherit",
      fontSize: typeScale.body,
      fontWeight: 600,
      cursor: "pointer",
      transition: "background-color 120ms ease-out",
      "&:hover": {
        backgroundColor: lighten(theme.colors.accentCyan as string, 0.15),
      },
    },
  };
});

function SlumsContent({
  classes,
  cx,
}: {
  classes: Record<"infoList" | "infoRow" | "infoLeft" | "infoValue" | "successGood" | "successMid" | "successLow", string>;
  cx: (...args: (string | false)[]) => string;
}): React.ReactElement {
  return (
    <div className={classes.infoList}>
      {Object.values(Crimes).map((crime) => {
        const successRate = crime.successRate(Player);
        const successClass =
          successRate >= SUCCESS_GOOD
            ? classes.successGood
            : successRate >= SUCCESS_MID
              ? classes.successMid
              : classes.successLow;
        return (
          <div className={classes.infoRow} key={crime.workName}>
            <span className={classes.infoLeft}>{crime.type}</span>
            <span className={cx(classes.infoValue, successClass)}>
              {formatPercent(successRate)} · {formatMoney(crime.money)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function StationCard({
  location,
  toLocation,
}: {
  location: Location;
  toLocation: (location: Location) => void;
}): React.ReactElement {
  const { classes, cx } = useStyles();
  const isSlums = location.types.includes(LocationType.Slums);

  return (
    <div className={classes.card} data-station-card={location.name}>
      <div className={classes.name}>{location.name}</div>
      <div className={classes.typeLine}>{location.types.join(" · ")}</div>
      {isSlums && <SlumsContent classes={classes} cx={cx} />}
      <button type="button" className={classes.cta} onClick={() => toLocation(location)}>
        Enter {location.name}
      </button>
    </div>
  );
}
