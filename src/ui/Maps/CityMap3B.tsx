/**
 * City Transit Map (3B) — the redesigned city view. The city renders as a
 * transit map: three category-colored lines (Commerce gold, Training green,
 * Street violet) with every location as a station. Geometry comes from
 * cityMapLayouts.ts (Volhaven verbatim from the design mock, the other five
 * cities hand-authored in the same language); station category and the
 * interchange flag are always computed from the real Location.types, and the
 * layout coverage tests keep the data honest.
 *
 * Interactions: clicking a station enters it (same toLocation logic as the
 * classic maps); hovering/focusing shows the StationCard with details and an
 * "Enter" CTA. Best-in-city gym gets ★; ⚑ appears on a station only when the
 * player is a member of (or has a pending invitation from) the faction that
 * shares the location's exact name — no undiscovered-faction leaks. (Fulcrum
 * Secret Technologies has no same-named location, so it never flags.)
 *
 * Mock hex → token mapping (see the plan's token table):
 *   canvas #080b0f → bgApp; grid rgba(76,201,232,.03) → alpha(accentCyan, .03)
 *   line colors gold/green/violet = accentGold/accentGreen/accentViolet (exact)
 *   station fill #0a0e13 → bgPanelDeep; interchange stroke #f0f6fb = textPrimary (exact)
 *   labels #dbe7f0 = textBody; glow rgba(89,224,165,.5)/rgba(157,140,255,.5) →
 *   alpha(accentGreen, .5)/alpha(accentViolet, .5)
 *   legend bg rgba(10,14,19,.85) → alpha(bgApp, .85); border #1a232e = borderDefault (exact)
 */
