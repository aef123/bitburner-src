/**
 * Full-text search panel for the script editor (Task 12, 2C part 2). Sits in the explorer's slot
 * (218px, same chrome) when the activity bar's Search icon is active or Ctrl+Shift+F is pressed
 * inside the editor.
 *
 * Search space: the SAME honest file set as the explorer/quick-open (editorSearch.ts). Plain-text
 * search, NOT regex (v1, documented) with a case-sensitivity toggle. Total matches are capped at
 * SEARCH_MATCH_CAP with an explicit notice — never silent truncation. Clicking a match opens the
 * file at that exact position through the Root's open machinery (onOpenAt).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import Tooltip from "@mui/material/Tooltip";

import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { getLiveSearchableFiles, searchFiles, SEARCH_MATCH_CAP, type SearchResults } from "./editorSearch";

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  // Same panel geometry/chrome as ExplorerPanel: 218px, bgPanelDeep, right hairline.
  panel: {
    width: "218px",
    flex: "none",
    boxSizing: "border-box",
    backgroundColor: theme.colors.bgPanelDeep,
    borderRight: `1px solid ${theme.colors.borderDefault as string}`,
    padding: "12px 0",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  sectionHeader: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.eyebrow, // mock: 9px
    fontWeight: 600,
    color: theme.colors.textTertiary,
    letterSpacing: ".14em",
    padding: "0 14px",
    marginBottom: "8px",
    textTransform: "uppercase",
  },
  // Input row styled like the quick-open field, narrowed to the panel.
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    margin: "0 10px 8px",
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "8px",
    backgroundColor: theme.colors.bgPanel,
    padding: "6px 8px",
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.body, // mock: 11.5px
    color: theme.colors.textPrimary,
    "::placeholder": {
      color: theme.colors.textTertiary,
    },
  },
  caseToggle: {
    flexShrink: 0,
    border: `1px solid ${theme.colors.borderCard as string}`,
    borderRadius: "4px",
    background: "none",
    padding: "1px 4px",
    cursor: "pointer",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textTertiary,
  },
  caseToggleActive: {
    color: theme.colors.accentCyan,
    borderColor: theme.colors.borderFocus,
  },
  results: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  // Explicit cap notice (accentGold: it is a warning about incomplete results, not an error).
  cappedNotice: {
    padding: "4px 14px 8px",
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.accentGold,
  },
  hint: {
    padding: "4px 14px",
    fontSize: typeScale.caption, // mock: 10.5px
    fontWeight: 500,
    color: theme.colors.textFaint,
  },
  fileHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    padding: "6px 14px 2px",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.body, // mock: 11px
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  fileServer: {
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textTertiary,
  },
  fileServerRemote: {
    color: theme.colors.accentGold,
  },
  matchRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    width: "100%",
    padding: "2px 14px 2px 20px",
    boxSizing: "border-box",
    border: "none",
    background: "none",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.body, // mock: 10.5px
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    "&:hover": {
      backgroundColor: theme.colors.bgActive,
    },
  },
  matchLine: {
    flexShrink: 0,
    color: theme.colors.textFaint,
  },
  matchPreview: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  };
});

interface SearchPanelProps {
  /** The active script's server (its files are searched first; its badge renders dim). */
  currentHostname: string;
  /** Bumped by the Root's Ctrl+Shift+F editor action; each bump refocuses the query input. */
  focusToken: number;
  onOpenAt: (hostname: string, path: string, line: number, column: number) => void;
}

const EMPTY_RESULTS: SearchResults = { files: [], total: 0, capped: false };

export function SearchPanel({ currentHostname, focusToken, onOpenAt }: SearchPanelProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the query field on mount and whenever the editor's Ctrl+Shift+F action bumps the token.
  useEffect(() => {
    inputRef.current?.focus();
  }, [focusToken]);

  // Synchronous search per keystroke: the file set is in-memory strings and searchFiles bails at
  // the cap, so this stays cheap at player-script scale. Contents are re-read per query change,
  // which also picks up on-disk edits between keystrokes.
  const results = useMemo<SearchResults>(() => {
    if (query === "") {
      return EMPTY_RESULTS;
    }
    return searchFiles(getLiveSearchableFiles(currentHostname), query, { caseSensitive });
  }, [query, caseSensitive, currentHostname]);

  return (
    <div className={classes.panel} data-search-panel>
      <div className={classes.sectionHeader}>SEARCH · ALL SERVERS</div>
      <div className={classes.inputRow}>
        <input
          ref={inputRef}
          className={classes.input}
          data-search-input
          type="text"
          placeholder="Search (plain text)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search file contents"
          autoComplete="off"
          spellCheck={false}
        />
        <Tooltip title="Match case">
          <button
            className={cx(classes.caseToggle, caseSensitive && classes.caseToggleActive)}
            data-search-case-toggle
            aria-pressed={caseSensitive}
            onClick={() => setCaseSensitive(!caseSensitive)}
          >
            Aa
          </button>
        </Tooltip>
      </div>

      <div className={classes.results}>
        {results.capped && (
          <div className={classes.cappedNotice} data-search-capped>
            Results capped at {SEARCH_MATCH_CAP} matches — refine your query.
          </div>
        )}
        {query === "" && <div className={classes.hint}>Type to search every file on servers you have access to.</div>}
        {query !== "" && results.total === 0 && <div className={classes.hint}>No matches for "{query}"</div>}
        {results.files.map((file) => (
          <React.Fragment key={`${file.hostname}:/${file.path}`}>
            <div className={classes.fileHeader} data-search-file={`${file.hostname}:/${file.path}`}>
              <span>{file.path}</span>
              <span className={cx(classes.fileServer, file.hostname !== currentHostname && classes.fileServerRemote)}>
                {file.hostname}
              </span>
            </div>
            {file.matches.map((match) => (
              <button
                key={`${match.line}:${match.column}`}
                className={classes.matchRow}
                data-search-match={`${file.hostname}:/${file.path}:${match.line}:${match.column}`}
                onClick={() => onOpenAt(file.hostname, file.path, match.line, match.column)}
              >
                <span className={classes.matchLine}>{match.line}:</span>
                <span className={classes.matchPreview}>{match.lineText.trim()}</span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
