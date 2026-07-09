/**
 * Explorer panel for the script editor (Task 11, 2C part 1) per design-notes-2C: 218px column with
 * FILES · <SERVER> (the active script's server, grouped by folder), OTHER SERVERS (honest
 * access-only filter, collapsed by default), a flex spacer, and the OUTLINE section at the bottom.
 *
 * Opening files goes through the Root's existing open-file machinery (the same code path onMount
 * uses for nano/vim-opened files) via the onOpenFile callback — no second open path is invented.
 */

import React, { useMemo, useState } from "react";
import type { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { GetAllServers, GetServer } from "../../Server/AllServers";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { hasTextExtension } from "../../Paths/TextFilePath";
import { openScripts } from "../EditorData";
import { isUnsavedFile } from "./utils";
import { buildFileTree, filterEditorAccessibleServers, type FileTreeFolder } from "./explorerTree";
import { OutlinePanel } from "./OutlinePanel";

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  // Panel geometry per 2C notes: 218px, right hairline #1a232e = borderDefault. Mock bg #0b0f14
  // has no token; bgPanelDeep (#0c1117) is the nearest (same call as the terminal panels).
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
  scrollArea: {
    overflowY: "auto",
    minHeight: 0,
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
  otherServersHeader: {
    margin: "14px 0 8px",
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    width: "100%",
    padding: "4px 14px",
    boxSizing: "border-box",
    background: "none",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.body, // mock: 11.5px
    color: theme.colors.textSecondary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    "&:hover": {
      backgroundColor: theme.colors.bgActive,
    },
  },
  // Active file per 2C notes: bg #152430 = bgActive, cyan text, inset 2px cyan bar.
  rowActive: {
    backgroundColor: theme.colors.bgActive,
    color: theme.colors.accentCyan,
    boxShadow: `inset 2px 0 0 ${theme.colors.accentCyan as string}`,
  },
  // Non-script files are dimmer per mock (notes.txt in #55677a = textTertiary).
  rowDim: {
    color: theme.colors.textTertiary,
  },
  // Decorative ● glyph: the px size sets the dot diameter, not readable text — stays off the scale.
  dirtyDot: {
    color: theme.colors.accentCyan,
    fontSize: "9px",
  },
  fileCount: {
    color: theme.colors.textFaint,
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    marginLeft: "auto",
  },
  chevron: {
    color: theme.colors.textFaint,
  },
  spacer: {
    flex: 1,
    minHeight: "10px",
  },
  };
});

interface ExplorerPanelProps {
  /** Identity + live code of the active file; the OpenScript object itself stays in the Root. */
  currentScript: { path: string; hostname: string; code: string } | null;
  onOpenFile: (hostname: string, path: string) => void;
  onReveal: (line: number) => void;
}

/** All content-file paths (scripts + text files) on a server. */
function serverFilePaths(hostname: string): string[] {
  const server = GetServer(hostname);
  if (!server) {
    return [];
  }
  return [...server.scripts.keys(), ...server.textFiles.keys()];
}

/** Whether an open, edited-but-unsaved copy of this file exists (drives the dirty dot). */
function isFileDirty(hostname: string, path: string): boolean {
  const index = openScripts.findIndex((script) => script.hostname === hostname && script.path === path);
  return index !== -1 && isUnsavedFile(openScripts, index);
}

function baseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

export function ExplorerPanel({ currentScript, onOpenFile, onReveal }: ExplorerPanelProps): React.ReactElement {
  const { classes, cx } = useStyles();
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  const hostname = currentScript?.hostname ?? Player.getCurrentServer().hostname;
  // Memo keyed on the actual path list (not just the hostname): scripts can create/delete files
  // while the editor is open (ns.write etc.), and re-renders are frequent (every keystroke via the
  // Root's rerender). Paths can't contain "\n" so the joined key is collision-free.
  const treeKey = serverFilePaths(hostname).join("\n");
  const tree = useMemo(() => buildFileTree(treeKey === "" ? [] : treeKey.split("\n")), [treeKey]);

  // OTHER SERVERS: honest filter — purchased/backdoored/admin only (see explorerTree.ts for the
  // rule + precedent citation). Servers without content files are omitted: nothing to expand.
  const otherServers = filterEditorAccessibleServers(GetAllServers(), hostname).filter(
    (server) => server.scripts.size + server.textFiles.size > 0,
  );

  const toggleFolder = (fullPath: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  };

  const toggleServer = (host: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(host)) next.delete(host);
      else next.add(host);
      return next;
    });
  };

  const renderFile = (host: string, path: string, depth: number): React.ReactElement => {
    const isActive = currentScript !== null && currentScript.hostname === host && currentScript.path === path;
    const dirty = isFileDirty(host, path);
    return (
      <button
        key={`${host}:/${path}`}
        className={cx(
          classes.row,
          isActive && classes.rowActive,
          !isActive && hasTextExtension(path) && classes.rowDim,
        )}
        style={{ paddingLeft: 14 + depth * 14 }}
        data-explorer-file={`${host}:/${path}`}
        {...(isActive ? { "data-explorer-active": true } : {})}
        onClick={() => onOpenFile(host, path)}
      >
        <span>{baseName(path)}</span>
        {dirty && (
          <span className={classes.dirtyDot} data-dirty-dot>
            ●
          </span>
        )}
      </button>
    );
  };

  const renderFolder = (host: string, folder: FileTreeFolder, depth: number): React.ReactElement => {
    const collapsed = collapsedFolders.has(`${host}:/${folder.fullPath}`);
    return (
      <React.Fragment key={`${host}:/${folder.fullPath}`}>
        <button
          className={classes.row}
          style={{ paddingLeft: 14 + depth * 14 }}
          data-explorer-folder={folder.fullPath}
          onClick={() => toggleFolder(`${host}:/${folder.fullPath}`)}
        >
          <span className={classes.chevron}>{collapsed ? "›" : "⌄"}</span>
          <span>{folder.name}</span>
        </button>
        {!collapsed && folder.folders.map((sub) => renderFolder(host, sub, depth + 1))}
        {!collapsed && folder.files.map((file) => renderFile(host, file, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className={classes.panel} data-explorer-panel>
      <div className={classes.scrollArea}>
        <div className={classes.sectionHeader}>FILES · {hostname.toUpperCase()}</div>
        {tree.folders.map((folder) => renderFolder(hostname, folder, 0))}
        {tree.files.map((file) => renderFile(hostname, file, 0))}

        <div className={cx(classes.sectionHeader, classes.otherServersHeader)}>OTHER SERVERS</div>
        {otherServers.map((server) => {
          const expanded = expandedServers.has(server.hostname);
          const count = server.scripts.size + server.textFiles.size;
          return (
            <React.Fragment key={server.hostname}>
              <button
                className={classes.row}
                data-explorer-server={server.hostname}
                onClick={() => toggleServer(server.hostname)}
              >
                <span className={classes.chevron}>{expanded ? "⌄" : "›"}</span>
                <span>{server.hostname}</span>
                <span className={classes.fileCount}>
                  {count} file{count === 1 ? "" : "s"}
                </span>
              </button>
              {expanded &&
                [...server.scripts.keys(), ...server.textFiles.keys()]
                  .sort((a, b) => String(a).localeCompare(String(b)))
                  .map((path) => renderFile(server.hostname, String(path), 1))}
            </React.Fragment>
          );
        })}
      </div>

      <div className={classes.spacer} />

      <OutlinePanel
        fileName={currentScript ? baseName(currentScript.path) : null}
        code={currentScript?.code ?? ""}
        onReveal={onReveal}
      />
    </div>
  );
}
