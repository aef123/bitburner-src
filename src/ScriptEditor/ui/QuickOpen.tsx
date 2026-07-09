/**
 * Quick-open overlay for the script editor (Task 12, 2C part 2) per design-notes-2C: floating
 * 480px card, 52px from the top, centered over the editor area.
 *
 * Search space: every content file (scripts + text files) on the current script's server plus all
 * servers passing the explorer's honest access filter (editorSearch.ts → explorerTree.ts).
 * Ranking: the shell command palette's rankResults helper (substring position, then dice fuzzy) —
 * shared, not reimplemented. Opening goes through the Root's openFileFromExplorer machinery via
 * the onOpenFile callback.
 *
 * Opened by Ctrl+P registered ON THE EDITOR (see ScriptEditorRoot.onMount) so the binding cannot
 * leak outside the editor page. Esc closes; the Root's onClose returns focus to the editor.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Settings } from "../../Settings/Settings";
import { rankResults } from "../../ui/Shell/CommandPalette";
import { getLiveSearchableFiles, quickOpenEntries, type QuickOpenEntry } from "./editorSearch";

/** Rows rendered at once; ranking already puts the best matches first. */
const MAX_VISIBLE_RESULTS = 12;

const useStyles = makeStyles()((theme: Theme) => ({
  // Invisible backdrop over the editor area: click-away closes, like the palette's Dialog.
  backdrop: {
    position: "absolute",
    inset: 0,
    zIndex: 4,
  },
  // Overlay geometry per 2C notes: 480px, top 52, centered, radius 12, padding 8, z-index 5.
  // Mock bg #101823 has no token; bgPanel is the nearest. Border #2a4152 = borderFocus exactly.
  overlay: {
    position: "absolute",
    left: "50%",
    top: "52px",
    transform: "translateX(-50%)",
    width: "480px",
    maxWidth: "calc(100% - 32px)",
    backgroundColor: theme.colors.bgPanel,
    border: `1px solid ${theme.colors.borderFocus as string}`,
    borderRadius: "12px",
    boxShadow: "0 24px 60px rgba(0,0,0,.65)",
    zIndex: 5,
    padding: "8px",
    boxSizing: "border-box",
  },
  // Input row per notes: border #22303e = borderCard exactly, bg #0d141c → bgPanelDeep nearest.
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "8px",
    backgroundColor: theme.colors.bgPanelDeep,
    padding: "9px 12px",
    marginBottom: "6px",
  },
  searchIcon: {
    color: theme.colors.textTertiary,
    fontSize: "12.5px",
    lineHeight: 1,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "12.5px",
    color: theme.colors.textPrimary,
    "::placeholder": {
      color: theme.colors.textTertiary,
    },
  },
  resultList: {
    maxHeight: "300px",
    overflowY: "auto",
  },
  // Result rows per notes: 8px 10px, radius 7, selected bg #152430 = bgActive exactly.
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "8px 10px",
    borderRadius: "7px",
    border: "none",
    background: "none",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "11.5px",
    color: theme.colors.textSecondary,
  },
  rowSelected: {
    backgroundColor: theme.colors.bgActive,
    color: theme.colors.textPrimary,
  },
  path: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  match: {
    color: theme.colors.accentCyan,
  },
  // Server badge per notes: 10px; current server dim, other servers gold.
  server: {
    flexShrink: 0,
    fontSize: "10px",
    color: theme.colors.textTertiary,
  },
  serverRemote: {
    color: theme.colors.accentGold,
  },
  empty: {
    padding: "10px",
    fontSize: "11.5px",
    color: theme.colors.textFaint,
    fontFamily: Settings.styles.monoFontFamily,
  },
  // Footer per notes: 9.5px sans, textFaint. Hints list only what is really bound.
  footer: {
    display: "flex",
    gap: "14px",
    padding: "8px 10px 4px",
    fontSize: "9.5px",
    color: theme.colors.textFaint,
  },
}));

interface QuickOpenProps {
  open: boolean;
  /** The active script's server: its files rank first and get the dim (non-gold) badge. */
  currentHostname: string;
  onOpenFile: (hostname: string, path: string) => void;
  onClose: () => void;
}

/** Path with the first case-insensitive query hit highlighted (mock: "batch" in cyan). */
function HighlightedPath({ path, query, matchClass }: { path: string; query: string; matchClass: string }) {
  if (query === "") {
    return <>{path}</>;
  }
  const index = path.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return <>{path}</>;
  }
  return (
    <>
      {path.slice(0, index)}
      <span className={matchClass}>{path.slice(index, index + query.length)}</span>
      {path.slice(index + query.length)}
    </>
  );
}

export function QuickOpen({ open, currentHostname, onOpenFile, onClose }: QuickOpenProps): React.ReactElement | null {
  const { classes, cx } = useStyles();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Collect the honest file set once per opening (files rarely change mid-keystroke; reopening
  // re-collects). Entry order = current server first, then accessible servers alphabetically.
  const entries = useMemo<QuickOpenEntry[]>(() => {
    if (!open) {
      return [];
    }
    return quickOpenEntries(getLiveSearchableFiles(currentHostname));
  }, [open, currentHostname]);

  const results = useMemo(() => rankResults(entries, query).slice(0, MAX_VISIBLE_RESULTS), [entries, query]);

  // Reset + focus when opening.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex((prev) => (results.length === 0 ? 0 : Math.min(prev, results.length - 1)));
  }, [results.length]);

  if (!open) {
    return null;
  }

  const confirm = (index: number): void => {
    const result = results[index];
    if (!result) {
      return;
    }
    onOpenFile(result.hostname, result.path);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) => (results.length === 0 ? 0 : (prev - 1 + results.length) % results.length));
        break;
      case "Enter":
        event.preventDefault();
        confirm(selectedIndex);
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <>
      <div className={classes.backdrop} onClick={onClose} data-quick-open-backdrop />
      <div className={classes.overlay} data-quick-open role="dialog" aria-label="Quick open file">
        <div className={classes.inputRow}>
          <span className={classes.searchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            className={classes.input}
            data-quick-open-input
            type="text"
            placeholder="Go to file…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            aria-label="Search files"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={classes.resultList} role="listbox" aria-label="File results">
          {results.length === 0 && <div className={classes.empty}>No files match "{query}"</div>}
          {results.map((result, index) => (
            <button
              key={`${result.hostname}:/${result.path}`}
              role="option"
              aria-selected={index === selectedIndex}
              data-quick-open-result={`${result.hostname}:/${result.path}`}
              className={cx(classes.row, index === selectedIndex && classes.rowSelected)}
              onClick={() => confirm(index)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className={classes.path}>
                <HighlightedPath path={result.path} query={query} matchClass={classes.match} />
              </span>
              <span className={cx(classes.server, result.hostname !== currentHostname && classes.serverRemote)}>
                {result.hostname}
              </span>
            </button>
          ))}
        </div>
        <div className={classes.footer} aria-hidden="true">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </>
  );
}
