import React from "react";
import Tooltip from "@mui/material/Tooltip";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { getBadgeCount, type NavigationItem } from "../../Sidebar/navigationItems";
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
  badge: {
    position: "absolute",
    top: "2px",
    right: "2px",
    minWidth: "14px",
    height: "14px",
    borderRadius: "7px",
    padding: "0 3px",
    boxSizing: "border-box",
    backgroundColor: theme.colors.accentRed,
    color: theme.colors.white,
    fontSize: "9px",
    fontWeight: 700,
    lineHeight: "14px",
    textAlign: "center",
    pointerEvents: "none",
  },
}));

interface RailItemProps {
  item: NavigationItem;
  active: boolean;
  flash: boolean;
}

export function RailItem({ item, active, flash }: RailItemProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const label = String(item.page);
  const badgeCount = getBadgeCount(item);
  const Icon = item.icon;
  return (
    <Tooltip title={label} placement="right">
      <button
        type="button"
        className={cx(classes.item, active && classes.active, flash && classes.flash)}
        data-page={item.page}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={() => navigateToPage(item.page)}
      >
        <Icon fontSize="small" color="inherit" />
        {badgeCount > 0 && <span className={classes.badge}>{badgeCount}</span>}
      </button>
    </Tooltip>
  );
}
