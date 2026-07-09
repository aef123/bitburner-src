import React, { useState } from "react";
import { format } from "date-fns";
import { type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { Settings } from "../../Settings/Settings";
import { Terminal } from "../../Terminal";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { getSessionCommands } from "../sessionHistory";
import { reRunCommand } from "./reRunCommand";
import { useRerender } from "../../ui/React/hooks";

/** Pin or unpin a command in Settings.PinnedTerminalCommands (persists with the save). */
export function togglePinnedCommand(command: string): void {
  const pins = Settings.PinnedTerminalCommands;
  const index = pins.indexOf(command);
  if (index === -1) {
    pins.push(command);
  } else {
    pins.splice(index, 1);
  }
}

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  // Panel geometry per 2A notes: 250px left column, right hairline, own scroll.
  // Mock panel bg #0a0e13 has no token; bgApp (#0a0d12) is the nearest.
  panel: {
    width: "250px",
    flex: "none",
    boxSizing: "border-box",
    borderRight: `1px solid ${theme.colors.borderDefault as string}`,
    backgroundColor: theme.colors.bgApp,
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    fontFamily: Settings.styles.monoFontFamily,
    overflowY: "auto",
    minHeight: 0,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.eyebrow, // mock: 9.5px
    fontWeight: 600,
    color: theme.colors.textTertiary,
    letterSpacing: ".16em",
    padding: "0 6px",
    marginBottom: "10px",
    flexShrink: 0,
  },
  collapseChevron: {
    color: theme.colors.textTertiary,
    fontSize: typeScale.body,
    "&:hover": {
      color: theme.colors.textSecondary,
    },
  },
  // Search bar per 2A notes: 30px, border #22303e = borderCard, bg #0e141b = bgPanel.
  search: {
    height: "30px",
    flexShrink: 0,
    boxSizing: "border-box",
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "8px",
    backgroundColor: theme.colors.bgPanel,
    display: "flex",
    alignItems: "center",
    gap: "7px",
    padding: "0 10px",
    marginBottom: "14px",
  },
  searchIcon: {
    color: theme.colors.textTertiary,
    fontSize: typeScale.caption, // mock: 11px
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.body, // mock: 11px
    color: theme.colors.textBody,
    "&::placeholder": {
      color: theme.colors.textTertiary,
    },
  },
  sectionHeader: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.eyebrow, // mock: 9px
    fontWeight: 600,
    color: theme.colors.textFaint,
    letterSpacing: ".14em",
    padding: "0 6px",
    margin: "0 0 6px",
    flexShrink: 0,
  },
  sectionHeaderLater: {
    marginTop: "12px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: typeScale.body, // mock: 11px
    flexShrink: 0,
  },
  pinnedList: {
    gap: "3px",
    marginBottom: "14px",
  },
  earlierList: {
    opacity: 0.6,
  },
  // Pinned row per 2A notes: bg #0e141b = bgPanel, border #1a232e = borderDefault.
  pinnedRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    borderRadius: "6px",
    backgroundColor: theme.colors.bgPanel,
    border: `1px solid ${theme.colors.borderDefault as string}`,
    cursor: "pointer",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 8px",
    borderRadius: "6px",
    cursor: "pointer",
    "&:hover": {
      backgroundColor: theme.colors.bgPanel,
    },
  },
  // Active row per 2A notes: bg #152430 = bgActive, inset 2px cyan accent bar.
  rowActive: {
    backgroundColor: theme.colors.bgActive,
    boxShadow: `inset 2px 0 0 ${theme.colors.accentCyan as string}`,
  },
  rowCommand: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: theme.colors.textSecondary,
  },
  rowCommandPinned: {
    color: theme.colors.textBody,
  },
  rowCommandActive: {
    color: theme.colors.accentCyan,
  },
  rowTimestamp: {
    color: theme.colors.textFaint,
    fontSize: typeScale.caption, // mock: 9.5px
    fontWeight: 500,
    flexShrink: 0,
  },
  iconButton: {
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    fontFamily: Settings.styles.monoFontFamily,
    lineHeight: 1,
    flexShrink: 0,
    "&:disabled": {
      cursor: "default",
      opacity: 0.4,
    },
  },
  // Star/rerun glyphs follow the caption size so the click targets stay usable.
  starPinned: {
    color: theme.colors.accentGold,
    fontSize: typeScale.caption, // mock: 9px
  },
  starUnpinned: {
    color: theme.colors.textFaint,
    fontSize: typeScale.caption, // mock: 9px
  },
  rerun: {
    color: theme.colors.accentCyan,
    fontSize: typeScale.caption, // mock: 11px
  },
  footer: {
    marginTop: "auto",
    paddingTop: "14px",
    flexShrink: 0,
  },
  footerText: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.caption, // mock: 9.5px
    fontWeight: 500,
    lineHeight: 1.5,
    color: theme.colors.textFaint,
    padding: "0 6px",
    margin: 0,
  },
  empty: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textFaint,
    padding: "0 8px 4px",
  },
  };
});

interface RowProps {
  command: string;
  pinned: boolean;
  active?: boolean;
  timestamp?: number;
  showRerun?: boolean;
  actionActive: boolean;
  onPaste: (command: string) => void;
  onPinsChanged: () => void;
}

