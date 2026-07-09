/**
 * City Transit Map (3B) — the redesigned city view, laid out from the ORIGINAL
 * ASCII city art. Station positions come from cityAsciiPositions.ts, which
 * parses each City.asciiArt letter grid at load, so every city keeps the
 * spatial layout players know from the classic view. Stations connect into
 * one network per city via single-color subway lines (minimum spanning tree,
 * octilinear 45°/90° segments, 5px rounded stroke).
 *
 * Line colors are PURELY aesthetic, like a real transit map: the MST is
 * decomposed into 1-4 routes (cityRoutes.ts — Line 1 = longest path, each
 * remaining branch = the next line) and colors rotate through a fixed palette
 * (accentGold, accentGreen, accentViolet, accentPink — Line 1 is always
 * gold). NO meaning, NO legend, NO category logic ("clunky is a feature":
 * no derived analytics, no ★ best-gym, no ⚑ flags). Deliberately not
 * accentCyan, which means interactive/current elsewhere.
 *
 * Stations take their line's color; a station where 2+ lines meet renders as
 * a classic interchange: a slightly larger circle with a textPrimary (white)
 * ring. Routes partition the MST edge set, so two lines never traverse the
 * same segment — they only meet at interchanges.
 *
 * Interactions: clicking a station enters it (same toLocation logic as the
 * classic maps); hovering/focusing shows the StationCard with the location's
 * primary facts and an "Enter" CTA. Station glow only on hover/selection.
 *
 * Token mapping: canvas #080b0f → bgApp; grid → alpha(accentCyan, .03);
 * station fill → bgPanelDeep; line + station strokes → accent palette;
 * interchange ring → textPrimary; labels → textBody.
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
import { cityRoutes } from "./cityRoutes";
import { StationCard } from "./StationCard";

// Station node geometry: 8px-radius circle with a 3px line-color stroke.
// Rendered as a border-box button: width = 2r + stroke keeps the same outer
// diameter and fill area as an SVG circle. Interchanges (2+ lines) are a
// touch larger, per classic transit-map convention.
const STATION_SIZE = 19;
const INTERCHANGE_SIZE = 25;
const STATION_BORDER = 3;

/** Fixed aesthetic rotation; route index i → palette[i % 4]. Line 1 = gold. */
const ROUTE_COLOR_KEYS = ["accentGold", "accentGreen", "accentViolet", "accentPink"] as const;

const useStyles = makeStyles()((theme: Theme) => {
  const accentCyan = theme.colors.accentCyan as string;
  const typeScale = getTypeScale();
  /** Station ring in one line color, glow in the same color on hover/focus. */
  const lineStation = (color: string) =>
    ({
      borderColor: color,
      "&:hover, &:focus-visible": {
        borderColor: lighten(color, 0.35),
        boxShadow: `0 0 12px ${alpha(color, 0.55)}`,
      },
    }) as const;
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
      borderStyle: "solid",
      borderWidth: `${STATION_BORDER}px`,
      backgroundColor: theme.colors.bgPanelDeep,
      cursor: "pointer",
      zIndex: 2,
      // Glow only on hover/selection (per-line colors below).
      transition: "box-shadow 120ms ease-out, border-color 120ms ease-out",
    },
    lineGold: lineStation(theme.colors.accentGold as string),
    lineGreen: lineStation(theme.colors.accentGreen as string),
    lineViolet: lineStation(theme.colors.accentViolet as string),
    linePink: lineStation(theme.colors.accentPink as string),
    // Classic interchange: slightly larger circle, white (textPrimary) ring.
    interchange: {
      width: `${INTERCHANGE_SIZE}px`,
      height: `${INTERCHANGE_SIZE}px`,
      ...lineStation(theme.colors.textPrimary as string),
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
  const { classes, cx, theme } = useStyles();
  const [active, setActive] = useState<LocationName | null>(null);

  const geometry = cityMapGeometry[city.name];
  const routes = cityRoutes[city.name];
  const routeColor = (index: number): string =>
    theme.colors[ROUTE_COLOR_KEYS[index % ROUTE_COLOR_KEYS.length]] as string;
  const lineClasses = [classes.lineGold, classes.lineGreen, classes.lineViolet, classes.linePink];

  // Which line(s) serve each station: first line's color for regular stops,
  // interchange styling where 2+ lines meet.
  const stationLines = new Map<LocationName, { line: number; count: number }>();
  routes.forEach((route, index) => {
    for (const name of route.stations) {
      const entry = stationLines.get(name);
      if (entry) entry.count += 1;
      else stationLines.set(name, { line: index, count: 1 });
    }
  });

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
        {routes.map((route, index) =>
          route.edges.map((edge) => (
            <path
              key={`${edge.from}->${edge.to}`}
              d={edge.path}
              fill="none"
              stroke={routeColor(index)}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          )),
        )}
      </svg>
      <div className={classes.header}>
        <div className={classes.headerTitle}>{city.name}</div>
        <div className={classes.headerSubtitle}>
          {stationEntries.length} locations · travel inside a city is free &amp; instant
        </div>
      </div>
      {stationEntries.map(([name, station]) => {
        const serving = stationLines.get(name);
        const isInterchange = (serving?.count ?? 0) >= 2;
        const size = isInterchange ? INTERCHANGE_SIZE : STATION_SIZE;
        return (
          <React.Fragment key={name}>
            <button
              type="button"
              className={cx(
                classes.station,
                isInterchange ? classes.interchange : lineClasses[(serving?.line ?? 0) % lineClasses.length],
              )}
              style={{ left: station.x - size / 2, top: station.y - size / 2 }}
              data-station={name}
              data-interchange={isInterchange || undefined}
              aria-label={`Enter ${name}`}
              onClick={() => toLocation(Locations[name])}
              onMouseEnter={() => setActive(name)}
              onFocus={() => setActive(name)}
            />
            <span className={classes.label} style={labelStyle(station)}>
              {name}
            </span>
          </React.Fragment>
        );
      })}
      {activeLocation && <StationCard location={activeLocation} toLocation={toLocation} />}
    </div>
  );
}
