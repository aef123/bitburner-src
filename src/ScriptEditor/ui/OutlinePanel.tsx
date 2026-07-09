/**
 * OUTLINE section at the bottom of the explorer panel (Task 11, 2C part 1).
 *
 * Symbols come from extractOutline (regex over top-level declarations — the documented v1
 * implementation; see outline.ts for why the TS-worker route was not shipped). Clicking a symbol
 * reveals its line in the editor via the Root's reveal callback.
 */

import React from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { extractOutline, type OutlineKind } from "./outline";

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  // Section header per 2C notes: 9px mono 600, letter-spacing .14em, #55677a = textTertiary.
  header: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.eyebrow, // mock: 9px
    fontWeight: 600,
    color: theme.colors.textTertiary,
    letterSpacing: ".14em",
    padding: "0 14px",
    marginBottom: "8px",
    textTransform: "uppercase",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  list: {
    fontSize: typeScale.body, // mock: 11px
    display: "flex",
    flexDirection: "column",
    paddingBottom: "4px",
    maxHeight: "180px",
    overflowY: "auto",
  },
  entry: {
    display: "flex",
    gap: "6px",
    alignItems: "baseline",
    padding: "3px 14px",
    background: "none",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.body, // mock: 11px
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    "&:hover": {
      backgroundColor: theme.colors.bgActive,
    },
  },
  // Kind glyph colors per 2C notes: ƒ violet, □ (const) gold; classes get cyan.
  glyphFunction: {
    color: theme.colors.accentViolet,
  },
  glyphConst: {
    color: theme.colors.accentGold,
  },
  glyphClass: {
    color: theme.colors.accentCyan,
  },
  };
});

const GLYPHS: Record<OutlineKind, string> = {
  function: "ƒ",
  const: "□",
  class: "◇",
};

interface OutlinePanelProps {
  /** Basename shown in the header, e.g. "bootstrap.js". */
  fileName: string | null;
  code: string;
  onReveal: (line: number) => void;
}

export function OutlinePanel({ fileName, code, onReveal }: OutlinePanelProps): React.ReactElement | null {
  const { classes, cx } = useStyles();
  if (fileName === null) {
    return null;
  }
  const outline = extractOutline(code);
  return (
    <div data-outline-panel>
      <div className={classes.header}>OUTLINE — {fileName}</div>
      <div className={classes.list}>
        {outline.map((item) => (
          <button
            key={`${item.name}:${item.line}`}
            className={classes.entry}
            data-outline-symbol={item.name}
            onClick={() => onReveal(item.line)}
          >
            <span
              className={cx(
                item.kind === "function" && classes.glyphFunction,
                item.kind === "const" && classes.glyphConst,
                item.kind === "class" && classes.glyphClass,
              )}
            >
              {GLYPHS[item.kind]}
            </span>
            <span>{item.signature}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
