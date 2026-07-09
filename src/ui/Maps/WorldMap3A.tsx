/**
 * World Map (3A) — the redesigned Travel Agency view. City nodes sit at the
 * ORIGINAL ASCII world map's positions and the continents are the original
 * art itself, vectorized glyph-by-glyph (see COASTLINE_STROKES in
 * worldMapData.ts). Deliberately information-light: a node is cyan only when
 * a pending faction invitation requires that city (cityIntel.ts); the popover
 * shows the ticket price, pending invitations, and reputation for factions
 * already joined — nothing derived, no comparisons, no legend.
 *
 * Token mapping for mock hexes without a 1:1 token (documented derivations):
 *   canvas radial gradient #0c1420 → bgPanelDeep, #070a0e → bgApp (nearest tokens)
 *   node fill #0d141c → bgPanelDeep; slate node/label #9fb1c1 → textSecondary
 *   current-node rim #bfeaf5 → lighten(accentCyan, 0.55)
 *   popover bg #101823 → bgPanel; popover border #2a4152 = borderFocus (exact)
 *   CTA text-on-cyan #06131a → bgApp
 *   graticule/arc rgba(76,201,232,α) → alpha(accentCyan, α)
 *   coastline strokes → borderDefault at per-glyph opacity (faint, but clearly the map)
 */
