import React, { useCallback, useEffect, useRef } from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { Router } from "../GameRoot";
import { Page } from "../Router";
import { Settings } from "../../Settings/Settings";
import { IconRail } from "./IconRail";
import { TopBar } from "./TopBar";
import { useNavigationHotkeys } from "./useNavigationHotkeys";
import { PalettePortal, usePaletteState } from "./CommandPalette";
import { KeyBindingEvents, KeyBindingEventType } from "../../utils/KeyBindingUtils";

const useStyles = makeStyles()((theme: Theme) => ({
  /**
   * Shell grid per design notes 1A: 60px icon rail spanning the full height, 52px top bar, content below.
   * The docked HUD adds a third column in a later task.
   */
  shell: {
    display: "grid",
    gridTemplateColumns: "60px 1fr",
    gridTemplateRows: "52px 1fr",
    gridTemplateAreas: `"rail topbar" "rail content"`,
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
}));

export function ShellLayout({ page, children }: { page: Page; children: React.ReactNode }): React.ReactElement {
  useNavigationHotkeys();
  const { classes } = useStyles();
  const contentRef = useRef<HTMLElement>(null);
  const paletteState = usePaletteState();
  const isSettingUpKeyBindings = useRef(false);

  // Track key-binding-setup events so Ctrl+K is also suppressed during rebinding.
  useEffect(() => {
    const clear = KeyBindingEvents.subscribe((eventType) => {
      if (eventType === KeyBindingEventType.StartSettingUp) isSettingUpKeyBindings.current = true;
      if (eventType === KeyBindingEventType.StopSettingUp) isSettingUpKeyBindings.current = false;
    });
    return clear;
  }, []);

  // Global Ctrl/⌘+K shortcut — same suppression rules as Alt+X hotkeys.
  const handlePaletteShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (Settings.DisableHotkeys) return;
      if (event.getModifierState(event.key)) return;
      if (isSettingUpKeyBindings.current) return;
      if ((Player.currentWork && Player.focus) || Router.page() === Page.BitVerse) return;

      const isK = event.key === "k" || event.key === "K";
      const hasCtrlOrMeta = event.ctrlKey || event.metaKey;
      if (!isK || !hasCtrlOrMeta) return;

      event.preventDefault();
      paletteState.open();
    },
    [paletteState],
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

  return (
    <div className={classes.shell}>
      <IconRail page={page} className={classes.rail} />
      <TopBar page={page} className={classes.topBar} paletteState={paletteState} />
      <main ref={contentRef} className={classes.content}>
        {children}
      </main>
      <PalettePortal state={paletteState} />
    </div>
  );
}
