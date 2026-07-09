import React, { useEffect, useState } from "react";
import Tooltip from "@mui/material/Tooltip";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import type { Page } from "../Router";
import { getTutorialFlashPage, isItemActive, isItemVisible, navigationSections } from "../../Sidebar/navigationItems";
import { useCycleRerender } from "../React/hooks";
import { RailItem } from "./RailItem";
import { RailToggleEvents, setRailExpanded } from "./railEvents";

/** Rail column widths, shared with ShellLayout's grid so the two can never drift. */
export const RAIL_WIDTH_COLLAPSED = 60;
export const RAIL_WIDTH_EXPANDED = 210;

const useStyles = makeStyles()((theme: Theme) => ({
  // Rail geometry per design notes 1A: 60px column, right hairline border.
  // Width animates 60px ↔ 210px on the chevron toggle (160ms, matching the HUD column).
  rail: {
    width: `${RAIL_WIDTH_COLLAPSED}px`,
    flex: "none",
    backgroundColor: theme.colors.bgRail,
    borderRight: `1px solid ${theme.colors.borderDefault as string}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12px 0",
    gap: "4px",
    boxSizing: "border-box",
    overflowY: "auto",
    overflowX: "hidden",
    transition: "width 160ms ease-out",
    scrollbarWidth: "none",
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  railExpanded: {
    width: `${RAIL_WIDTH_EXPANDED}px`,
    alignItems: "stretch",
    padding: "12px 8px",
  },
  // Logo mark: 32x32 rounded cyan square with a mono "b". Stays centered in both rail modes.
  logo: {
    width: "32px",
    height: "32px",
    flex: "none",
    alignSelf: "center",
    borderRadius: "8px",
    backgroundColor: theme.colors.accentCyan,
    // Mock's text-on-cyan #06131a has no token; bgApp is the nearest (dark app background over a cyan chip).
    color: theme.colors.bgApp,
    fontFamily: Settings.styles.monoFontFamily,
    fontWeight: 700,
    fontSize: getTypeScale().cardTitle, // mock: 14px
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "10px",
    userSelect: "none",
  },
  // Hairline divider between icon groups. Mock hex #1e2833 has no token; borderDefault is the nearest.
  separator: {
    width: "28px",
    height: "1px",
    flex: "none",
    alignSelf: "center",
    backgroundColor: theme.colors.borderDefault,
    margin: "8px 0",
  },
  separatorExpanded: {
    width: "auto",
    alignSelf: "stretch",
    margin: "8px 2px",
  },
  // Slim eyebrow group headers, shown only while expanded (collapsed mode keeps bare hairlines).
  groupHeader: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: getTypeScale().eyebrow,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: theme.colors.textTertiary,
    padding: "4px 10px 2px",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  // Pushes the Help group (ending in Settings) to the bottom of the rail, per the mock's bottom-pinned ⚙.
  spacer: {
    flex: 1,
    minHeight: "8px",
  },
  // Expand/collapse chevron at the very bottom — same geometry/hover feel as a RailItem.
  toggle: {
    width: "36px",
    height: "36px",
    flex: "none",
    alignSelf: "center",
    border: "none",
    borderRadius: "9px",
    padding: 0,
    marginTop: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    color: theme.colors.textTertiary,
    cursor: "pointer",
    transition: "color 120ms ease-out",
    "&:hover": {
      color: theme.colors.textSecondary,
    },
  },
  toggleExpanded: {
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "flex-start",
    padding: "0 10px",
    gap: "10px",
  },
  toggleLabel: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: getTypeScale().caption,
    fontWeight: 500,
    color: theme.colors.textTertiary,
    whiteSpace: "nowrap",
  },
}));

export function IconRail({ page, className }: { page: Page; className?: string }): React.ReactElement {
  useCycleRerender();
  const { classes, cx } = useStyles();
  const flash = getTutorialFlashPage();
  const [expanded, setExpanded] = useState(Settings.IsSidebarOpened);

  // Track the chevron toggle (persisted via Settings.IsSidebarOpened, same as the classic sidebar).
  useEffect(() => RailToggleEvents.subscribe(() => setExpanded(Settings.IsSidebarOpened)), []);

  return (
    <nav className={cx(classes.rail, expanded && classes.railExpanded, className)} aria-label="Main navigation">
      <div className={classes.logo}>b</div>
      {navigationSections.map((section, index) => {
        const isLast = index === navigationSections.length - 1;
        return (
          <React.Fragment key={section.label}>
            {/* Per the mock, the bottom-pinned Help group gets the flex spacer but no separator. */}
            {isLast ? (
              <div className={classes.spacer} />
            ) : (
              index > 0 && <div className={cx(classes.separator, expanded && classes.separatorExpanded)} />
            )}
            {expanded && <span className={classes.groupHeader}>{section.label}</span>}
            {section.items.filter(isItemVisible).map((item) => (
              <RailItem
                key={item.page}
                item={item}
                active={isItemActive(item, page)}
                flash={flash === item.page}
                expanded={expanded}
              />
            ))}
          </React.Fragment>
        );
      })}
      <Tooltip title={expanded ? "" : "Expand"} placement="right">
        <button
          type="button"
          className={cx(classes.toggle, expanded && classes.toggleExpanded)}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          onClick={() => setRailExpanded(!expanded)}
        >
          {expanded ? <ChevronLeftIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          {expanded && <span className={classes.toggleLabel}>Collapse</span>}
        </button>
      </Tooltip>
    </nav>
  );
}