import React, { useState } from "react";
import { alpha, lighten, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { CityName } from "@enums";
import { Player } from "@player";
import { CONSTANTS } from "../../Constants";
import { Factions } from "../../Faction/Factions";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { formatMoney, formatReputation } from "../formatNumber";
import { useCycleRerender } from "../React/hooks";

import { getAllCityIntel } from "./cityIntel";
import { CityIndexColumn } from "./CityIndexColumn";
import {
  COASTLINE_STROKES,
  getFlightArc,
  GRATICULE_ELLIPSES,
  GRATICULE_LINES,
  MAP_HEIGHT,
  MAP_WIDTH,
  worldMapCities,
} from "./worldMapData";

const NODE_SIZE = 22;
const CURRENT_NODE_SIZE = 30;
const POPOVER_WIDTH = 270;

const useStyles = makeStyles()((theme: Theme) => {
  // All UI-refresh tokens are required ITheme keys, so they are always defined.
  const accentCyan = theme.colors.accentCyan as string;
  const textTertiary = theme.colors.textTertiary as string;
  const bgApp = theme.colors.bgApp as string;
  const typeScale = getTypeScale();
  return {
    root: {
      display: "flex",
      alignItems: "stretch",
      width: "100%",
      marginTop: "8px",
      border: `1px solid ${theme.colors.borderDefault as string}`,
      borderRadius: "12px",
      overflow: "hidden",
      // Fixed-geometry canvas: let the shell content pane scroll instead of squeezing the map.
      minWidth: "min-content",
    },
    canvas: {
      position: "relative",
      flex: `1 1 ${MAP_WIDTH}px`,
      minWidth: `${MAP_WIDTH}px`,
      height: `${MAP_HEIGHT}px`,
      overflow: "hidden",
      background: `radial-gradient(ellipse at 50% 45%, ${theme.colors.bgPanelDeep as string} 0%, ${bgApp} 75%)`,
    },
    svg: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
    },
    header: {
      position: "absolute",
      top: "18px",
      left: "22px",
      zIndex: 3,
      pointerEvents: "none",
    },
    headerTitle: {
      fontSize: typeScale.heading, // mock: 18px
      fontWeight: 700,
      color: theme.colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: typeScale.body, // mock: 11.5px
      fontWeight: 400,
      color: theme.colors.textSecondary,
      marginTop: "2px",
    },
    headerMoney: {
      fontFamily: Settings.styles.monoFontFamily,
      color: theme.colors.accentGold,
    },
    node: {
      position: "absolute",
      width: `${NODE_SIZE}px`,
      height: `${NODE_SIZE}px`,
      padding: 0,
      borderRadius: "50%",
      backgroundColor: theme.colors.bgPanelDeep,
      cursor: "pointer",
      zIndex: 2,
      transition: "border-color 120ms ease-out, box-shadow 120ms ease-out",
    },
    nodeSlate: {
      border: `2px solid ${textTertiary}`,
      boxShadow: `0 0 14px ${alpha(textTertiary, 0.3)}`,
      "&:hover": {
        borderColor: theme.colors.textSecondary,
        boxShadow: `0 0 18px ${alpha(textTertiary, 0.45)}`,
      },
    },
    nodeSignal: {
      border: `2px solid ${accentCyan}`,
      boxShadow: `0 0 14px ${alpha(accentCyan, 0.35)}`,
      "&:hover": {
        borderColor: lighten(accentCyan, 0.3),
        boxShadow: `0 0 18px ${alpha(accentCyan, 0.5)}`,
      },
    },
    nodeSelected: {
      boxShadow: `0 0 18px ${alpha(accentCyan, 0.5)}`,
      borderColor: accentCyan,
    },
    nodeCurrent: {
      position: "absolute",
      width: `${CURRENT_NODE_SIZE}px`,
      height: `${CURRENT_NODE_SIZE}px`,
      borderRadius: "50%",
      backgroundColor: accentCyan,
      border: `3px solid ${lighten(accentCyan, 0.55)}`,
      boxShadow: `0 0 26px ${alpha(accentCyan, 0.7)}`,
      zIndex: 2,
    },
    label: {
      position: "absolute",
      // Centered under the node: positions come from the ASCII art, labels self-center.
      transform: "translateX(-50%)",
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: typeScale.caption, // mock: 10.5px
      fontWeight: 500,
      color: theme.colors.textSecondary,
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: 2,
    },
    labelActive: {
      fontWeight: 600,
      color: accentCyan,
    },
    popover: {
      position: "absolute",
      width: `${POPOVER_WIDTH}px`,
      backgroundColor: theme.colors.bgPanel,
      border: `1px solid ${theme.colors.borderFocus as string}`,
      borderRadius: "12px",
      padding: "15px 16px",
      boxShadow: "0 18px 44px rgba(0, 0, 0, 0.6)",
      boxSizing: "border-box",
      zIndex: 4,
    },
    popoverHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: "12px",
    },
    popoverName: {
      fontSize: typeScale.cardTitle, // mock: 14px
      fontWeight: 600,
      color: theme.colors.textPrimary,
    },
    popoverPrice: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: typeScale.caption, // mock: 10px
      fontWeight: 500,
      color: theme.colors.accentGold,
    },
    infoList: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      fontSize: typeScale.body, // mock: 11px
      marginBottom: "13px",
    },
    infoRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: "8px",
    },
    infoLeft: {
      color: theme.colors.textSecondary,
    },
    infoGood: {
      color: theme.colors.accentGreen,
      whiteSpace: "nowrap",
    },
    infoMono: {
      fontFamily: Settings.styles.monoFontFamily,
      fontWeight: 500, // weight floor: small mono values never render at 400
    },
    cta: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "32px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: accentCyan,
      color: bgApp,
      font: "inherit",
      fontSize: typeScale.body, // mock: 12px
      fontWeight: 600,
      cursor: "pointer",
      transition: "background-color 120ms ease-out",
      "&:hover": {
        backgroundColor: lighten(accentCyan, 0.15),
      },
      "&:disabled": {
        backgroundColor: theme.colors.bgActive,
        color: textTertiary,
        cursor: "default",
      },
    },
  };
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function WorldMap3A({ onTravel }: { onTravel: (city: CityName) => void }): React.ReactElement {
  useCycleRerender();
  const { classes, cx, theme } = useStyles();
  const [selected, setSelected] = useState<CityName | null>(null);
  const [hovered, setHovered] = useState<CityName | null>(null);

  const currentCity = Player.city;
  const intel = getAllCityIntel({
    currentCity,
    money: Player.money,
    factions: Player.factions,
    factionInvitations: Player.factionInvitations,
  });
  const accentCyan = theme.colors.accentCyan as string;
  const borderDefault = theme.colors.borderDefault as string;
  const cities = Object.values(CityName);
  const selectedIntel = selected && selected !== currentCity ? intel[selected] : null;

  // Popover sits above the selected node, clamped to the canvas.
  const popoverPosition = selectedIntel
    ? {
        left: clamp(
          worldMapCities[selectedIntel.city].center.x - POPOVER_WIDTH / 2,
          12,
          MAP_WIDTH - POPOVER_WIDTH - 12,
        ),
        top: clamp(worldMapCities[selectedIntel.city].center.y - 150, 12, MAP_HEIGHT - 170),
      }
    : null;

  return (
    <div className={classes.root}>
      <div
        className={classes.canvas}
        onClick={(event) => {
          // Clicks on the empty canvas (not a node/popover) clear the selection.
          if (event.target === event.currentTarget) setSelected(null);
        }}
      >
        <svg
          className={classes.svg}
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          aria-hidden="true"
        >
          {COASTLINE_STROKES.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={borderDefault}
              strokeOpacity={s.opacity}
              strokeWidth={1.25}
              strokeLinecap="round"
            />
          ))}
          {GRATICULE_ELLIPSES.map((e, i) => (
            <ellipse
              key={i}
              cx={e.cx}
              cy={e.cy}
              rx={e.rx}
              ry={e.ry}
              fill="none"
              stroke={alpha(accentCyan, e.opacity)}
              strokeWidth={1}
            />
          ))}
          {GRATICULE_LINES.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={alpha(accentCyan, l.opacity)}
              strokeWidth={1}
            />
          ))}
          {cities
            .filter((city) => city !== currentCity)
            .map((city) => {
              const arc = getFlightArc(currentCity, city);
              const highlighted = city === selected || city === hovered;
              return (
                <React.Fragment key={city}>
                  <path
                    d={arc.path}
                    fill="none"
                    stroke={alpha(accentCyan, highlighted ? 0.65 : 0.35)}
                    strokeWidth={highlighted ? 2 : 1.5}
                    strokeDasharray="4 5"
                  />
                  {highlighted && <circle cx={arc.waypoint.x} cy={arc.waypoint.y} r={3} fill={accentCyan} />}
                </React.Fragment>
              );
            })}
        </svg>
        <div className={classes.header}>
          <div className={classes.headerTitle}>World</div>
          <div className={classes.headerSubtitle}>
            Ticket <span className={classes.headerMoney}>{formatMoney(CONSTANTS.TravelCost)}</span> to anywhere · you
            have <span className={classes.headerMoney}>{formatMoney(Player.money)}</span>
          </div>
        </div>
        {cities.map((city) => {
          const datum = worldMapCities[city];
          const isCurrent = city === currentCity;
          const size = isCurrent ? CURRENT_NODE_SIZE : NODE_SIZE;
          const position = {
            left: datum.center.x - size / 2,
            top: datum.center.y - size / 2,
          };
          const cityIntel = intel[city];
          const active = isCurrent || city === selected || cityIntel.hasSomething;
          return (
            <React.Fragment key={city}>
              {isCurrent ? (
                <div className={classes.nodeCurrent} style={position} data-city={city} data-current="true" />
              ) : (
                <button
                  type="button"
                  className={cx(
                    classes.node,
                    cityIntel.hasSomething ? classes.nodeSignal : classes.nodeSlate,
                    city === selected && classes.nodeSelected,
                  )}
                  style={position}
                  data-city={city}
                  aria-label={`${city}${cityIntel.hasSomething ? " — faction invitation waiting" : ""}`}
                  onClick={() => setSelected((prev) => (prev === city ? null : city))}
                  onMouseEnter={() => setHovered(city)}
                  onMouseLeave={() => setHovered((prev) => (prev === city ? null : prev))}
                />
              )}
              <span
                className={cx(classes.label, active && classes.labelActive)}
                style={{ left: datum.center.x, top: datum.center.y + size / 2 + 6 }}
              >
                {city.toUpperCase()}
                {isCurrent && " ◄ you"}
              </span>
            </React.Fragment>
          );
        })}
        {selectedIntel && popoverPosition && (
          <div className={classes.popover} style={popoverPosition}>
            <div className={classes.popoverHeader}>
              <span className={classes.popoverName}>{selectedIntel.city}</span>
              <span className={classes.popoverPrice}>{formatMoney(CONSTANTS.TravelCost)}</span>
            </div>
            {selectedIntel.factions.length > 0 && (
              <div className={classes.infoList}>
                {selectedIntel.factions.map((faction) => (
                  <div className={classes.infoRow} key={faction.name}>
                    <span className={classes.infoLeft}>⚑ {faction.name}</span>
                    {faction.standing === "member" ? (
                      <span className={cx(classes.infoGood, classes.infoMono)}>
                        rep {formatReputation(Factions[faction.name].playerReputation)}
                      </span>
                    ) : (
                      <span className={classes.infoGood}>invitation waiting</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className={classes.cta}
              disabled={!selectedIntel.canAffordTicket}
              onClick={() => onTravel(selectedIntel.city)}
            >
              Fly to {selectedIntel.city}
            </button>
          </div>
        )}
      </div>
      <CityIndexColumn
        intel={cities.map((city) => intel[city])}
        selectedCity={selected}
        onSelect={(city) => setSelected(city === currentCity ? null : city)}
      />
    </div>
  );
}
