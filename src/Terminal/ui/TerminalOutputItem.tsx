import React from "react";
import { Link as MuiLink, Typography } from "@mui/material";
import { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Output, Link, RawOutput, type TerminalHistoryItem } from "../OutputTypes";
import { Terminal } from "../../Terminal";
import { ANSIITypography } from "../../ui/React/ANSIITypography";
import { Settings } from "../../Settings/Settings";

const useStyles = makeStyles()((theme: Theme) => ({
  preformatted: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    margin: theme.spacing(0),
    width: "100%",
    fontFamily: Settings.styles.monoFontFamily,
  },
}));

/**
 * The existing per-item terminal output rendering (Output → ANSIITypography, RawOutput →
 * Typography, Link → clickable hostname), extracted verbatim from TerminalRoot so that bare
 * preamble items and command-block bodies render identically (Task 8).
 */
export function TerminalOutputItem({ item }: { item: TerminalHistoryItem }): React.ReactElement | null {
  const { classes } = useStyles();
  if (item instanceof Output) return <ANSIITypography text={item.text} color={item.color} />;
  if (item instanceof RawOutput) {
    return (
      <Typography component="div" classes={{ root: classes.preformatted }} paragraph={false}>
        {item.raw}
      </Typography>
    );
  }
  if (item instanceof Link) {
    return (
      <Typography component="div" classes={{ root: classes.preformatted }}>
        {item.dashes}
        <MuiLink onClick={() => Terminal.connectToServer(item.hostname)}>{item.hostname}</MuiLink>
      </Typography>
    );
  }
  return null;
}
