/**
 * Collapsible per-server group for the Active Scripts page (1F redesign of
 * ServerAccordion + ServerAccordionContent).
 *
 * Header per design-notes-1F: chevron · mono server name (accentCyan when expanded,
 * muted when collapsed) · inline 180×5px RAM bar (fill = the server's network-RAM
 * category color) · used/total RAM · spacer · script count (+ group income/s when
 * collapsed). Expanded body: mock column headers + script rows, with the existing
 * per-server pagination (Settings.ActiveScriptsScriptPageSize) kept and restyled.
 *
 * Token mapping (Stage 1 derivation precedent):
 *   collapsed name / RAM label #9fb1c1 & #7d8fa1 → textSecondary
 *   column-header text #3d4d5e = textFaint (exact); inner divider #10161d →
 *   darken(borderDefault, 0.3) (same call as ScriptRow)
 */
import React, { useState } from "react";
import { darken, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import { IconButton } from "@mui/material";
import { FirstPage, KeyboardArrowLeft, KeyboardArrowRight, LastPage } from "@mui/icons-material";

import type { WorkerScript } from "../../Netscript/WorkerScript";
import type { BaseServer } from "../../Server/BaseServer";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { formatMoney, formatRam } from "../formatNumber";
import { classifyServer, RAM_SEGMENT_HEXES, totalMoneyRate } from "./networkRam";
import { SCRIPT_GRID_COLUMNS, ScriptRow } from "./ScriptRow";

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  group: {
    border: `1px solid ${theme.colors.borderDefault as string}`,
    borderRadius: "12px",
    overflow: "hidden",
    marginBottom: "12px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    backgroundColor: theme.colors.bgPanelDeep,
    padding: "11px 16px",
    cursor: "pointer",
    width: "100%",
    border: "none",
    textAlign: "left",
  },
  headerOpen: {
    borderBottom: `1px solid ${theme.colors.borderDefault as string}`,
  },
  chevron: {
    fontSize: typeScale.caption, // mock: 11px
    color: theme.colors.textTertiary,
    flex: "none",
    width: "12px",
  },
  name: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.cardTitle, // mock: 12.5px
    fontWeight: 600,
    maxWidth: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  nameOpen: {
    color: theme.colors.accentCyan,
  },
  nameClosed: {
    color: theme.colors.textSecondary,
  },
  barTrack: {
    width: "180px",
    height: "5px",
    borderRadius: "3px",
    backgroundColor: theme.colors.track,
    overflow: "hidden",
    flex: "none",
  },
  barFill: {
    height: "100%",
  },
  ramLabel: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.caption, // mock: 10.5px
    fontWeight: 500,
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
  },
  spacer: {
    flex: 1,
  },
  summary: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.caption, // mock: 10.5px
    fontWeight: 500,
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
  },
  summaryIncome: {
    color: theme.colors.accentGold,
  },
  columnHeaders: {
    display: "grid",
    gridTemplateColumns: SCRIPT_GRID_COLUMNS,
    alignItems: "center",
    padding: "8px 16px",
    borderBottom: `1px solid ${darken(theme.colors.borderDefault as string, 0.3)}`,
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.eyebrow, // mock: 9px
    fontWeight: 600,
    color: theme.colors.textFaint,
    letterSpacing: ".12em",
  },
  columnRight: {
    textAlign: "right",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "2px",
    padding: "4px 10px",
  },
  paginationLabel: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.caption, // mock: 10.5px
    fontWeight: 500,
    color: theme.colors.textTertiary,
    marginRight: "8px",
  },
  };
});

function groupFillColor(server: BaseServer, theme: Theme): string {
  const category = classifyServer(server);
  // Scripts only run with admin rights, so null should be unreachable — fall back to
  // the rooted step rather than crashing on an exotic server type.
  if (category === null || category === "rooted") return RAM_SEGMENT_HEXES.rooted;
  return category === "home" ? (theme.colors.accentCyan as string) : RAM_SEGMENT_HEXES[category];
}

interface ServerGroupProps {
  server: BaseServer;
  scripts: WorkerScript[];
  startOpen: boolean;
}

export function ServerGroup({ server, scripts, startOpen }: ServerGroupProps): React.ReactElement {
  const { classes, cx, theme } = useStyles();
  const [open, setOpen] = useState(startOpen);
  const [page, setPage] = useState(0);

  const ramFraction = server.maxRam > 0 ? Math.min(server.ramUsed / server.maxRam, 1) : 0;
  const incomeRate = totalMoneyRate(scripts.map((ws) => ws.scriptRef));

  // Existing per-server pagination mechanics, kept (load-bearing for 1000s of scripts).
  const scriptsPerPage = Settings.ActiveScriptsScriptPageSize;
  const lastPage = Math.max(Math.ceil(scripts.length / scriptsPerPage) - 1, 0);
  function changePage(n: number): void {
    if (!Number.isInteger(n) || n > lastPage || n < 0) return;
    setPage(n);
  }
  if (page > lastPage) changePage(lastPage);

  const firstScriptNumber = page * scriptsPerPage + 1;
  const lastScriptNumber = Math.min((page + 1) * scriptsPerPage, scripts.length);

  return (
    <div className={classes.group} data-server-group={server.hostname}>
      <button
        className={cx(classes.header, open && classes.headerOpen)}
        data-server-group-header
        onClick={() => setOpen((old) => !old)}
      >
        <span className={classes.chevron}>{open ? "⌄" : "›"}</span>
        <span className={cx(classes.name, open ? classes.nameOpen : classes.nameClosed)} title={server.hostname}>
          {server.hostname}
        </span>
        <span className={classes.barTrack}>
          <span
            className={classes.barFill}
            style={{ display: "block", width: `${ramFraction * 100}%`, backgroundColor: groupFillColor(server, theme) }}
          />
        </span>
        <span className={classes.ramLabel}>
          {formatRam(server.ramUsed)} / {formatRam(server.maxRam)}
        </span>
        <span className={classes.spacer} />
        <span className={classes.summary}>
          {scripts.length} {scripts.length === 1 ? "script" : "scripts"}
          {!open && incomeRate > 0 && (
            <>
              {" · "}
              <span className={classes.summaryIncome}>{formatMoney(incomeRate)}/s</span>
            </>
          )}
        </span>
      </button>
      {open && (
        <>
          <div className={classes.columnHeaders}>
            <span>SCRIPT</span>
            <span>ARGS</span>
            <span className={classes.columnRight}>THREADS</span>
            <span className={classes.columnRight}>RAM</span>
            <span className={classes.columnRight}>INCOME/S</span>
            <span className={classes.columnRight}>EXP/S</span>
            <span />
          </div>
          {scripts.slice(page * scriptsPerPage, page * scriptsPerPage + scriptsPerPage).map((ws) => (
            <ScriptRow key={ws.pid} workerScript={ws} />
          ))}
          {scripts.length > scriptsPerPage && (
            <div className={classes.pagination}>
              <span className={classes.paginationLabel}>
                {firstScriptNumber}-{lastScriptNumber} of {scripts.length}
              </span>
              <IconButton size="small" onClick={() => changePage(0)} disabled={page === 0}>
                <FirstPage fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => changePage(page - 1)} disabled={page === 0}>
                <KeyboardArrowLeft fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => changePage(page + 1)} disabled={page === lastPage}>
                <KeyboardArrowRight fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => changePage(lastPage)} disabled={page === lastPage}>
                <LastPage fontSize="small" />
              </IconButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
