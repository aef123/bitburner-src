/**
 * Command palette — Ctrl/⌘+K navigation overlay.
 *
 * Task 3 of the UI Refresh plan. Provides instant fuzzy-ranked navigation to any visible page.
 *
 * Styling follows design-notes-1A: bg `bgPanel`, border `borderCard`, input row, result list,
 * kbd hint row — a natural extension of TopBar's search field.
 *
 * Ranking:
 *   1. Case-insensitive substring matches, ordered by match position then nav order.
 *   2. fast-dice-coefficient similarity above FUZZY_THRESHOLD for non-substring matches,
 *      ordered by score descending then nav order.
 *   Empty query → all visible pages in nav order.
 *
 * Navigation: only Router.toPage() / navigateToPage() calls. Pure navigation; no commands.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import Dialog from "@mui/material/Dialog";
import dice from "fast-dice-coefficient";

import { Page } from "../Router";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { navigationSections, isItemVisible } from "../../Sidebar/navigationItems";
import { navigateToPage } from "./useNavigationHotkeys";

// ─── Types ────────────────────────────────────────────────────────────────

/** A single result entry in the palette's list. */
export interface PaletteResult {
  /** Target page key used for navigation. */
  page: Page;
  /** Human-readable name (equals the Page enum string value). */
  label: string;
  /** Navigation section name, shown as a muted right-aligned badge. */
  section: string;
  /** Stable sort key: position of this item across all navigationSections in order. */
  navIndex: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Minimum dice similarity required for a non-substring result to appear. */
const FUZZY_THRESHOLD = 0.2;

// ─── Pure helpers (exported for unit testing) ─────────────────────────────

/**
 * Build the full list of visible PaletteResults from live player state.
 * Visibility mirrors navigationItems conditions exactly.
 */
export function getVisibleResults(): PaletteResult[] {
  const results: PaletteResult[] = [];
  let navIndex = 0;
  for (const section of navigationSections) {
    for (const item of section.items) {
      if (isItemVisible(item)) {
        results.push({
          page: item.page,
          label: String(item.page),
          section: section.label,
          navIndex,
        });
      }
      navIndex++;
    }
  }
  return results;
}

/**
 * Rank a list of results against a query string.
 *
 * Generic over anything with a `label` (the ranked text) and a `navIndex` (stable tie-break) so
 * the script editor's quick-open (Task 12) reuses the exact same ranking as the shell palette
 * instead of reimplementing it.
 *
 * Empty query → returns items unchanged (nav order).
 *
 * Ranking algorithm:
 *   - Bucket A: case-insensitive substring match → sort by match position ASC, then navIndex ASC.
 *   - Bucket B: dice similarity >= FUZZY_THRESHOLD AND not already in A → sort by score DESC, then navIndex ASC.
 *   - Bucket A comes before Bucket B in the final list.
 *   - Items that neither match nor exceed the fuzzy threshold are excluded.
 */
export function rankResults<T extends { label: string; navIndex: number }>(items: T[], query: string): T[] {
  if (!query) return items.slice();

  const lower = query.toLowerCase();
  const diceQuery = lower; // dice is already case-sensitive; we feed lowercased strings.

  const substringHits: Array<{ item: T; pos: number }> = [];
  const fuzzyHits: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const labelLower = item.label.toLowerCase();
    const pos = labelLower.indexOf(lower);
    if (pos !== -1) {
      substringHits.push({ item, pos });
    } else {
      const score = dice(labelLower, diceQuery);
      if (score >= FUZZY_THRESHOLD) {
        fuzzyHits.push({ item, score });
      }
    }
  }

  substringHits.sort((a, b) => a.pos - b.pos || a.item.navIndex - b.item.navIndex);
  fuzzyHits.sort((a, b) => b.score - a.score || a.item.navIndex - b.item.navIndex);

  return [...substringHits.map((h) => h.item), ...fuzzyHits.map((h) => h.item)];
}

// ─── Styles ───────────────────────────────────────────────────────────────

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  // MUI Dialog paper override: top-anchored palette look.
  paper: {
    margin: "64px auto 0",
    width: "540px",
    maxWidth: "calc(100vw - 32px)",
    backgroundColor: theme.colors.bgPanel,
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "10px",
    boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    verticalAlign: "top",
  },
  // Input row
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "0 14px",
    height: "48px",
    flexShrink: 0,
    borderBottom: `1px solid ${theme.colors.borderCard as string}`,
  },
  searchIcon: {
    color: theme.colors.textTertiary,
    fontSize: typeScale.subheading, // mock: 16px
    lineHeight: 1,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: typeScale.cardTitle, // mock: 14px
    fontWeight: 400,
    color: theme.colors.textBody,
    fontFamily: "inherit",
    "::placeholder": {
      color: theme.colors.textTertiary,
    },
  },
  // Result list
  resultList: {
    maxHeight: "360px",
    overflowY: "auto",
    padding: "6px 0",
    "&::-webkit-scrollbar": { display: "none" },
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },
  resultItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px 14px",
    cursor: "pointer",
    transition: "background-color 120ms ease-out",
    "&:hover": {
      backgroundColor: theme.colors.bgActive,
    },
  },
  resultItemSelected: {
    backgroundColor: theme.colors.bgActive,
  },
  resultLabel: {
    flex: 1,
    fontSize: typeScale.body, // mock: 13px
    fontWeight: 500,
    color: theme.colors.textBody,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  resultSection: {
    fontSize: typeScale.caption, // mock: 11px
    fontWeight: 600,
    color: theme.colors.textSecondary,
    flexShrink: 0,
    padding: "2px 7px",
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "4px",
    letterSpacing: "0.02em",
  },
  emptyMessage: {
    padding: "20px 14px",
    fontSize: typeScale.body, // mock: 13px
    color: theme.colors.textFaint,
    textAlign: "center",
  },
  // Keyboard hints footer
  hintRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 14px",
    borderTop: `1px solid ${theme.colors.borderCard as string}`,
    flexShrink: 0,
  },
  hint: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: typeScale.caption, // mock: 11px
    fontWeight: 500,
    color: theme.colors.textFaint,
  },
  kbd: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "4px",
    padding: "1px 5px",
    lineHeight: "1.4",
  },
  };
});

