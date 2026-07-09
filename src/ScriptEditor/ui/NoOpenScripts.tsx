/**
 * Editor pane placeholder shown when no file is open (W4: explorer always visible).
 * Rendered INSTEAD of the <Editor> surface so Monaco is not mounted without a model.
 * When the first file opens the Root re-renders, this component unmounts, and the
 * real <Editor> mounts and receives onMount normally.
 */
import React from "react";

import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";

export function NoOpenScripts() {
  const typeScale = getTypeScale();
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: "8px",
        userSelect: "none",
      }}
      data-no-open-scripts
    >
      <span
        style={{
          fontFamily: Settings.styles.monoFontFamily,
          fontSize: "32px",
          color: Settings.theme.textTertiary,
          lineHeight: 1,
        }}
      >
        &#x1F4C4;
      </span>
      <span
        style={{
          fontFamily: Settings.styles.monoFontFamily,
          fontSize: typeScale.body,
          color: Settings.theme.textTertiary,
          fontWeight: 500,
        }}
      >
        No file open
      </span>
      <span
        style={{
          fontFamily: Settings.styles.monoFontFamily,
          fontSize: typeScale.caption,
          color: Settings.theme.textFaint,
          fontWeight: 500,
        }}
      >
        Select a file in the explorer&nbsp;&nbsp;·&nbsp;&nbsp;Ctrl+P to search
      </span>
    </div>
  );
}
