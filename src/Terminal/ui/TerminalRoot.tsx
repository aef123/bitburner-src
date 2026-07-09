import React, { useState, useEffect, useRef, useCallback } from "react";
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

const useStyles = makeStyles()(() => ({
  // Three columns per 2A notes: history panel (250px) | terminal (flex 1) | target panel (280px).
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
}));

export function TerminalRoot(): React.ReactElement {
  const scrollHook = useRef<HTMLUListElement>(null);
  const rerender = useRerender();
  const [key, setKey] = useState(0);
  const [, setCollapseVersion] = useState(0);
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

  const onPaste = useCallback((command: string) => {
    pasteHandler.current(command);
  }, []);

  const { classes } = useStyles();
  // O(n) render-time grouping over ≤ MaxTerminalCapacity items; the history itself stays flat.
  const grouped = groupOutputHistory(Terminal.outputHistory);
  const running = Terminal.action !== null;
  const lastBlock = grouped.blocks.length > 0 ? grouped.blocks[grouped.blocks.length - 1] : null;

  return (
    <div className={classes.root}>
      <CommandHistoryPanel onPaste={onPaste} />
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
      <TargetPanel />
      <BitFlumeModal />
      <CodingContractModal />
    </div>
  );
}
