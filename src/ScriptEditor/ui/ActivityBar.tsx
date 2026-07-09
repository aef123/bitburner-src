/**
 * Activity bar for the script editor (2C) per design-notes-2C: 46px strip with 34×34 buttons and
 * the inset 2px cyan indicator on the active one.
 *
 * Task 12 contents: Explorer / Search side-panel toggles (Ctrl+Shift+F inside the editor also
 * activates Search), NS API docs (opens the bottom panel's NS API tab — the Task 11 popover moved
 * there entirely, same DocumentationAutocomplete + link, so no capability was lost), then
 * bottom-aligned Terminal (the old Toolbar's button relocated) and editor Settings (existing
 * OptionsModal, opened by the Root).
 */

import React from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import Tooltip from "@mui/material/Tooltip";

import { Router } from "../../ui/GameRoot";
import { Page } from "../../ui/Router";
import { Settings } from "../../Settings/Settings";
import { CurrentKeyBindings, parseKeyCombinationsToString, ScriptEditorAction } from "../../utils/KeyBindingUtils";

const useStyles = makeStyles()((theme: Theme) => ({
  // Bar geometry per 2C notes: 46px, bg #0c1016 = bgRail, right hairline #1a232e = borderDefault.
  bar: {
    width: "46px",
    flex: "none",
    boxSizing: "border-box",
    backgroundColor: theme.colors.bgRail,
    borderRight: `1px solid ${theme.colors.borderDefault as string}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "10px 0",
    gap: "2px",
  },
  // Buttons per 2C notes: 34×34, radius 8. Mock inactive icon color #5c7186 has no token;
  // textTertiary (#55677a) is the nearest step.
  button: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    border: "none",
    background: "none",
    color: theme.colors.textTertiary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontFamily: Settings.styles.monoFontFamily,
    cursor: "pointer",
    "&:hover": {
      color: theme.colors.textSecondary,
    },
  },
  buttonActive: {
    backgroundColor: theme.colors.bgActive,
    color: theme.colors.accentCyan,
    boxShadow: `inset 2px 0 0 ${theme.colors.accentCyan as string}`,
    "&:hover": {
      color: theme.colors.accentCyan,
    },
  },
  spacer: {
    flex: 1,
  },
}));

export type SidePanelKind = "explorer" | "search";

interface ActivityBarProps {
  /** Which side panel is showing (null = none). */
  activePanel: SidePanelKind | null;
  /** Clicking an already-active panel icon closes the panel (the Root toggles). */
  onSelectPanel: (panel: SidePanelKind) => void;
  /** Whether the bottom panel is open on the NS API tab (drives the ◈ active state). */
  nsApiOpen: boolean;
  onToggleNsApi: () => void;
  onOpenOptions: () => void;
}

export function ActivityBar({
  activePanel,
  onSelectPanel,
  nsApiOpen,
  onToggleNsApi,
  onOpenOptions,
}: ActivityBarProps): React.ReactElement {
  const { classes, cx } = useStyles();

  return (
    <div className={classes.bar} data-activity-bar>
      <Tooltip title="Explorer" placement="right">
        <button
          className={cx(classes.button, activePanel === "explorer" && classes.buttonActive)}
          data-activity-explorer
          onClick={() => onSelectPanel("explorer")}
        >
          ▤
        </button>
      </Tooltip>
      {/* Binding is registered on the editor itself (ScriptEditorRoot.onMount), so it only fires
          while the editor has focus — the tooltip says so to stay honest. */}
      <Tooltip title="Search all servers (Ctrl+Shift+F in the editor)" placement="right">
        <button
          className={cx(classes.button, activePanel === "search" && classes.buttonActive)}
          data-activity-search
          onClick={() => onSelectPanel("search")}
        >
          ⌕
        </button>
      </Tooltip>
      <Tooltip title="NS API documentation" placement="right">
        <button
          className={cx(classes.button, nsApiOpen && classes.buttonActive)}
          data-activity-docs
          onClick={onToggleNsApi}
        >
          ◈
        </button>
      </Tooltip>
      <div className={classes.spacer} />
      <Tooltip
        title={`Terminal (${parseKeyCombinationsToString(CurrentKeyBindings[ScriptEditorAction.GoToTerminal])})`}
        placement="right"
      >
        <button className={classes.button} data-activity-terminal onClick={() => Router.toPage(Page.Terminal)}>
          ❯
        </button>
      </Tooltip>
      <Tooltip title="Editor options" placement="right">
        <button className={classes.button} data-activity-options onClick={onOpenOptions}>
          ⚙
        </button>
      </Tooltip>
    </div>
  );
}
