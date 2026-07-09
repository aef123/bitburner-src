import React from "react";
import Tooltip from "@mui/material/Tooltip";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Settings } from "../../Settings/Settings";
import { getBadgeCount, type NavigationItem } from "../../Sidebar/navigationItems";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { navigateToPage } from "./useNavigationHotkeys";

const useStyles = makeStyles()((theme: Theme) => ({
  // Rail icon item geometry per design notes 1A: 36x36, radius 9, centered icon.
  item: {
    position: "relative",
    width: "36px",
    height: "36px",
    flex: "none",
    border: "none",
    borderRadius: "9px",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    // Mock's rail icon default #5c7186 has no token; textTertiary is the nearest token.
    color: theme.colors.textTertiary,
    cursor: "pointer",
    transition: "color 120ms ease-out, background-color 120ms ease-out",
    "&:hover": {
      color: theme.colors.textSecondary,
    },
  },
  // Expanded rail: same 36px height, but the item becomes a full-width icon + label row.
  itemExpanded: {
    width: "100%",
    justifyContent: "flex-start",
    padding: "0 10px",
    gap: "10px",
  },
  active: {
    backgroundColor: theme.colors.bgActive,
    color: theme.colors.accentCyan,
    // 2px inset left indicator per design notes.
    boxShadow: `inset 2px 0 0 ${theme.colors.accentCyan as string}`,
    "&:hover": {
      color: theme.colors.accentCyan,
    },
  },
  // Interactive tutorial wants the player to click this item (mirrors the sidebar's red "flash" state).
  flash: {
    color: theme.colors.accentRed,
    "&:hover": {
      color: theme.colors.accentRed,
    },
  },
  // Page name shown while the rail is expanded (Plex via Settings.styles.fontFamily, body role).
  label: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: getTypeScale().body,
    fontWeight: 500,
    color: theme.colors.textBody,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "left",
    minWidth: 0,
  },
  labelActive: {
    color: theme.colors.accentCyan,
  },
  labelFlash: {
    color: theme.colors.accentRed,
  },
  badge: {
    position: "absolute",
    top: "1px",
    right: "1px",
    // Pill grown 14px → 16px alongside the readability pass so the floored badge text still fits.
    minWidth: "16px",
    height: "16px",
    borderRadius: "8px",
    padding: "0 3px",
    boxSizing: "border-box",
    backgroundColor: theme.colors.accentRed,
    color: theme.colors.white,
    fontSize: getTypeScale().eyebrow, // mock: 9px
    fontWeight: 700,
    lineHeight: "16px",
    textAlign: "center",
    pointerEvents: "none",
  },
  // Expanded rows carry the badge inline at the right edge instead of over the icon corner.
  badgeExpanded: {
    position: "static",
    marginLeft: "auto",
    flex: "none",
  },
}));

interface RailItemProps {
  item: NavigationItem;
  active: boolean;
  flash: boolean;
  /** Whether the rail is expanded (icon + page name rows, tooltips disabled). */
  expanded: boolean;
}

export function RailItem({ item, active, flash, expanded }: RailItemProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const label = String(item.page);
  const badgeCount = getBadgeCount(item);
  const Icon = item.icon;
  return (
    // An empty title disables the tooltip — expanded rows show the name inline instead.
    <Tooltip title={expanded ? "" : label} placement="right">
      <button
        type="button"
        className={cx(classes.item, expanded && classes.itemExpanded, active && classes.active, flash && classes.flash)}
        data-page={item.page}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={() => navigateToPage(item.page)}
      >
        <Icon fontSize="small" color="inherit" />
        {expanded && (
          <span className={cx(classes.label, active && classes.labelActive, flash && classes.labelFlash)}>{label}</span>
        )}
        {badgeCount > 0 && <span className={cx(classes.badge, expanded && classes.badgeExpanded)}>{badgeCount}</span>}
      </button>
    </Tooltip>
  );
}
