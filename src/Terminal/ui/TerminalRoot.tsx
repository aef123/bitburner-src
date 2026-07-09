import React, { useState, useEffect, useRef, useCallback } from "react";
import { type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import _ from "lodash";

import type { CommandBlockStart } from "../OutputTypes";
import { Terminal } from "../../Terminal";
import { TerminalInput } from "./TerminalInput";
import { TerminalEvents, TerminalClearEvents } from "../TerminalEvents";
import { BitFlumeModal } from "../../BitNode/ui/BitFlumeModal";
import { CodingContractModal } from "../../ui/React/CodingContractModal";

import { useRerender } from "../../ui/React/hooks";
import { TerminalActionTimer } from "./TerminalActionTimer";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { groupOutputHistory } from "./groupOutputHistory";
import { CommandBlock } from "./CommandBlock";
import { CommandHistoryPanel } from "./CommandHistoryPanel";
import { TargetPanel } from "./TargetPanel";
import { TerminalOutputItem } from "./TerminalOutputItem";

/**
 * Collapse state per block, keyed by CommandBlockStart identity. Runtime-only (default expanded),
 * module-level so it survives page navigation; WeakSet entries die with their blocks when the
 * MaxTerminalCapacity splice drops them.
 */
const collapsedBlocks = new WeakSet<CommandBlockStart>();

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
    // Three columns: history (250px, collapsible) | terminal (flex 1) | target (280px, collapsible).
    // Both side panels collapse to slim 24px rails and ship COLLAPSED by default, so space-padded
    // script output gets the full pane width unless the player opts in to a panel.
    root: {
      display: "flex",
      height: "100%",
      minHeight: 0,
    },
    terminalColumn: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      fontFamily: Settings.styles.monoFontFamily,
    },
    entries: {
      listStyleType: "none",
      padding: "16px 18px",
      overflow: "scroll",
      flex: "0 1 auto",
      margin: "auto 0 0",
      fontFamily: Settings.styles.monoFontFamily,
    },
    // Side columns animate width between the rail and the full panel (160ms per the global
    // interaction rules). overflow hidden clips the fixed-width panel mid-transition so the
    // output column reflows smoothly; onTransitionEnd re-runs the autoscroll.
    sideColumn: {
      flex: "none",
      boxSizing: "border-box",
      overflow: "hidden",
      transition: "width 160ms ease-out",
      display: "flex",
      minHeight: 0,
    },
    historyColumnOpen: {
      width: "250px",
    },
    targetColumnOpen: {
      width: "280px",
    },
    sideColumnCollapsed: {
      width: "24px",
    },
    // Collapsed rail: a slim full-height button with an icon + vertical mono label.
    rail: {
      width: "24px",
      flex: "none",
      boxSizing: "border-box",
      border: "none",
      backgroundColor: theme.colors.bgApp,
      padding: "12px 0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
      cursor: "pointer",
      color: theme.colors.textTertiary,
      fontFamily: Settings.styles.monoFontFamily,
      "&:hover": {
        color: theme.colors.textSecondary,
        backgroundColor: theme.colors.bgPanel,
      },
    },
    railHistory: {
      borderRight: `1px solid ${theme.colors.borderDefault as string}`,
    },
    railTarget: {
      borderLeft: `1px solid ${theme.colors.borderDefault as string}`,
    },
    railIcon: {
      fontSize: typeScale.body,
      lineHeight: 1,
    },
    railLabel: {
      writingMode: "vertical-rl",
      fontSize: typeScale.eyebrow,
      fontWeight: 600,
      letterSpacing: ".16em",
    },
  };
});

