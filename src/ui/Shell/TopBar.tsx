import React from "react";
import { alpha, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import Tooltip from "@mui/material/Tooltip";
import VerticalSplitIcon from "@mui/icons-material/VerticalSplit";

import { Player } from "@player";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import type { Page } from "../Router";
import { getNavigationSectionForPage } from "../../Sidebar/navigationItems";
import { formatHp, formatMoney, formatMoneyNoSuffix, formatNumberNoSuffix } from "../formatNumber";
import { useCycleRerender } from "../React/hooks";
import type { PaletteState } from "./CommandPalette";
import { setHudCollapsed } from "./hudEvents";

const useStyles = makeStyles()((theme: Theme) => {
  // All UI-refresh tokens are required ITheme keys, so they are always defined.
  const accentGreen = theme.colors.accentGreen as string;
  const typeScale = getTypeScale();
  return {
  // Top bar geometry per design notes 1A: 52px, bottom hairline border.
  // Mock bar background #0b0f15 has no token; bgPanelDeep is the nearest.
  topBar: {
    height: "52px",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "0 20px",
    boxSizing: "border-box",
    backgroundColor: theme.colors.bgPanelDeep,
    borderBottom: `1px solid ${theme.colors.borderDefault as string}`,
    minWidth: 0,
  },
  breadcrumb: {
    fontSize: typeScale.body, // mock: 12.5px
    fontWeight: 500,
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  breadcrumbSeparator: {
    color: theme.colors.textFaint,
    margin: "0 4px",
  },
  breadcrumbPage: {
    color: theme.colors.textBody,
    fontWeight: 600,
  },
  spacer: {
    flex: 1,
    minWidth: 0,
  },
  // Command palette entry point. Click is wired to the palette in a later task; for now it's a styled affordance.
  search: {
    width: "340px",
    height: "32px",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "0 10px",
    boxSizing: "border-box",
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "8px",
    backgroundColor: theme.colors.bgPanel,
    cursor: "pointer",
    font: "inherit",
    textAlign: "left",
    transition: "border-color 120ms ease-out",
    "&:hover": {
      borderColor: theme.colors.borderFocus,
    },
  },
  searchIcon: {
    color: theme.colors.textTertiary,
    fontSize: typeScale.caption, // mock: 12px
    lineHeight: 1,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: typeScale.caption, // mock: 12px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    userSelect: "none",
  },
  kbd: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "4px",
    padding: "2px 5px",
    lineHeight: 1,
  },
  money: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.value, // mock: 13px
    fontWeight: 600,
    color: theme.colors.accentGold,
    whiteSpace: "nowrap",
  },
  // Green-tinted pill. The mock's pill bg/border hexes (#10231b / #1c3a2c) have no tokens; both are derived from
  // accentGreen over the dark bar via alpha().
  hpPill: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.value, // mock: 11px
    fontWeight: 500,
    color: theme.colors.accentGreen,
    backgroundColor: alpha(accentGreen, 0.08),
    border: `1px solid ${alpha(accentGreen, 0.25)}`,
    borderRadius: "20px",
    padding: "4px 10px",
    whiteSpace: "nowrap",
  },
  hpMax: {
    color: alpha(accentGreen, 0.45),
  },
  // Reopen affordance for the docked HUD; only rendered while the HUD is collapsed.
  hudReopen: {
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    padding: 0,
    background: "none",
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "6px",
    color: theme.colors.textSecondary,
    cursor: "pointer",
    transition: "border-color 120ms ease-out, color 120ms ease-out",
    "&:hover": {
      borderColor: theme.colors.borderFocus,
      color: theme.colors.textBody,
    },
  },
  };
});

/** True when running on macOS, so the search hint shows the native ⌘K chord instead of Ctrl K. */
function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform ?? "");
}

export function TopBar({
  page,
  className,
  paletteState,
  hudCollapsed,
}: {
  page: Page;
  className?: string;
  paletteState?: PaletteState;
  /** When true, show the reopen affordance for the docked HUD. */
  hudCollapsed?: boolean;
}): React.ReactElement {
  useCycleRerender();
  const { classes, cx } = useStyles();
  const section = getNavigationSectionForPage(page);

  return (
    <header className={cx(classes.topBar, className)}>
      <div className={classes.breadcrumb}>
        {section && (
          <>
            {section.label}
            <span className={classes.breadcrumbSeparator}>/</span>
          </>
        )}
        <span className={classes.breadcrumbPage}>{page}</span>
      </div>
      <div className={classes.spacer} />
      <button
        type="button"
        className={classes.search}
        aria-label="Jump to anything"
        onClick={() => paletteState?.open()}
      >
        <span className={classes.searchIcon} aria-hidden="true">
          ⌕
        </span>
        <span className={classes.searchPlaceholder}>Jump to anything…</span>
        <kbd className={classes.kbd}>{isMacPlatform() ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {/* Formatted numbers show their exact value on hover, per the global interaction rules. */}
      <Tooltip title={formatMoneyNoSuffix(Player.money)}>
        <span className={classes.money}>{formatMoney(Player.money)}</span>
      </Tooltip>
      <Tooltip title={`${formatNumberNoSuffix(Player.hp.current)} / ${formatNumberNoSuffix(Player.hp.max)} HP`}>
        <span className={classes.hpPill}>
          HP {formatHp(Player.hp.current)}
          <span className={classes.hpMax}>/{formatHp(Player.hp.max)}</span>
        </span>
      </Tooltip>
      {hudCollapsed && (
        <Tooltip title="Show overview panel">
          <button
            type="button"
            className={classes.hudReopen}
            aria-label="Show overview panel"
            onClick={() => setHudCollapsed(false)}
          >
            <VerticalSplitIcon fontSize="small" color="inherit" />
          </button>
        </Tooltip>
      )}
    </header>
  );
}
