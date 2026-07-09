/**
 * City Transit Map (3B) — the redesigned city view, laid out from the ORIGINAL
 * ASCII city art. Station positions come from cityAsciiPositions.ts, which
 * parses each City.asciiArt letter grid at load, so every city keeps the
 * spatial layout players know from the classic view. Stations connect into
 * one network per city via single-color subway lines (minimum spanning tree,
 * octilinear 45°/90° segments, 5px rounded stroke).
 *
 * One line color for everything: textTertiary (steel blue). Deliberately NOT
 * accentCyan (which means interactive/current elsewhere) and none of the old
 * Commerce/Training/Street category accents — the category system is gone
 * ("clunky is a feature": no derived analytics, no ★ best-gym, no ⚑ flags,
 * no legend).
 *
 * Interactions: clicking a station enters it (same toLocation logic as the
 * classic maps); hovering/focusing shows the StationCard with the location's
 * primary facts and an "Enter" CTA. Station glow only on hover/selection.
 *
 * Token mapping: canvas #080b0f → bgApp; grid → alpha(accentCyan, .03);
 * station fill → bgPanelDeep; line + station stroke → textTertiary;
 * labels → textBody.
 */
import React, { useState } from "react";
import { alpha, lighten, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { LocationName } from "@enums";
import type { City } from "../../Locations/City";
import type { Location } from "../../Locations/Location";
import { Locations } from "../../Locations/Locations";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { useCycleRerender } from "../React/hooks";

import { CITY_MAP_HEIGHT, CITY_MAP_WIDTH, cityMapGeometry, type CityStation } from "./cityAsciiPositions";
import { StationCard } from "./StationCard";

// Station node geometry: 8px-radius circle with a 3px line-color stroke.
// Rendered as a border-box button: width = 2r + stroke keeps the same outer
// diameter and fill area as an SVG circle.
const STATION_SIZE = 19;
const STATION_BORDER = 3;

const useStyles = makeStyles()((theme: Theme) => {
  const accentCyan = theme.colors.accentCyan as string;
  const lineColor = theme.colors.textTertiary as string;
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
      backgroundColor: theme.colors.bgApp,
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
      fontSize: typeScale.heading,
      fontWeight: 700,
      color: theme.colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: typeScale.body,
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
      border: `${STATION_BORDER}px solid ${lineColor}`,
      backgroundColor: theme.colors.bgPanelDeep,
      cursor: "pointer",
      zIndex: 2,
      transition: "box-shadow 120ms ease-out, border-color 120ms ease-out",
      // Glow only on hover/selection.
      "&:hover, &:focus-visible": {
        borderColor: lighten(lineColor, 0.35),
        boxShadow: `0 0 12px ${alpha(lineColor, 0.55)}`,
      },
    },
    label: {
      // Caption (not body) on purpose: station labels sit on art-derived
      // coordinates and going any larger makes dense rows collide.
      position: "absolute",
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textBody,
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: 2,
      transform: "translateX(-50%)",
    },
  };
});

/** Centered label below the node, or above it when the row is staggered. */
function labelStyle(station: CityStation): React.CSSProperties {
  return { left: station.x, top: station.labelAbove ? station.y - 30 : station.y + 16 };
}

export function CityMap3B({
  city,
  toLocation,
}: {
  city: City;
  toLocation: (location: Location) => void;
}): React.ReactElement {
  useCycleRerender();
  const { classes, theme } = useStyles();
  const [active, setActive] = useState<LocationName | null>(null);

  const geometry = cityMapGeometry[city.name];
  const lineColor = theme.colors.textTertiary as string;

  const stationEntries = Object.entries(geometry.stations) as [LocationName, CityStation][];
  const activeLocation = active && geometry.stations[active] ? Locations[active] : null;

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
        {geometry.edges.map((edge) => (
          <path
            key={`${edge.from}->${edge.to}`}
            d={edge.path}
            fill="none"
            stroke={lineColor}
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
      {stationEntries.map(([name, station]) => (
        <React.Fragment key={name}>
          <button
            type="button"
            className={classes.station}
            style={{ left: station.x - STATION_SIZE / 2, top: station.y - STATION_SIZE / 2 }}
            data-station={name}
            aria-label={`Enter ${name}`}
            onClick={() => toLocation(Locations[name])}
            onMouseEnter={() => setActive(name)}
            onFocus={() => setActive(name)}
          />
          <span className={classes.label} style={labelStyle(station)}>
            {name}
          </span>
        </React.Fragment>
      ))}
      {activeLocation && <StationCard location={activeLocation} toLocation={toLocation} />}
    </div>
  );
}