function HistoryRow({
  command,
  pinned,
  active,
  timestamp,
  showRerun,
  actionActive,
  onPaste,
  onPinsChanged,
}: RowProps): React.ReactElement {
  const { classes, cx } = useStyles();

  function handleClick(event: React.MouseEvent): void {
    if (event.shiftKey) {
      onPaste(command);
      return;
    }
    reRunCommand(command);
  }

  function handlePin(event: React.MouseEvent): void {
    event.stopPropagation();
    togglePinnedCommand(command);
    onPinsChanged();
  }

  function handleRerun(event: React.MouseEvent): void {
    event.stopPropagation();
    reRunCommand(command);
  }

  return (
    <div
      className={pinned && showRerun ? classes.pinnedRow : cx(classes.row, active && classes.rowActive)}
      data-history-command={command}
      title={command}
      onClick={handleClick}
    >
      <button
        className={cx(classes.iconButton, pinned ? classes.starPinned : classes.starUnpinned)}
        data-history-pin
        aria-label={pinned ? `Unpin ${command}` : `Pin ${command}`}
        onClick={handlePin}
      >
        {pinned ? "★" : "☆"}
      </button>
      <span
        className={cx(
          classes.rowCommand,
          pinned && showRerun && classes.rowCommandPinned,
          active && classes.rowCommandActive,
        )}
      >
        {command}
      </span>
      {timestamp !== undefined && <span className={classes.rowTimestamp}>{format(new Date(timestamp), "HH:mm")}</span>}
      {showRerun && (
        <button
          className={cx(classes.iconButton, classes.rerun)}
          data-history-rerun
          aria-label={`Re-run ${command}`}
          disabled={actionActive}
          onClick={handleRerun}
        >
          ↻
        </button>
      )}
    </div>
  );
}

interface CommandHistoryPanelProps {
  /** Shift+click: paste the command into the terminal input (wired to TerminalInput's setValue). */
  onPaste: (command: string) => void;
  /** Header chevron: collapse the panel back to its rail (persists via Settings.TerminalHistoryCollapsed). */
  onCollapse: () => void;
}

/**
 * Left-hand command history panel (Task 8, 2A part 1): PINNED (persisted via
 * Settings.PinnedTerminalCommands), THIS SESSION (UI-layer sessionHistory, with timestamps),
 * and EARLIER (Player.terminalCommandHistory minus this session — the save keeps no timestamps,
 * so those entries render dimmed and undated).
 */
export function CommandHistoryPanel({ onPaste, onCollapse }: CommandHistoryPanelProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const rerender = useRerender();
  const [query, setQuery] = useState("");

  const actionActive = Terminal.action !== null;
  const matches = (command: string): boolean => command.toLowerCase().includes(query.toLowerCase());

  const pinned = Settings.PinnedTerminalCommands.filter(matches);
  const allSession = getSessionCommands();
  // Newest first for display.
  const session = [...allSession].reverse().filter((entry) => matches(entry.command));
  const sessionSet = new Set(allSession.map((entry) => entry.command));
  // Dedupe: Player.terminalCommandHistory only dedupes consecutive repeats, so a command can
  // appear multiple times; EARLIER rows are keyed by command, which needs unique entries anyway.
  const earlier = [...new Set([...Player.terminalCommandHistory].reverse())].filter(
    (command) => !sessionSet.has(command) && matches(command),
  );

  const pinnedSet = new Set(Settings.PinnedTerminalCommands);
  // Highlight the newest session entry while its command is running (mock's ACTIVE row).
  // Derived from the UNFILTERED session list by entry identity: search must not shift the
  // highlight onto whatever older entry happens to match the query.
  const runningEntry = actionActive && allSession.length > 0 ? allSession[allSession.length - 1] : null;

  return (
    <div className={classes.panel} data-history-panel>
      <div className={classes.panelHeader}>
        <span>HISTORY</span>
        <button
          className={cx(classes.iconButton, classes.collapseChevron)}
          data-history-collapse
          title="Collapse panel"
          aria-label="Collapse the command history panel"
          onClick={onCollapse}
        >
          ‹
        </button>
      </div>
      <div className={classes.search}>
        <span className={classes.searchIcon}>⌕</span>
        <input
          className={classes.searchInput}
          data-history-search
          placeholder="Search commands…"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className={classes.sectionHeader}>PINNED</div>
      <div className={cx(classes.list, classes.pinnedList)} data-history-section="pinned">
        {pinned.length === 0 && <div className={classes.empty}>Nothing pinned yet</div>}
        {pinned.map((command) => (
          <HistoryRow
            key={command}
            command={command}
            pinned
            showRerun
            actionActive={actionActive}
            onPaste={onPaste}
            onPinsChanged={rerender}
          />
        ))}
      </div>

      <div className={classes.sectionHeader}>THIS SESSION</div>
      <div className={classes.list} data-history-section="session">
        {session.length === 0 && <div className={classes.empty}>No commands yet</div>}
        {session.map((entry) => (
          <HistoryRow
            key={`${entry.command}-${entry.timestamp}`}
            command={entry.command}
            pinned={pinnedSet.has(entry.command)}
            active={entry === runningEntry}
            timestamp={entry.timestamp}
            actionActive={actionActive}
            onPaste={onPaste}
            onPinsChanged={rerender}
          />
        ))}
      </div>

      {earlier.length > 0 && (
        <>
          <div className={cx(classes.sectionHeader, classes.sectionHeaderLater)}>EARLIER</div>
          <div className={cx(classes.list, classes.earlierList)} data-history-section="earlier">
            {earlier.map((command) => (
              <HistoryRow
                key={command}
                command={command}
                pinned={pinnedSet.has(command)}
                actionActive={actionActive}
                onPaste={onPaste}
                onPinsChanged={rerender}
              />
            ))}
          </div>
        </>
      )}

      <div className={classes.footer}>
        <p className={classes.footerText}>Click to re-run · ⇧click to paste · ★ pin</p>
      </div>
    </div>
  );
}