// ─── Component ────────────────────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Called with the target Page when the user confirms a selection. The caller is responsible for navigation. */
  onNavigate: (page: Page) => void;
}

export function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps): React.ReactElement {
  const { classes, cx } = useStyles();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Recompute visible results and ranking whenever query or open state changes.
  // `open` must be a dependency: PalettePortal keeps this component mounted, and on reopen
  // setQuery("") is a no-op when the query is already empty — without `open` here, a page
  // unlocked between opens (e.g. Gang) would be missing from the empty-query list.
  const results = useMemo<PaletteResult[]>(() => {
    const visible = getVisibleResults();
    return rankResults(visible, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` is intentionally included; see comment above.
  }, [query, open]);

  // Reset state when palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input on next tick (Dialog may not have mounted yet).
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Clamp selected index when result count changes.
  useEffect(() => {
    setSelectedIndex((prev) => (results.length === 0 ? 0 : Math.min(prev, results.length - 1)));
  }, [results.length]);

  // Scroll selected row into view on keyboard navigation.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector<HTMLElement>("[aria-selected='true']");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const confirmSelection = useCallback(
    (index: number) => {
      const result = results[index];
      if (!result) return;
      onNavigate(result.page);
      onClose();
    },
    [results, onNavigate, onClose],
  );

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
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
        confirmSelection(selectedIndex);
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
    }
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value);
    setSelectedIndex(0);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      // Stop Alt+X and other shell hotkeys from leaking through the Dialog.
      onKeyDown={(e) => e.stopPropagation()}
      PaperProps={{ className: classes.paper, elevation: 0 }}
      // Align to top of viewport.
      sx={{ alignItems: "flex-start" }}
      disablePortal={false}
      aria-label="Command palette"
    >
      {/* Input row */}
      <div className={classes.inputRow}>
        <span className={classes.searchIcon} aria-hidden="true">
          ⌕
        </span>
        <input
          ref={inputRef}
          className={classes.input}
          type="text"
          placeholder="Jump to anything…"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleInputKeyDown}
          aria-label="Search pages"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Result list */}
      <div ref={listRef} className={classes.resultList} role="listbox" aria-label="Navigation results">
        {results.length === 0 && query && <div className={classes.emptyMessage}>No pages match "{query}"</div>}
        {results.map((result, index) => {
          const isSelected = index === selectedIndex;
          return (
            <div
              key={result.page}
              role="option"
              aria-selected={isSelected}
              data-palette-item
              className={cx(classes.resultItem, isSelected && classes.resultItemSelected)}
              onClick={() => {
                setSelectedIndex(index);
                confirmSelection(index);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className={classes.resultLabel}>{result.label}</span>
              <span className={classes.resultSection}>{result.section}</span>
            </div>
          );
        })}
      </div>

      {/* Keyboard hint footer */}
      <div className={classes.hintRow} aria-hidden="true">
        <span className={classes.hint}>
          <kbd className={classes.kbd}>↑↓</kbd> navigate
        </span>
        <span className={classes.hint}>
          <kbd className={classes.kbd}>↵</kbd> open
        </span>
        <span className={classes.hint}>
          <kbd className={classes.kbd}>esc</kbd> close
        </span>
      </div>
    </Dialog>
  );
}

// ─── Controlled wrapper (for use in ShellLayout / TopBar) ─────────────────

/**
 * Self-contained palette that manages its own open/closed state.
 * Returned from usePaletteState(); consumed by ShellLayout's global shortcut
 * and by TopBar's search field click handler.
 */
export interface PaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export function usePaletteState(): PaletteState {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  // Stable object identity: consumers (e.g. ShellLayout's document keydown listener) depend on
  // this value, so a fresh object every render would re-register the listener every render.
  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
}

/**
 * The palette element to mount, wired to a PaletteState. Drop this into
 * ShellLayout next to the children. Navigation happens here via navigateToPage.
 */
export function PalettePortal({ state }: { state: PaletteState }): React.ReactElement {
  const handleNavigate = useCallback(
    (page: Page) => {
      state.close();
      navigateToPage(page);
    },
    [state],
  );

  return <CommandPalette open={state.isOpen} onClose={state.close} onNavigate={handleNavigate} />;
}
