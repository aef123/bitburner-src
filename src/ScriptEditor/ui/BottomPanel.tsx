/**
 * Bottom panel for the script editor (Task 12, 2C part 2) per design-notes-2C: 130px strip between
 * the editor and the status bar, with tabs.
 *
 * - Problems: markers for the ACTIVE model only, at Warning severity and up — the same scope as
 *   StatusBar2C's count, so the row count always equals the number the player clicked. Click →
 *   goto position in the editor.
 * - NS API: the DocumentationAutocomplete + docs link, relocated here FROM the activity-bar
 *   popover (moved entirely, not duplicated — the activity bar's ◈ button now opens this tab, so
 *   nothing is lost and the search gets a persistent home instead of a transient popover).
 * - Logs: scripts currently running on the active file's server (the simplest honest scope).
 *   Click opens the EXISTING floating log window via LogBoxEvents — embedding live tails in the
 *   panel is deferred (documented in the plan).
 *
 * The mock's fourth tab (Terminal) is part of the deferred embedded-terminal work — not rendered.
 * Monaco relayout on open/close is automatic: the editor is created with automaticLayout: true.
 */

import React, { useEffect, useState } from "react";
import * as monaco from "monaco-editor";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import Typography from "@mui/material/Typography";

import { Settings } from "../../Settings/Settings";
import { workerScripts } from "../../Netscript/WorkerScripts";
import { LogBoxEvents } from "../../ui/React/LogBoxManager";
import { useRerender } from "../../ui/React/hooks";
import { DocumentationAutocomplete } from "../../Documentation/ui/DocumentationAutocomplete";
import { openDocumentationPopUp } from "../../Documentation/root";
import { defaultNsApiPage, openDocExternally } from "../../ui/React/Documentation";
import { DocumentationLink } from "../../ui/React/DocumentationLink";
import { buildLogRows, buildProblemRows, type LogRow, type ProblemRow } from "./bottomPanelData";

type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;

export type BottomPanelTab = "problems" | "nsapi" | "logs";

const useStyles = makeStyles()((theme: Theme) => ({
  // Geometry per 2C notes: 130px, top hairline, bg #0b0f14 → bgPanelDeep (nearest token, same
  // call as the explorer panel).
  panel: {
    height: "130px",
    flex: "none",
    boxSizing: "border-box",
    borderTop: `1px solid ${theme.colors.borderDefault as string}`,
    backgroundColor: theme.colors.bgPanelDeep,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  tabStrip: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    padding: "6px 12px 0",
    flex: "none",
  },
  // Tabs per notes: 10.5px sans 500, 5px 12px; active cyan with a 2px bottom border.
  tab: {
    padding: "5px 12px",
    border: "none",
    borderBottom: "2px solid transparent",
    background: "none",
    cursor: "pointer",
    fontSize: "10.5px",
    fontWeight: 500,
    color: theme.colors.textSecondary,
  },
  tabActive: {
    color: theme.colors.accentCyan,
    borderBottomColor: theme.colors.accentCyan,
  },
  problemCountClean: {
    color: theme.colors.accentGreen,
  },
  problemCountDirty: {
    color: theme.colors.accentRed,
  },
  closeButton: {
    marginLeft: "auto",
    border: "none",
    background: "none",
    cursor: "pointer",
    color: theme.colors.textFaint,
    fontSize: "12px",
    padding: "2px 6px",
    "&:hover": {
      color: theme.colors.textSecondary,
    },
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "6px 16px 8px",
    fontSize: "10.5px",
    lineHeight: 1.8,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    color: theme.colors.textTertiary,
    fontSize: "10.5px",
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: "10px",
    width: "100%",
    border: "none",
    background: "none",
    textAlign: "left",
    cursor: "pointer",
    padding: "1px 4px",
    fontSize: "10.5px",
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    "&:hover": {
      backgroundColor: theme.colors.bgActive,
    },
  },
  severityError: {
    flexShrink: 0,
    color: theme.colors.accentRed,
    fontFamily: Settings.styles.monoFontFamily,
  },
  severityWarning: {
    flexShrink: 0,
    color: theme.colors.accentGold,
    fontFamily: Settings.styles.monoFontFamily,
  },
  problemMessage: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  position: {
    flexShrink: 0,
    marginLeft: "auto",
    fontFamily: Settings.styles.monoFontFamily,
    color: theme.colors.textFaint,
  },
  logPid: {
    flexShrink: 0,
    fontFamily: Settings.styles.monoFontFamily,
    color: theme.colors.textFaint,
  },
  logFilename: {
    flexShrink: 0,
    fontFamily: Settings.styles.monoFontFamily,
    color: theme.colors.textSecondary,
  },
  logArgs: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontFamily: Settings.styles.monoFontFamily,
    color: theme.colors.textTertiary,
  },
  nsApiRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    flexWrap: "wrap",
    paddingTop: "4px",
  },
  nsApiHint: {
    color: theme.colors.textTertiary,
    fontSize: "10.5px",
  },
}));

// ─── Presentational lists (exported for direct unit testing) ──────────────

