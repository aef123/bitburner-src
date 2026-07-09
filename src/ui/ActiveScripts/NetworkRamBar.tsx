/**
 * Stacked network-RAM bar for the Active Scripts header card (1F mock).
 *
 * Geometry per design-notes-1F: 14px tall, 2px gaps between segments, 7px radius ends,
 * segment order home → purchased → rooted → hacknet → free. Segment math (including the
 * zero-width guard: zero-RAM categories render nothing, so no phantom 2px gap) lives in
 * the pure buildRamBarSegments; this component only paints.
 *
 * Colors: home = accentCyan token; the darker steps + free fill come from the single
 * RAM_SEGMENT_HEXES data module (token mapping documented there).
 */
import React from "react";
import { type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import {
  buildRamBarSegments,
  RAM_SEGMENT_HEXES,
  type NetworkRamTotals,
  type RamSegmentKey,
} from "./networkRam";

const useStyles = makeStyles()((theme: Theme) => ({
  bar: {
    display: "flex",
    height: "14px",
    borderRadius: "7px",
    overflow: "hidden",
    gap: "2px",
    // Empty-network fallback: with no segments the bare track still reads as a bar.
    backgroundColor: RAM_SEGMENT_HEXES.free,
  },
  legend: {
    display: "flex",
    gap: "16px",
    fontFamily: Settings.styles.fontFamily,
    fontSize: getTypeScale().caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    marginTop: "7px",
  },
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
  },
  legendChip: {
    width: "8px",
    height: "8px",
    borderRadius: "2px",
    flex: "none",
  },
}));

const LEGEND: { key: RamSegmentKey; label: string }[] = [
  { key: "home", label: "home" },
  { key: "purchased", label: "purchased" },
  { key: "rooted", label: "rooted network" },
  { key: "hacknet", label: "hacknet" },
  { key: "free", label: "free" },
];

function segmentColor(key: RamSegmentKey, theme: Theme): string {
  return key === "home" ? (theme.colors.accentCyan as string) : RAM_SEGMENT_HEXES[key];
}

interface NetworkRamBarProps {
  totals: NetworkRamTotals;
}

export function NetworkRamBar({ totals }: NetworkRamBarProps): React.ReactElement {
  const { classes, theme } = useStyles();
  const segments = buildRamBarSegments(totals);
  return (
    <div data-ram-bar-root>
      <div className={classes.bar} data-ram-bar>
        {segments.map((segment) => (
          <div
            key={segment.key}
            data-ram-segment={segment.key}
            style={{
              // Proportional flex-grow with zero basis: the 2px gaps are absorbed
              // evenly instead of overflowing fixed percentage widths.
              flex: `${segment.fraction} 1 0%`,
              backgroundColor: segmentColor(segment.key, theme),
            }}
          />
        ))}
      </div>
      <div className={classes.legend} data-ram-legend>
        {LEGEND.map(({ key, label }) => (
          <span key={key} className={classes.legendItem}>
            <span
              className={classes.legendChip}
              style={{ backgroundColor: key === "free" ? (theme.colors.track as string) : segmentColor(key, theme) }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
