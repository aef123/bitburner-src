import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Settings } from "../../Settings/Settings";
import { Page } from "../Router";
import { IconRail, RAIL_WIDTH_COLLAPSED, RAIL_WIDTH_EXPANDED } from "./IconRail";
import { TopBar } from "./TopBar";
import { Hud } from "./Hud";
import { HudToggleEvents } from "./hudEvents";
import { RailToggleEvents } from "./railEvents";
import { useNavigationHotkeys, useHotkeySuppression } from "./useNavigationHotkeys";
import { PalettePortal, usePaletteState } from "./CommandPalette";

const useStyles = makeStyles()((theme: Theme) => ({
  /**
   * Shell grid per design notes 1A: 60px icon rail spanning the full height, 52px top bar spanning
   * the content and HUD columns, content + 272px docked HUD below. Both edge columns animate
   * (160ms per the global interaction rules): the rail expands 60px ↔ 210px on its chevron
   * (Settings.IsSidebarOpened), and when the HUD is collapsed the third column animates to 0 and
   * the HUD is simply hidden — the TopBar reopen button restores it (no floating fallback).
   * gridTemplateColumns is set inline (see render) because the two toggles compose into four
   * combinations; everything else stays here.
   */
  shell: {
    display: "grid",
    gridTemplateRows: "52px 1fr",
    gridTemplateAreas: `"rail topbar topbar" "rail content hud"`,
    transition: "grid-template-columns 160ms ease-out",
    width: "100%",
    height: "100vh",
    overflow: "hidden",
    backgroundColor: theme.colors.bgApp,
  },
  rail: {
    gridArea: "rail",
    minHeight: 0,
  },
  topBar: {
    gridArea: "topbar",
    minWidth: 0,
  },
  // Content area scrolls on its own; keeps the historical 8px page padding from GameRoot's content wrapper.
  content: {
    gridArea: "content",
    overflow: "auto",
    padding: "8px",
    boxSizing: "border-box",
    minWidth: 0,
    minHeight: 0,
    msOverflowStyle: "none" /* for Internet Explorer, Edge */,
    scrollbarWidth: "none" /* for Firefox */,
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
  // The HUD cell clips its fixed-width panel while the column width animates closed/open.
  hudCell: {
    gridArea: "hud",
    overflow: "hidden",
    minHeight: 0,
    backgroundColor: theme.colors.bgSidebar,
  },
}));

interface ShellLayoutProps {
  page: Page;
  /** Save-game handler for the HUD's Save button (provided by GameRoot). */
  save: () => void;
  /** Kill-all-scripts handler for the HUD's KillScriptsModal (provided by GameRoot). */
  killScripts: () => void;
  children: React.ReactNode;
}

export function ShellLayout({ page, save, killScripts, children }: ShellLayoutProps): React.ReactElement {
  useNavigationHotkeys();
  const { classes } = useStyles();
  const contentRef = useRef<HTMLElement>(null);
  const paletteState = usePaletteState();
  const { isSuppressed } = useHotkeySuppression();
  const [hudCollapsed, setHudCollapsedState] = useState(Settings.HudCollapsed);
  const [railExpanded, setRailExpandedState] = useState(Settings.IsSidebarOpened);

  // Track HUD collapse/restore (chevron in the HUD header, reopen button in the TopBar).
  useEffect(() => HudToggleEvents.subscribe(() => setHudCollapsedState(Settings.HudCollapsed)), []);

  // Track the rail's expand/collapse chevron (persisted via Settings.IsSidebarOpened).
  useEffect(() => RailToggleEvents.subscribe(() => setRailExpandedState(Settings.IsSidebarOpened)), []);

  // Global Ctrl/⌘+K shortcut — same suppression rules as Alt+X hotkeys.
  // Yields to any in-app consumer (e.g. terminal Ctrl+K / clear-after-cursor) that called
  // preventDefault() before this document-level listener fires.
  const handlePaletteShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isSuppressed(event)) return;

      const isK = event.key === "k" || event.key === "K";
      const hasCtrlOrMeta = event.ctrlKey || event.metaKey;
      if (!isK || !hasCtrlOrMeta) return;

      event.preventDefault();
      paletteState.open();
    },
    [isSuppressed, paletteState],
  );

  useEffect(() => {
    document.addEventListener("keydown", handlePaletteShortcut);
    return () => document.removeEventListener("keydown", handlePaletteShortcut);
  }, [handlePaletteShortcut]);

  // The content area owns scrolling now (the window no longer scrolls); mirror GameRoot's scroll-to-top on page
  // change, with the same Terminal exception.
  useEffect(() => {
    if (page !== Page.Terminal && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [page]);

  const railColumn = `${railExpanded ? RAIL_WIDTH_EXPANDED : RAIL_WIDTH_COLLAPSED}px`;
  const hudColumn = hudCollapsed ? "0px" : "272px";

  return (
    <div className={classes.shell} style={{ gridTemplateColumns: `${railColumn} 1fr ${hudColumn}` }}>
      <IconRail page={page} className={classes.rail} />
      <TopBar page={page} className={classes.topBar} paletteState={paletteState} hudCollapsed={hudCollapsed} />
      <main ref={contentRef} className={classes.content}>
        {children}
      </main>
      {/* The Hud unmounts while collapsed so the script-hook DOM ids exist at most once in the document. */}
      <div className={classes.hudCell}>{!hudCollapsed && <Hud save={save} killScripts={killScripts} />}</div>
      <PalettePortal state={paletteState} />
    </div>
  );
}