export function ProblemsList({
  problems,
  onGoto,
}: {
  problems: ProblemRow[];
  onGoto: (line: number, column: number) => void;
}): React.ReactElement {
  const { classes } = useStyles();
  if (problems.length === 0) {
    return <div className={classes.emptyState}>✓ No problems in the active file.</div>;
  }
  return (
    <>
      {problems.map((problem, index) => (
        <button
          key={`${problem.line}:${problem.column}:${index}`}
          className={classes.row}
          data-problem-row={index}
          onClick={() => onGoto(problem.line, problem.column)}
        >
          <span className={problem.severity === "error" ? classes.severityError : classes.severityWarning}>
            {problem.severity === "error" ? "✕" : "⚠"}
          </span>
          <span className={classes.problemMessage}>{problem.message}</span>
          <span className={classes.position}>{`Ln ${problem.line}, Col ${problem.column}`}</span>
        </button>
      ))}
    </>
  );
}

export function LogsList<T extends LogRow>({
  rows,
  onOpen,
}: {
  rows: T[];
  onOpen: (row: T) => void;
}): React.ReactElement | null {
  const { classes } = useStyles();
  return (
    <>
      {rows.map((row) => (
        <button key={row.pid} className={classes.row} data-log-row={row.pid} onClick={() => onOpen(row)}>
          <span className={classes.logPid}>{row.pid}</span>
          <span className={classes.logFilename}>{row.filename}</span>
          <span className={classes.logArgs}>{row.args}</span>
        </button>
      ))}
    </>
  );
}

// ─── Problems hook (monaco-touching; guards editor === null for jsdom) ────

function useActiveModelProblems(editor: IStandaloneCodeEditor | null): ProblemRow[] {
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  // Same subscription pattern as StatusBar2C: recount on marker changes for the active model's
  // uri and on model swaps (tab clicks set a different model on the same editor instance).
  useEffect(() => {
    if (!editor) {
      return;
    }
    const rebuild = () => {
      const model = editor.getModel();
      if (!model || model.isDisposed()) {
        setProblems([]);
        return;
      }
      setProblems(buildProblemRows(monaco.editor.getModelMarkers({ resource: model.uri })));
    };
    rebuild();
    const markerSub = monaco.editor.onDidChangeMarkers((uris) => {
      const model = editor.getModel();
      if (model && !model.isDisposed() && uris.some((uri) => uri.toString() === model.uri.toString())) {
        rebuild();
      }
    });
    const modelSub = editor.onDidChangeModel(rebuild);
    return () => {
      markerSub.dispose();
      modelSub.dispose();
    };
  }, [editor]);

  return problems;
}

// ─── Panel ────────────────────────────────────────────────────────────────

interface BottomPanelProps {
  tab: BottomPanelTab;
  onTabChange: (tab: BottomPanelTab) => void;
  onClose: () => void;
  editor: IStandaloneCodeEditor | null;
  /** Identity of the active file; drives the Problems scope label and the Logs server filter. */
  currentScript: { path: string; hostname: string } | null;
  onGotoProblem: (line: number, column: number) => void;
}

export function BottomPanel({
  tab,
  onTabChange,
  onClose,
  editor,
  currentScript,
  onGotoProblem,
}: BottomPanelProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const problems = useActiveModelProblems(editor);
  const hostname = currentScript?.hostname ?? null;
  // Live-ish Logs list while the tab is visible (same cadence as Active Scripts); 0 disables the
  // interval on the other tabs.
  useRerender(tab === "logs" ? 400 : 0);
  const logRows = tab === "logs" ? buildLogRows(workerScripts.values(), hostname) : [];

  const tabButton = (id: BottomPanelTab, label: React.ReactNode): React.ReactElement => (
    <button
      key={id}
      className={cx(classes.tab, tab === id && classes.tabActive)}
      data-bottom-tab={id}
      data-bottom-tab-active={tab === id ? "true" : "false"}
      onClick={() => onTabChange(id)}
    >
      {label}
    </button>
  );

  return (
    <div className={classes.panel} data-bottom-panel>
      <div className={classes.tabStrip}>
        {tabButton(
          "problems",
          <>
            Problems{" "}
            <span className={problems.length === 0 ? classes.problemCountClean : classes.problemCountDirty}>
              {problems.length}
            </span>
          </>,
        )}
        {tabButton("nsapi", "NS API")}
        {tabButton("logs", <>Logs{hostname !== null ? ` · ${hostname}` : ""}</>)}
        <button className={classes.closeButton} data-bottom-close onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      <div className={classes.content}>
        {tab === "problems" && <ProblemsList problems={problems} onGoto={onGotoProblem} />}

        {tab === "nsapi" && (
          <div className={classes.nsApiRow}>
            {/* Same handler the old activity-bar popover (and the Toolbar before it) used:
                plain select opens the in-game popup, Ctrl-select opens the external docs site. */}
            <DocumentationAutocomplete
              onChange={(path, external) => {
                if (external) {
                  openDocExternally(path);
                  return;
                }
                openDocumentationPopUp(path);
              }}
              width={350}
            />
            <Typography className={classes.nsApiHint}>Ctrl+select opens in your browser</Typography>
            <Typography>
              <DocumentationLink page={defaultNsApiPage}>NS API documentation</DocumentationLink>
            </Typography>
          </div>
        )}

        {tab === "logs" &&
          (hostname === null ? (
            <div className={classes.emptyState}>No file open.</div>
          ) : logRows.length === 0 ? (
            <div className={classes.emptyState}>No scripts running on {hostname}.</div>
          ) : (
            <LogsList rows={logRows} onOpen={(row) => LogBoxEvents.emit(row.worker.scriptRef)} />
          ))}
      </div>
    </div>
  );
}
