/**
 * Station card for the City Transit Map (3B): right-top popover (262px per the
 * mock) with the station name, line-membership chips, contextual content and
 * an "Enter" CTA colored by the station's primary category.
 *
 * Contextual content:
 *  - Slums: crime list — same data SlumsLocation shows (crime.type, success %,
 *    payout). Success-rate color coding mirrors the mock (48% green / 31% gold
 *    / 12% red): ≥40% accentGreen, ≥20% accentGold, else accentRed.
 *  - Gym/University: public costMult/expMult lines.
 *  - Everything else: the location's types line.
 *
 * Mock hex → token mapping (per the plan's token table):
 *   card bg #101823 → bgPanel; border #2a4152 = borderFocus (exact)
 *   name #f0f6fb = textPrimary; type line #7d8fa1 = textSecondary
 *   crime names #9fb1c1 → textSecondary; values green/gold/red = accent tokens (exact)
 *   CTA text #0a0518 → bgApp
 */
import React from "react";
import { lighten, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { LocationType } from "@enums";
import { Crimes } from "../../Crime/Crimes";
import type { Location } from "../../Locations/Location";
import { Player } from "@player";
import { Settings } from "../../Settings/Settings";
import { formatMoney, formatPercent } from "../formatNumber";

import { categoriesOf, isInterchange, primaryCategoryOf, type TransitCategory } from "./cityMapLayouts";

export const STATION_CARD_WIDTH = 262;

/** Success-rate color thresholds (reproduce the mock's 48% green / 31% gold / 12% red). */
const SUCCESS_GOOD = 0.4;
const SUCCESS_MID = 0.2;

const useStyles = makeStyles()((theme: Theme) => ({
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
    fontSize: "13px",
    fontWeight: 600,
    color: theme.colors.textPrimary,
    marginBottom: "2px",
  },
  typeLine: {
    fontSize: "10.5px",
    fontWeight: 400,
    color: theme.colors.textSecondary,
    marginBottom: "8px",
  },
  chips: {
    display: "flex",
    gap: "6px",
    marginBottom: "10px",
  },
  chip: {
    fontSize: "10px",
    fontWeight: 500,
    borderRadius: "4px",
    padding: "1px 7px",
    border: "1px solid",
  },
  infoList: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    fontSize: "11px",
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
    color: theme.colors.bgApp,
    font: "inherit",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 120ms ease-out",
  },
  ctaCommerce: {
    backgroundColor: theme.colors.accentGold,
    "&:hover": { backgroundColor: lighten(theme.colors.accentGold as string, 0.15) },
  },
  ctaTraining: {
    backgroundColor: theme.colors.accentGreen,
    "&:hover": { backgroundColor: lighten(theme.colors.accentGreen as string, 0.15) },
  },
  ctaStreet: {
    backgroundColor: theme.colors.accentViolet,
    "&:hover": { backgroundColor: lighten(theme.colors.accentViolet as string, 0.15) },
  },
}));

function categoryColors(theme: Theme): Record<TransitCategory, string> {
  return {
    commerce: theme.colors.accentGold as string,
    training: theme.colors.accentGreen as string,
    street: theme.colors.accentViolet as string,
  };
}

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
  const { classes, cx, theme } = useStyles();
  const colors = categoryColors(theme);
  const categories = categoriesOf(location.types);
  const primary = primaryCategoryOf(location.types);
  const interchange = isInterchange(location.types);

  const isSlums = location.types.includes(LocationType.Slums);
  const isTraining = location.types.includes(LocationType.Gym) || location.types.includes(LocationType.University);

  const typeLine = interchange
    ? `Interchange · ${categories.map((category) => `${category} line`).join(" ✕ ")}`
    : `${primary.charAt(0).toUpperCase()}${primary.slice(1)} line`;

  return (
    <div className={classes.card} data-station-card={location.name}>
      <div className={classes.name}>{location.name}</div>
      <div className={classes.typeLine}>{typeLine}</div>
      <div className={classes.chips}>
        {categories.map((category) => (
          <span key={category} className={classes.chip} style={{ borderColor: colors[category], color: colors[category] }}>
            {category}
          </span>
        ))}
      </div>
      {isSlums ? (
        <SlumsContent classes={classes} cx={cx} />
      ) : isTraining ? (
        <div className={classes.infoList}>
          <div className={classes.infoRow}>
            <span className={classes.infoLeft}>training exp</span>
            <span className={cx(classes.infoValue, classes.successGood)}>×{location.expMult}</span>
          </div>
          <div className={classes.infoRow}>
            <span className={classes.infoLeft}>cost</span>
            <span className={cx(classes.infoValue, classes.successMid)}>×{location.costMult}</span>
          </div>
        </div>
      ) : (
        <div className={classes.infoList}>
          <div className={classes.infoRow}>
            <span className={classes.infoLeft}>{location.types.join(" · ")}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        className={cx(
          classes.cta,
          primary === "commerce" && classes.ctaCommerce,
          primary === "training" && classes.ctaTraining,
          primary === "street" && classes.ctaStreet,
        )}
        onClick={() => toLocation(location)}
      >
        Enter {location.name}
      </button>
    </div>
  );
}