import React, { useState } from "react";
import { alpha, lighten, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { LocationName, LocationType } from "@enums";
import type { City } from "../../Locations/City";
import type { Location } from "../../Locations/Location";
import { Locations } from "../../Locations/Locations";
import { Player } from "@player";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { useCycleRerender } from "../React/hooks";

import {
  bestGymOf,
  CITY_MAP_HEIGHT,
  CITY_MAP_WIDTH,
  cityMapLayouts,
  isInterchange,
  primaryCategoryOf,
  TRANSIT_CATEGORIES,
  type StationLayout,
  type TransitCategory,
} from "./cityMapLayouts";
import { StationCard } from "./StationCard";

// Station node geometry, per the mock: regular r=8 / stroke 3, interchange
// r=12 / stroke 3.5. Rendered as border-box buttons: width = 2r + stroke
// keeps the same outer diameter and fill area as the mock's SVG circles.
const STATION_SIZE = 19;
const STATION_BORDER = 3;
const INTERCHANGE_SIZE = 27.5;
const INTERCHANGE_BORDER = 3.5;

const useStyles = makeStyles()((theme: Theme) => {
  const accentCyan = theme.colors.accentCyan as string;
  const accentGreen = theme.colors.accentGreen as string;
  const accentViolet = theme.colors.accentViolet as string;
  const textPrimary = theme.colors.textPrimary as string;
  const bgApp = theme.colors.bgApp as string;
  const typeScale = getTypeScale();
  return {
    canvas: {
      position: "relative",
      width: `${CITY_MAP_WIDTH}px`,
      height: `${CITY_MAP_HEIGHT}px`,
      marginTop: "8px",
      border: `1px solid ${theme.colors.borderDefault as string}`,
      borderRadius: "12px",
      overflow: "hidden",
      backgroundColor: bgApp,
      // Faint cyan grid texture, per the mock.
      backgroundImage: `linear-gradient(${alpha(accentCyan, 0.03)} 1px, transparent 1px),
        linear-gradient(90deg, ${alpha(accentCyan, 0.03)} 1px, transparent 1px)`,
      backgroundSize: "40px 40px",
    },
    svg: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
    },
    header: {
      position: "absolute",
      top: "20px",
      left: "24px",
      zIndex: 3,
      pointerEvents: "none",
    },
    headerTitle: {
      fontSize: typeScale.heading, // mock: 18px
      fontWeight: 700,
      color: textPrimary,
    },
    headerSubtitle: {
      fontSize: typeScale.body, // mock: 11.5px
      fontWeight: 400,
      color: theme.colors.textSecondary,
      marginTop: "2px",
    },
    station: {
      position: "absolute",
      boxSizing: "border-box",
      width: `${STATION_SIZE}px`,
      height: `${STATION_SIZE}px`,
      padding: 0,
      borderRadius: "50%",
      borderStyle: "solid",
      borderWidth: `${STATION_BORDER}px`,
      backgroundColor: theme.colors.bgPanelDeep,
      cursor: "pointer",
      zIndex: 2,
      transition: "box-shadow 120ms ease-out, border-color 120ms ease-out",
    },
    interchange: {
      width: `${INTERCHANGE_SIZE}px`,
      height: `${INTERCHANGE_SIZE}px`,
      borderWidth: `${INTERCHANGE_BORDER}px`,
      borderColor: textPrimary,
      "&:hover, &:focus-visible": {
        boxShadow: `0 0 14px ${alpha(textPrimary, 0.45)}`,
      },
    },
    stationCommerce: {
      borderColor: theme.colors.accentGold,
      "&:hover, &:focus-visible": {
        borderColor: lighten(theme.colors.accentGold as string, 0.25),
        boxShadow: `0 0 12px ${alpha(theme.colors.accentGold as string, 0.45)}`,
      },
    },
    stationTraining: {
      borderColor: accentGreen,
      "&:hover, &:focus-visible": {
        borderColor: lighten(accentGreen, 0.25),
        boxShadow: `0 0 12px ${alpha(accentGreen, 0.45)}`,
      },
    },
    stationStreet: {
      borderColor: accentViolet,
      "&:hover, &:focus-visible": {
        borderColor: lighten(accentViolet, 0.25),
        boxShadow: `0 0 12px ${alpha(accentViolet, 0.45)}`,
      },
    },
    label: {
      // Caption (not body) on purpose: station labels sit on fixed mock coordinates and
      // going any larger makes dense rows collide.
      position: "absolute",
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: typeScale.caption, // mock: 11px
      fontWeight: 500,
      color: theme.colors.textBody,
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: 2,
    },
    labelCentered: {
      transform: "translateX(-50%)",
    },
    // Interchange / faction-flag stations read as "important" per the mock.
    labelImportant: {
      fontSize: typeScale.body, // mock: 11.5px
      fontWeight: 600,
      color: textPrimary,
    },
    // Best-in-city gym: green glow.
    labelBestGym: {
      fontWeight: 600,
      color: accentGreen,
      textShadow: `0 0 12px ${alpha(accentGreen, 0.5)}`,
    },
    // The Slums: violet glow.
    labelSlums: {
      fontSize: typeScale.body, // mock: 11.5px
      fontWeight: 600,
      color: accentViolet,
      textShadow: `0 0 12px ${alpha(accentViolet, 0.5)}`,
    },
    legend: {
      position: "absolute",
      left: "24px",
      bottom: "20px",
      display: "flex",
      gap: "18px",
      alignItems: "center",
      backgroundColor: alpha(bgApp, 0.85),
      border: `1px solid ${theme.colors.borderDefault as string}`,
      borderRadius: "10px",
      padding: "10px 14px",
      fontSize: typeScale.caption, // mock: 10.5px
      fontWeight: 500,
      color: theme.colors.textSecondary,
      zIndex: 3,
      pointerEvents: "none",
    },
    legendItem: {
      display: "flex",
      alignItems: "center",
      gap: "5px",
      whiteSpace: "nowrap",
    },
    legendSwatch: {
      display: "inline-block",
      width: "14px",
      height: "4px",
      borderRadius: "2px",
      flex: "none",
    },
    legendInterchange: {
      display: "inline-block",
      boxSizing: "content-box",
      width: "9px",
      height: "9px",
      borderRadius: "50%",
      border: `2.5px solid ${textPrimary}`,
      flex: "none",
    },
  };
});

const LEGEND_LABELS: Record<TransitCategory, string> = {
  commerce: "Commerce — corps & jobs",
  training: "Training — gym & university",
  street: "Street — crime & factions",
};

function lineColors(theme: Theme): Record<TransitCategory, string> {
  return {
    commerce: theme.colors.accentGold as string,
    training: theme.colors.accentGreen as string,
    street: theme.colors.accentViolet as string,
  };
}