export function TerminalRoot(): React.ReactElement {
  const scrollHook = useRef<HTMLUListElement>(null);
  const rerender = useRerender();
  const [key, setKey] = useState(0);
  const [, setCollapseVersion] = useState(0);
  // Side-panel collapse state mirrors the persisted settings; the setters below keep both in sync.
  const [historyCollapsed, setHistoryCollapsed] = useState(() => Settings.TerminalHistoryCollapsed);
  const [targetCollapsed, setTargetCollapsed] = useState(() => Settings.TerminalTargetCollapsed);
  // Paste-into-input wiring: TerminalInput registers its setValue here; the history panel's
  // Shift+click calls through it.
  const pasteHandler = useRef<(command: string) => void>(() => {});

  useEffect(() => {
    const debounced = _.debounce(() => rerender(), 25, { maxWait: 50 });
    const unsubscribe = TerminalEvents.subscribe(debounced);
    return () => {
      debounced.cancel();
      unsubscribe();
    };
  }, [rerender]);

  useEffect(() => {
    const clear = () => setKey((key) => key + 1);
    const debounced = _.debounce(() => clear(), 25, { maxWait: 50 });
    const unsubscribe = TerminalClearEvents.subscribe(debounced);
    return () => {
      debounced.cancel();
      unsubscribe();
    };
  }, []);

  function doScroll(): number | undefined {
    const hook = scrollHook.current;
    if (hook !== null) {
      return window.setTimeout(() => (hook.scrollTop = hook.scrollHeight), 50);
    }
  }

  doScroll();

  useEffect(() => {
    let scrollId: number;
    const id = setTimeout(() => {
      scrollId = doScroll() ?? 0;
    }, 50);
    return () => {
      clearTimeout(id);
      clearTimeout(scrollId);
    };
  }, []);

  const toggleCollapse = useCallback((start: CommandBlockStart) => {
    if (collapsedBlocks.has(start)) {
      collapsedBlocks.delete(start);
    } else {
      collapsedBlocks.add(start);
    }
    setCollapseVersion((version) => version + 1);
  }, []);

  const registerPaste = useCallback((fn: (command: string) => void) => {
    pasteHandler.current = fn;
  }, []);

  const setHistoryPanelCollapsed = useCallback((collapsed: boolean) => {
    Settings.TerminalHistoryCollapsed = collapsed;
    setHistoryCollapsed(collapsed);
  }, []);

  const setTargetPanelCollapsed = useCallback((collapsed: boolean) => {
    Settings.TerminalTargetCollapsed = collapsed;
    setTargetCollapsed(collapsed);
  }, []);

  const onPaste = useCallback((command: string) => {
    pasteHandler.current(command);
  }, []);

  // Re-pin the autoscroll once a side column finishes its 160ms width transition (the output <ul>
  // reflows during the animation). transitionend bubbles, so only react to the wrapper's own
  // width transition — hover transitions inside the panels must not hijack the scroll position.
  const onSideColumnTransitionEnd = useCallback((event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === "width") {
      doScroll();
    }
  }, []);

  const { classes, cx } = useStyles();
  // O(n) render-time grouping over ≤ MaxTerminalCapacity items; the history itself stays flat.
  const grouped = groupOutputHistory(Terminal.outputHistory);
  const running = Terminal.action !== null;
  const lastBlock = grouped.blocks.length > 0 ? grouped.blocks[grouped.blocks.length - 1] : null;

  return (
    <div className={classes.root}>
      <div
        className={cx(classes.sideColumn, historyCollapsed ? classes.sideColumnCollapsed : classes.historyColumnOpen)}
        data-history-column
        onTransitionEnd={onSideColumnTransitionEnd}
      >
        {historyCollapsed ? (
          <button
            className={cx(classes.rail, classes.railHistory)}
            data-history-expand
            title="Show command history"
            aria-label="Expand the command history panel"
            onClick={() => setHistoryPanelCollapsed(false)}
          >
            <span className={classes.railIcon} aria-hidden="true">
              ≡
            </span>
            <span className={classes.railLabel}>HISTORY</span>
          </button>
        ) : (
          <CommandHistoryPanel onPaste={onPaste} onCollapse={() => setHistoryPanelCollapsed(true)} />
        )}
      </div>
      <div className={classes.terminalColumn}>
        <ul key={key} id="terminal" className={classes.entries} ref={scrollHook}>
          {grouped.preamble.map((item, i) => (
            <li key={i}>
              <TerminalOutputItem item={item} />
            </li>
          ))}
          {grouped.blocks.map((block, i) => (
            <CommandBlock
              key={i}
              block={block}
              collapsed={collapsedBlocks.has(block.start)}
              running={running && block === lastBlock}
              onToggleCollapse={toggleCollapse}
            />
          ))}

          {/* Fallback: an action with no command block to attach to (e.g. output history cleared
              mid-action) still shows the legacy progress line. */}
          {running && lastBlock === null && (
            <li>
              <TerminalActionTimer />{" "}
            </li>
          )}
        </ul>
        <TerminalInput registerPaste={registerPaste} />
      </div>
      {/* Rerenders with this component's 25ms-debounced TerminalEvents subscription (deliberately
          not memoized): analyze completion prints (→ emit) and connect calls setcwd (→ emit). */}
      <div
        className={cx(classes.sideColumn, targetCollapsed ? classes.sideColumnCollapsed : classes.targetColumnOpen)}
        data-target-column
        onTransitionEnd={onSideColumnTransitionEnd}
      >
        {targetCollapsed ? (
          <button
            className={cx(classes.rail, classes.railTarget)}
            data-target-expand
            title="Show target panel"
            aria-label="Expand the target panel"
            onClick={() => setTargetPanelCollapsed(false)}
          >
            <span className={classes.railIcon} aria-hidden="true">
              ⓘ
            </span>
            <span className={classes.railLabel}>TARGET</span>
          </button>
        ) : (
          <TargetPanel onCollapse={() => setTargetPanelCollapsed(true)} />
        )}
      </div>
      <BitFlumeModal />
      <CodingContractModal />
    </div>
  );
}
