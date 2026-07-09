import React from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Settings } from "../../Settings/Settings";
import type { Page } from "../Router";
import {
  getTutorialFlashPage,
  isItemActive,
  isItemVisible,
  navigationSections,
} from "../../Sidebar/navigationItems";
import { useCycleRerender } from "../React/hooks";
import { RailItem } from "./RailItem";

const useStyles = makeStyles()((theme: Theme) => ({
  // Rail geometry per design notes 1A: 60px column, right hairline border.
  rail: {
    width: "60px",
    flex: "none",
    backgroundColor: theme.colors.bgRail,
    borderRight: `1px solid ${theme.colors.borderDefault ?? ""}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12px 0",
    gap: "4px",
    boxSizing: "border-box",
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarWidth: "none",
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  // Logo mark: 32x32 rounded cyan square with a mono "b".
  logo: {
    width: "32px",
    height: "32px",
    flex: "none",
    borderRadius: "8px",
    backgroundColor: theme.colors.accentCyan,
    // Mock's text-on-cyan #06131a has no token; bgApp is the nearest (dark app background over a cyan chip).
    color: theme.colors.bgApp,
    fontFamily: Settings.styles.monoFontFamily,
    fontWeight: 700,
    fontSize: "14px",
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
    backgroundColor: theme.colors.borderDefault,
    margin: "8px 0",
  },
  // Pushes the Help group (ending in Settings) to the bottom of the rail, per the mock's bottom-pinned ⚙.
  spacer: {
    flex: 1,
    minHeight: "8px",
  },
}));

export function IconRail({ page, className }: { page: Page; className?: string }): React.ReactElement {
  useCycleRerender();
  const { classes, cx } = useStyles();
  const flash = getTutorialFlashPage();

  return (
    <nav className={cx(classes.rail, className)} aria-label="Main navigation">
      <div className={classes.logo}>b</div>
      {navigationSections.map((section, index) => {
        const isLast = index === navigationSections.length - 1;
        return (
          <React.Fragment key={section.label}>
            {isLast && <div className={classes.spacer} />}
            {index > 0 && <div className={classes.separator} />}
            {section.items
              .filter(isItemVisible)
              .map((item) => (
                <RailItem key={item.page} item={item} active={isItemActive(item, page)} flash={flash === item.page} />
              ))}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