function labelPosition(station: StationLayout): { style: React.CSSProperties; centered: boolean } {
  if (station.label) {
    return { style: { left: station.label.x, top: station.label.y }, centered: false };
  }
  // Default: centered below the node; labelAbove staggers dense rows.
  return {
    style: { left: station.x, top: station.labelAbove ? station.y - 30 : station.y + 16 },
    centered: true,
  };
}

export function CityMap3B({
  city,
  toLocation,
}: {
  city: City;
  toLocation: (location: Location) => void;
}): React.ReactElement {
  useCycleRerender();
  const { classes, cx, theme } = useStyles();
  const [active, setActive] = useState<LocationName | null>(null);

  const layout = cityMapLayouts[city.name];
  const colors = lineColors(theme);
  const bestGym = bestGymOf(city.name);
  // ⚑ honesty rule: only factions the player is a member of or invited to, and
  // only via an exact location-name match. Nothing rumor-gated ever shows.
  const knownFactions = new Set<string>([...Player.factions, ...Player.factionInvitations]);

  const stationEntries = Object.entries(layout.stations) as [LocationName, StationLayout][];
  const activeLocation = active && layout.stations[active] ? Locations[active] : null;

  return (
    <div
      className={classes.canvas}
      onClick={(event) => {
        // Clicks on empty canvas (not a station/card) dismiss the card.
        if (event.target === event.currentTarget) setActive(null);
      }}
    >
      <svg
        className={classes.svg}
        width={CITY_MAP_WIDTH}
        height={CITY_MAP_HEIGHT}
        viewBox={`0 0 ${CITY_MAP_WIDTH} ${CITY_MAP_HEIGHT}`}
        aria-hidden="true"
      >
        {TRANSIT_CATEGORIES.map((category) => (
          <path
            key={category}
            d={layout.lines[category]}
            fill="none"
            stroke={colors[category]}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        ))}
      </svg>
      <div className={classes.header}>
        <div className={classes.headerTitle}>{city.name}</div>
        <div className={classes.headerSubtitle}>
          {stationEntries.length} locations · travel inside a city is free &amp; instant
        </div>
      </div>
      {stationEntries.map(([name, station]) => {
        const location = Locations[name];
        const interchange = isInterchange(location.types);
        const primary = primaryCategoryOf(location.types);
        const size = interchange ? INTERCHANGE_SIZE : STATION_SIZE;
        const isBestGym = name === bestGym;
        const isSlums = location.types.includes(LocationType.Slums);
        const factionFlag = knownFactions.has(location.name);
        const label = labelPosition(station);
        return (
          <React.Fragment key={name}>
            <button
              type="button"
              className={cx(
                classes.station,
                primary === "commerce" && classes.stationCommerce,
                primary === "training" && classes.stationTraining,
                primary === "street" && classes.stationStreet,
                interchange && classes.interchange,
              )}
              style={{ left: station.x - size / 2, top: station.y - size / 2 }}
              data-station={name}
              aria-label={`Enter ${name}`}
              onClick={() => toLocation(location)}
              onMouseEnter={() => setActive(name)}
              onFocus={() => setActive(name)}
            />
            <span
              className={cx(
                classes.label,
                label.centered && classes.labelCentered,
                (interchange || factionFlag) && classes.labelImportant,
                isBestGym && classes.labelBestGym,
                isSlums && classes.labelSlums,
              )}
              style={label.style}
            >
              {name}
              {isBestGym && " ★"}
              {factionFlag && " ⚑"}
            </span>
          </React.Fragment>
        );
      })}
      {activeLocation && <StationCard location={activeLocation} toLocation={toLocation} />}
      <div className={classes.legend}>
        {TRANSIT_CATEGORIES.map((category) => (
          <span key={category} className={classes.legendItem}>
            <span className={classes.legendSwatch} style={{ backgroundColor: colors[category] }} />
            {LEGEND_LABELS[category]}
          </span>
        ))}
        <span className={classes.legendItem}>
          <span className={classes.legendInterchange} /> interchange
        </span>
      </div>
    </div>
  );
}
