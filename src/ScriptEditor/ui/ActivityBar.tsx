/**
 * Activity bar for the script editor (Task 11, 2C part 1) per design-notes-2C: 46px strip with
 * 34×34 buttons and the inset 2px cyan indicator on the active one.
 *
 * v1 contents (Search arrives in Task 12): Explorer toggle, NS API docs (the Toolbar's
 * DocumentationAutocomplete relocated into a popover — Ctrl-click/Ctrl-Enter still opens
 * externally via the same onSelection event inspection), then bottom-aligned Terminal (the
 * Toolbar's "Terminal" button relocated) and editor Settings (existing OptionsModal, opened by
 * the Root).
 */

import React, { useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { Router } from "../../ui/GameRoot";
import { Page } from "../../ui/Router";
import { Settings } from "../../Settings/Settings";
import { DocumentationAutocomplete } from "../../Documentation/ui/DocumentationAutocomplete";
import { openDocumentationPopUp } from "../../Documentation/root";
import { defaultNsApiPage, openDocExternally } from "../../ui/React/Documentation";
import { DocumentationLink } from "../../ui/React/DocumentationLink";
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
  popover: {
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: theme.colors.bgPanelDeep,
    border: `1px solid ${theme.colors.borderFocus as string}`,
  },
  popoverHint: {
    color: theme.colors.textTertiary,
    fontSize: "10.5px",
  },
}));

interface ActivityBarProps {
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onOpenOptions: () => void;
}

export function ActivityBar({ explorerOpen, onToggleExplorer, onOpenOptions }: ActivityBarProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const [docsOpen, setDocsOpen] = useState(false);
  const docsAnchor = useRef<HTMLButtonElement | null>(null);

  return (
    <div className={classes.bar} data-activity-bar>
      <Tooltip title="Explorer" placement="right">
        <button
          className={cx(classes.button, explorerOpen && classes.buttonActive)}
          data-activity-explorer
          onClick={onToggleExplorer}
        >
          ▤
        </button>
      </Tooltip>
      <Tooltip title="NS API documentation" placement="right">
        <button
          ref={docsAnchor}
          className={cx(classes.button, docsOpen && classes.buttonActive)}
          data-activity-docs
          onClick={() => setDocsOpen(true)}
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

      <Popover
        open={docsOpen}
        anchorEl={docsAnchor.current}
        onClose={() => setDocsOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        classes={{ paper: classes.popover }}
      >
        {/* Same handler the Toolbar used: plain select opens the in-game popup, Ctrl-select opens
            the external docs site (DocumentationAutocomplete reports ctrlKey via `external`). */}
        <DocumentationAutocomplete
          onChange={(path, external) => {
            setDocsOpen(false);
            if (external) {
              openDocExternally(path);
              return;
            }
            openDocumentationPopUp(path);
          }}
          width={350}
        />
        <Typography className={classes.popoverHint}>Ctrl+select opens in your browser</Typography>
        <Typography>
          <DocumentationLink page={defaultNsApiPage}>NS API documentation</DocumentationLink>
        </Typography>
      </Popover>
    </div>
  );
}
