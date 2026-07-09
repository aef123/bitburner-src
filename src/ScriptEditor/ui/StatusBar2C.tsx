/**
 * Script-editor status bar (Task 11, 2C part 1) per design-notes-2C: 28px bar, left cluster =
 * problems / RAM (click → breakdown modal) / file · language, middle = vim status segment, right
 * cluster = Ln/Col, indent, Beautify, Save (both relocated from the removed Toolbar) and the
 * mock's "Run ▸ server" button (wired to the Root's existing run action).
 *
 * Monaco-touching code (cursor + marker listeners) is guarded behind `editor !== null` so the
 * component renders in jsdom where monaco is NullMock'd.
 */

import React, { useEffect, useState } from "react";
import * as monaco from "monaco-editor";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import Tooltip from "@mui/material/Tooltip";

import { GetServer } from "../../Server/AllServers";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { hasScriptExtension } from "../../Paths/ScriptFilePath";
import { CurrentKeyBindings, parseKeyCombinationsToString, ScriptEditorAction } from "../../utils/KeyBindingUtils";
import { useScriptEditorContext } from "./ScriptEditorContext";
import { describeRamFit, languageLabel } from "./statusBarUtils";

type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;

const useStyles = makeStyles()((theme: Theme) => ({
  // Bar geometry per 2C notes: height 28, bg #0c1016 = bgRail, top hairline #1a232e = borderDefault.
  bar: {
    height: "28px",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: "18px",
    padding: "0 14px",
    boxSizing: "border-box",
    backgroundColor: theme.colors.bgRail,
    borderTop: `1px solid ${theme.colors.borderDefault as string}`,
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: getTypeScale().caption, // mock: 10px (every segment inherits this)
    fontWeight: 500,
    color: theme.colors.textTertiary,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  // The problems segment is a button since Task 12: clicking it toggles the bottom panel's
  // Problems tab (whose row scope matches this count exactly — active model, Warning+).
  problemsSegment: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
  },
  problemsClean: {
    color: theme.colors.accentGreen,
  },
  problemsDirty: {
    color: theme.colors.accentRed,
  },
  // RAM value gold per mock; the whole segment is clickable (breakdown modal moved from Toolbar).
  ramSegment: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    color: theme.colors.accentGold,
  },
  ramExceeds: {
    color: theme.colors.accentRed,
  },
  ramUpdating: {
    color: theme.colors.textSecondary,
  },
  // "— fits home (128 GB)" context clause: #55677a = textTertiary per mock.
  ramClause: {
    color: theme.colors.textTertiary,
  },
  vimSegment: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
    overflow: "hidden",
  },
  ghostButton: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    color: theme.colors.textTertiary,
    "&:hover:enabled": {
      color: theme.colors.textSecondary,
    },
  },
  runButton: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    color: theme.colors.accentCyan,
    "&:disabled": {
      cursor: "default",
      opacity: 0.4,
    },
  },
}));

interface StatusBar2CProps {
  /** Identity of the active file; the OpenScript itself stays in the Root. */
  currentScript: { path: string; hostname: string } | null;
  editor: IStandaloneCodeEditor | null;
  /** The element produced by useVimEditor's StatusBar (null when vim mode is off). */
  vimStatus: React.ReactElement | null;
  onRun: () => void;
  onSave: () => void;
  onBeautify: () => void;
  onOpenRAMModal: () => void;
  /** Toggles the bottom panel's Problems tab (Task 12). */
  onProblemsClick: () => void;
}

export function StatusBar2C({
  currentScript,
  editor,
  vimStatus,
  onRun,
  onSave,
  onBeautify,
  onOpenRAMModal,
  onProblemsClick,
}: StatusBar2CProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const { ram, ramUsage, isUpdatingRAM, options } = useScriptEditorContext();
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [problems, setProblems] = useState(0);

  // Cursor position — live listener on the mounted editor (survives model swaps on tab clicks).
  useEffect(() => {
    if (!editor) {
      return;
    }
    const position = editor.getPosition();
    if (position) {
      setCursor({ line: position.lineNumber, column: position.column });
    }
    const disposable = editor.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column });
    });
    return () => disposable.dispose();
  }, [editor]);

  // Problems count for the ACTIVE model only: recount on marker changes for its uri and on model
  // swaps (tab click / close set a different model on the same editor instance).
  useEffect(() => {
    if (!editor) {
      return;
    }
    const recount = () => {
      const model = editor.getModel();
      if (!model || model.isDisposed()) {
        setProblems(0);
        return;
      }
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      setProblems(markers.filter((marker) => marker.severity >= monaco.MarkerSeverity.Warning).length);
    };
    recount();
    const markerSub = monaco.editor.onDidChangeMarkers((uris) => {
      const model = editor.getModel();
      if (model && !model.isDisposed() && uris.some((uri) => uri.toString() === model.uri.toString())) {
        recount();
      }
    });
    const modelSub = editor.onDidChangeModel(recount);
    return () => {
      markerSub.dispose();
      modelSub.dispose();
    };
  }, [editor]);

  const server = currentScript ? GetServer(currentScript.hostname) : null;
  const ramFit = describeRamFit(ramUsage, server?.hostname ?? null, server?.maxRam ?? null);
  const isScript = currentScript !== null && hasScriptExtension(currentScript.path);
  const indentLabel = `${options.insertSpaces ? "Spaces" : "Tab Size"}: ${options.tabSize}`;

  return (
    <div className={classes.bar} data-status-bar>
      <button
        className={cx(classes.problemsSegment, problems === 0 ? classes.problemsClean : classes.problemsDirty)}
        data-status-problems
        title="Problems reported by the editor for the active file — click to open the Problems panel"
        onClick={onProblemsClick}
      >
        {problems === 0 ? "✓ no problems" : `✕ ${problems} problem${problems === 1 ? "" : "s"}`}
      </button>
      <Tooltip title="Static RAM cost — click for the per-function breakdown">
        <button
          className={cx(
            classes.ramSegment,
            ramFit.fits === false && classes.ramExceeds,
            isUpdatingRAM && classes.ramUpdating,
          )}
          data-status-ram
          onClick={onOpenRAMModal}
        >
          <span>{ram}</span>
          {ramFit.clause !== "" && <span className={classes.ramClause}>{ramFit.clause}</span>}
        </button>
      </Tooltip>
      {currentScript !== null && (
        <span data-status-file>
          {currentScript.path} · {languageLabel(currentScript.path)}
        </span>
      )}
      <div className={classes.vimSegment} data-status-vim>
        {vimStatus}
      </div>
      <span data-status-cursor>{`Ln ${cursor.line}, Col ${cursor.column}`}</span>
      <span data-status-indent>{indentLabel}</span>
      <button className={classes.ghostButton} data-status-beautify onClick={onBeautify}>
        Beautify
      </button>
      <Tooltip title={parseKeyCombinationsToString(CurrentKeyBindings[ScriptEditorAction.Save])}>
        <button className={classes.ghostButton} data-status-save onClick={onSave}>
          Save
        </button>
      </Tooltip>
      <Tooltip title={parseKeyCombinationsToString(CurrentKeyBindings[ScriptEditorAction.Run])}>
        {/* span keeps the tooltip working while the button is disabled for text files */}
        <span>
          <button className={classes.runButton} data-status-run disabled={!isScript} onClick={onRun}>
            Run ▸ {currentScript?.hostname ?? ""}
          </button>
        </span>
      </Tooltip>
    </div>
  );
}
