/**
 * A single running script inside a server group (1F redesign of WorkerScriptAccordion).
 *
 * 7-column grid per design-notes-1F: name (mono) · args (muted) · threads · RAM ·
 * income/s (gold) · exp/s (cyan) · actions (logs ghost + kill red ghost). Clicking the
 * row toggles an inset detail panel that preserves everything the old accordion showed
 * (per-thread RAM, full args, online/offline time, totals and rates).
 *
 * Token mapping for mock hexes without a 1:1 token (Stage 1 derivation precedent):
 *   cell text #9fb1c1 → textSecondary (same call as WorldMap3A's slate labels)
 *   row divider #10161d → darken(borderDefault #1a232e, 0.3)
 *   kill-button border #4a2530 → alpha(accentRed #ee7272, 0.3) over the dark bg
 */
import React, { useState } from "react";
import { alpha, darken, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { killWorkerScriptByPid } from "../../Netscript/killWorkerScript";
import type { WorkerScript } from "../../Netscript/WorkerScript";
import { Settings } from "../../Settings/Settings";
import { convertTimeMsToTimeElapsedString } from "../../utils/StringHelperFunctions";
import { arrayToString } from "../../utils/helpers/ArrayHelpers";
import { formatExp, formatMoney, formatRam, formatThreads } from "../formatNumber";
import { dialogBoxCreate } from "../React/DialogBox";
import { LogBoxEvents } from "../React/LogBoxManager";

/** Mock grid: 1fr 200px 90px 90px 120px 110px 120px (minmax so long names ellipsize). */
export const SCRIPT_GRID_COLUMNS = "minmax(0, 1fr) 200px 90px 90px 120px 110px 120px";

const useStyles = makeStyles()((theme: Theme) => ({
  row: {
    display: "grid",
    gridTemplateColumns: SCRIPT_GRID_COLUMNS,
    alignItems: "center",
    padding: "10px 16px",
    borderBottom: `1px solid ${darken(theme.colors.borderDefault as string, 0.3)}`,
    cursor: "pointer",
    "&:hover": {
      backgroundColor: theme.colors.bgPanelDeep,
    },
  },
  name: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "12px",
    fontWeight: 500,
    color: theme.colors.textBody,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    paddingRight: "12px",
  },
  args: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "11px",
    color: theme.colors.textTertiary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    paddingRight: "12px",
  },
  numCell: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "11px",
    fontWeight: 500,
    color: theme.colors.textSecondary,
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  income: {
    fontWeight: 600,
    color: theme.colors.accentGold,
  },
  exp: {
    color: theme.colors.accentCyan,
  },
  na: {
    fontWeight: 400,
    color: theme.colors.textTertiary,
  },
  actions: {
    display: "flex",
    gap: "6px",
    justifyContent: "flex-end",
  },
  actionButton: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: "10px",
    fontWeight: 500,
    borderRadius: "6px",
    padding: "3px 9px",
    backgroundColor: "transparent",
    cursor: "pointer",
    transition: "border-color 120ms ease-out",
  },
  logsButton: {
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.colors.borderCard as string}`,
    "&:hover": {
      borderColor: theme.colors.borderFocus,
    },
  },
  killButton: {
    color: theme.colors.accentRed,
    border: `1px solid ${alpha(theme.colors.accentRed as string, 0.3)}`,
    "&:hover": {
      borderColor: alpha(theme.colors.accentRed as string, 0.55),
    },
  },
  // Inset detail panel (row expansion) — preserves the old accordion's detail view.
  detail: {
    display: "grid",
    gridTemplateColumns: "170px 1fr",
    rowGap: "5px",
    columnGap: "14px",
    padding: "10px 16px 12px 32px",
    borderBottom: `1px solid ${darken(theme.colors.borderDefault as string, 0.3)}`,
    backgroundColor: theme.colors.bgPanelDeep,
  },
  detailLabel: {
    fontFamily: Settings.styles.fontFamily,
    fontSize: "10.5px",
    color: theme.colors.textTertiary,
  },
  detailValue: {
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: "10.5px",
    color: theme.colors.textSecondary,
    overflowWrap: "anywhere",
  },
  detailMoney: {
    color: theme.colors.accentGold,
  },
  detailExp: {
    color: theme.colors.accentCyan,
  },
}));

interface ScriptRowProps {
  workerScript: WorkerScript;
}

export function ScriptRow({ workerScript }: ScriptRowProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const [open, setOpen] = useState(false);
  const scriptRef = workerScript.scriptRef;

  const moneyRate = scriptRef.onlineRunningTime > 0 ? scriptRef.onlineMoneyMade / scriptRef.onlineRunningTime : 0;
  const expRate = scriptRef.onlineRunningTime > 0 ? scriptRef.onlineExpGained / scriptRef.onlineRunningTime : 0;

  function logsClickHandler(event: React.MouseEvent): void {
    event.stopPropagation();
    LogBoxEvents.emit(scriptRef);
  }

  // Same behavior as the old accordion: no confirmation prompt existed; a "Killing
  // script" dialog is shown after a successful kill.
  function killClickHandler(event: React.MouseEvent): void {
    event.stopPropagation();
    if (killWorkerScriptByPid(scriptRef.pid)) dialogBoxCreate("Killing script");
  }

  return (
    <>
      <div className={classes.row} data-script-row onClick={() => setOpen((old) => !old)}>
        <span className={classes.name} title={workerScript.name}>
          {workerScript.name}
        </span>
        <span className={classes.args} data-script-args title={scriptRef.args.join(" ")}>
          {scriptRef.args.length > 0 ? scriptRef.args.join(" ") : "—"}
        </span>
        <span className={classes.numCell}>{formatThreads(scriptRef.threads)}</span>
        <span className={classes.numCell}>{formatRam(scriptRef.ramUsage * scriptRef.threads)}</span>
        <span className={cx(classes.numCell, moneyRate > 0 ? classes.income : classes.na)} data-script-income>
          {moneyRate > 0 ? formatMoney(moneyRate) : "—"}
        </span>
        <span className={cx(classes.numCell, expRate > 0 ? classes.exp : classes.na)} data-script-exp>
          {expRate > 0 ? formatExp(expRate) : "—"}
        </span>
        <span className={classes.actions}>
          <button className={cx(classes.actionButton, classes.logsButton)} data-script-logs onClick={logsClickHandler}>
            logs
          </button>
          <button className={cx(classes.actionButton, classes.killButton)} data-script-kill onClick={killClickHandler}>
            kill
          </button>
        </span>
      </div>
      {open && (
        <div className={classes.detail} data-script-detail>
          <span className={classes.detailLabel}>Threads</span>
          <span className={classes.detailValue}>
            {formatThreads(scriptRef.threads)} ({formatRam(scriptRef.ramUsage)} each)
          </span>
          <span className={classes.detailLabel}>Args</span>
          <span className={classes.detailValue}>{arrayToString(scriptRef.args)}</span>
          <span className={classes.detailLabel}>Online time</span>
          <span className={classes.detailValue}>
            {convertTimeMsToTimeElapsedString(scriptRef.onlineRunningTime * 1e3)}
          </span>
          <span className={classes.detailLabel}>Offline time</span>
          <span className={classes.detailValue}>
            {convertTimeMsToTimeElapsedString(scriptRef.offlineRunningTime * 1e3)}
          </span>
          <span className={classes.detailLabel}>Total online production</span>
          <span className={classes.detailValue}>
            <span className={classes.detailMoney}>{formatMoney(scriptRef.onlineMoneyMade)}</span> ·{" "}
            <span className={classes.detailExp}>{formatExp(scriptRef.onlineExpGained)} hacking exp</span>
          </span>
          <span className={classes.detailLabel}>Online production rate</span>
          <span className={classes.detailValue}>
            <span className={classes.detailMoney}>{formatMoney(moneyRate)}/s</span> ·{" "}
            <span className={classes.detailExp}>{formatExp(expRate)} hacking exp/s</span>
          </span>
          <span className={classes.detailLabel}>Total offline production</span>
          <span className={classes.detailValue}>
            <span className={classes.detailMoney}>{formatMoney(scriptRef.offlineMoneyMade)}</span> ·{" "}
            <span className={classes.detailExp}>{formatExp(scriptRef.offlineExpGained)} hacking exp</span>
          </span>
        </div>
      )}
    </>
  );
}
