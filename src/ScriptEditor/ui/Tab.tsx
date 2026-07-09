import React, { useEffect, useRef } from "react";
import { DraggableProvided } from "react-beautiful-dnd";

import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import SyncIcon from "@mui/icons-material/Sync";
import CloseIcon from "@mui/icons-material/Close";

import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { EditorEvents } from "../EditorData";
import { useRerender } from "../../ui/React/hooks";
import { getTabId } from "./utils";
import type { ContentFilePath } from "../../Paths/ContentFile";

interface IProps {
  provided: DraggableProvided;
  tabId: string;
  isActive: boolean;
  isExternal: boolean;

  isUnsaved: () => boolean;
  onClick: () => void;
  onClose: () => void;
  onUpdate: () => void;
}

const tabIconWidth = 25;
const tabHeight = 38;

export function Tab({ provided, tabId, isActive, isExternal, isUnsaved, onClick, onClose, onUpdate }: IProps) {
  const rerender = useRerender();
  /**
   * Restyle per design-notes-2C tab strip: active tab is lifted to the editor bg with a 2px cyan
   * top stripe and bright text; inactive tabs are transparent with dim text. External-server files
   * keep the warning color — that signal predates the redesign and is load-bearing (files on
   * non-home servers are lost on resets).
   */
  const colorProps = isActive
    ? {
        background: Settings.theme.bgApp,
        borderTop: `2px solid ${Settings.theme.accentCyan}`,
        color: isExternal ? Settings.theme.warning : Settings.theme.textPrimary,
      }
    : {
        background: "transparent",
        borderTop: "2px solid transparent",
        color: isExternal ? Settings.theme.warning : Settings.theme.textSecondary,
      };

  // Dirty marker per 2C mock: cyan ● dot (replaces the old "*" prefix).
  const dirtyDot = isUnsaved() ? (
    <span data-dirty-dot style={{ color: Settings.theme.accentCyan, fontSize: "9px", marginRight: 6 }}>
      ●
    </span>
  ) : null;

  const tabTitle = (
    <>
      {dirtyDot}
      {tabId}
    </>
  );

  let tooltipTitle;
  if (isExternal) {
    // Show a warning message if this file is on a non-home server.
    tooltipTitle = (
      <Typography component="span" color={Settings.theme.warning}>
        {tabTitle}
        <br />
        This file is on a non-home server. You will lose all files on non-home servers when they are deleted or
        recreated (install augmentations, soft reset, deleted by NS APIs, etc.).
      </Typography>
    );
  } else {
    tooltipTitle = tabTitle;
  }
  const iconButtonStyle = {
    maxWidth: tabIconWidth,
    minWidth: tabIconWidth,
    minHeight: tabHeight,
    maxHeight: tabHeight,
    ...colorProps,
    color: Settings.theme.textFaint,
  };

  const tabRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (tabRef.current && isActive) {
      tabRef.current?.scrollIntoView();
    }
  }, [isActive]);

  useEffect(
    () =>
      EditorEvents.subscribe((hostname: string, filePath: ContentFilePath) => {
        if (tabId !== getTabId(hostname, filePath)) {
          return;
        }
        rerender();
      }),
    [rerender, tabId],
  );

  return (
    <div
      ref={(element) => {
        tabRef.current = element;
        provided.innerRef(element);
      }}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        ...provided.draggableProps.style,
        flexShrink: 0,
        borderRight: `1px solid ${Settings.theme.borderDefault}`,
      }}
    >
      <Tooltip title={tooltipTitle}>
        <Button
          onClick={onClick}
          onMouseDown={(e) => {
            e.preventDefault();
            if (e.button === 1) {
              onClose();
            }
          }}
          style={{
            minHeight: tabHeight,
            overflow: "hidden",
            textTransform: "none",
            fontFamily: Settings.styles.monoFontFamily,
            fontSize: getTypeScale().body, // mock: 11.5px
            ...colorProps,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tabTitle}</span>
        </Button>
      </Tooltip>
      <Tooltip title="Overwrite editor content with saved file content">
        <Button onClick={onUpdate} style={iconButtonStyle}>
          <SyncIcon fontSize="small" />
        </Button>
      </Tooltip>
      <Button onClick={onClose} style={iconButtonStyle}>
        <CloseIcon fontSize="small" />
      </Button>
    </div>
  );
}
