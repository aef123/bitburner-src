import React from "react";
import { format } from "date-fns";
import Collapse from "@mui/material/Collapse";
import { alpha, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import type { CommandBlockStart } from "../OutputTypes";
import type { CommandBlockGroup } from "./groupOutputHistory";
import { Terminal } from "../../Terminal";
import { Settings } from "../../Settings/Settings";
import { TerminalOutputItem } from "./TerminalOutputItem";
import { useRerender } from "../../ui/React/hooks";
import { formatPercent } from "../../ui/formatNumber";
import { convertTimeMsToTimeElapsedString } from "../../utils/StringHelperFunctions";

const COLLAPSE_MS = 160; // collapse animation per 2A design notes

const useStyles = makeStyles()((theme: Theme) => {
  const accentCyan = theme.colors.accentCyan as string;
  const accentGreen = theme.colors.accentGreen as string;
  return {
    blockItem: {
      listStyleType: "none",
      marginBottom: "10px", // gap between blocks per 2A notes
    },
    // Card per 2A notes: bg #0c1117 = bgPanelDeep, border #1a232e = borderDefault, radius 10.
    card: {
      backgroundColor: theme.colors.bgPanelDeep,
      border: `1px solid ${theme.colors.borderDefault as string}`,
      borderRadius: "10px",
      overflow: "hidden",
    },
    // Running block border #1f4451 = borderAccent per 2A notes.
    cardRunning: {
      borderColor: theme.colors.borderAccent,
    },
    // Header row per 2A notes. Divider #131a22 has no token; derived as borderDefault at 55%
    // alpha over the bgPanelDeep card background.
    header: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      borderBottom: `1px solid ${alpha(theme.colors.borderDefault as string, 0.55)}`,
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "11.5px",
      cursor: "pointer",
      userSelect: "none",
    },
    prompt: {
      color: accentGreen,
      flexShrink: 0,
    },
    command: {
      color: theme.colors.textBody,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    spacer: {
      flex: 1,
      minWidth: 0,
    },
    // RUNNING badge per 2A notes. Badge bg #10202b has no token; derived as accentCyan at 8%
    // alpha over the dark card background.
    runningTag: {
      fontSize: "9.5px",
      color: accentCyan,
      backgroundColor: alpha(accentCyan, 0.08),
      borderRadius: "4px",
      padding: "2px 7px",
      letterSpacing: ".1em",
      flexShrink: 0,
    },
    timestamp: {
      color: theme.colors.textFaint,
      fontSize: "10px",
      flexShrink: 0,
    },
    chevron: {
      color: theme.colors.textFaint,
      fontSize: "11px",
      flexShrink: 0,
      display: "inline-block",
      transition: `transform ${COLLAPSE_MS}ms ease-out`,
    },
    chevronCollapsed: {
      transform: "rotate(-90deg)",
    },
    body: {
      padding: "10px 14px",
    },
    progressArea: {
      padding: "2px 0",
    },
    progressLabelRow: {
      display: "flex",
      justifyContent: "space-between",
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "10.5px",
      marginBottom: "6px",
      color: theme.colors.textSecondary,
    },
    progressPercent: {
      color: accentCyan,
    },
    progressTrack: {
      height: "5px",
      borderRadius: "3px",
      backgroundColor: theme.colors.track,
      overflow: "hidden",
    },
    // The ONE permitted gradient (2A mock): cyan → green progress fill.
    progressFill: {
      height: "100%",
      background: `linear-gradient(90deg, ${accentCyan}, ${accentGreen})`,
    },
    progressText: {
      fontFamily: Settings.styles.monoFontFamily,
      fontSize: "11px",
      color: theme.colors.textSecondary,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      margin: 0,
    },
  };
});

/**
 * Live progress readout for the active terminal action. Timed actions (hack/grow/weaken/...)
 * expose startTime/durationMs so we can render a numeric bar; custom actions (wget/upload) only
 * have text progress, so we fall back to that.
 */
function BlockProgress(): React.ReactElement | null {
  const { classes } = useStyles();
  useRerender(100); // tick the bar while the action runs
  const action = Terminal.action;
  if (action === null) return null;
  if (action.startTime === undefined || action.durationMs === undefined || action.durationMs <= 0) {
    return <p className={classes.progressText}>{action.getProgressText()}</p>;
  }
  const fraction = Math.min(Math.max((performance.now() - action.startTime) / action.durationMs, 0), 1);
  const remainingMs = Math.max(action.durationMs - (performance.now() - action.startTime), 0);
  return (
    <div className={classes.progressArea}>
      <div className={classes.progressLabelRow}>
        <span>ETA {convertTimeMsToTimeElapsedString(remainingMs)}</span>
        <span className={classes.progressPercent}>{formatPercent(fraction, 0)}</span>
      </div>
      <div className={classes.progressTrack}>
        <div className={classes.progressFill} data-command-block-progress-fill style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}

interface CommandBlockProps {
  block: CommandBlockGroup;
  collapsed: boolean;
  running: boolean;
  onToggleCollapse: (start: CommandBlockStart) => void;
}

function CommandBlockImpl({ block, collapsed, running, onToggleCollapse }: CommandBlockProps): React.ReactElement {
  const { classes, cx } = useStyles();
  return (
    <li className={classes.blockItem}>
      <div className={cx(classes.card, running && classes.cardRunning)} data-command-block>
        <div
          className={classes.header}
          data-command-block-header
          role="button"
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(block.start)}
        >
          <span className={classes.prompt}>❯</span>
          <span className={classes.command}>{block.start.command}</span>
          <span className={classes.spacer} />
          {running && <span className={classes.runningTag}>RUNNING</span>}
          <span className={classes.timestamp}>{format(new Date(block.start.timestamp), "HH:mm")}</span>
          <span className={cx(classes.chevron, collapsed && classes.chevronCollapsed)}>⌄</span>
        </div>
        <Collapse in={!collapsed} timeout={COLLAPSE_MS}>
          <div className={classes.body}>
            {block.items.map((item, i) => (
              <TerminalOutputItem key={i} item={item} />
            ))}
            {running && <BlockProgress />}
          </div>
        </Collapse>
      </div>
    </li>
  );
}

/**
 * Memoized so appends to the newest block don't re-render every older card on each 25ms-debounced
 * TerminalEvents emit. The items array is rebuilt by groupOutputHistory on every render, so we
 * compare cheap invariants instead of the array identity: within a block, any content change
 * either changes the item count (front splice) or the identity of the last item (append).
 */
export const CommandBlock = React.memo(CommandBlockImpl, (prev, next) => {
  const prevItems = prev.block.items;
  const nextItems = next.block.items;
  return (
    prev.block.start === next.block.start &&
    prevItems.length === nextItems.length &&
    prevItems[prevItems.length - 1] === nextItems[nextItems.length - 1] &&
    prev.collapsed === next.collapsed &&
    prev.running === next.running &&
    prev.onToggleCollapse === next.onToggleCollapse
  );
});
