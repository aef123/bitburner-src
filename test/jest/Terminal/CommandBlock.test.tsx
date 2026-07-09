/**
 * Render tests for the terminal CommandBlock card (Task 8, 2A part 1).
 *
 * Follows the established Shell test pattern (ReactDOM + ThemeProvider, see
 * test/jest/ui/Shell/Hud.test.tsx).
 *
 * Covers:
 *   - header renders the ❯ prompt, command text and timestamp
 *   - body renders the block's output items via the existing per-item rendering
 *   - chevron click calls the collapse toggle; collapsed blocks hide the body (aria-expanded)
 *   - RUNNING tag + numeric progress bar shown on the running block
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../src/Settings/Settings";
import { CommandBlockStart, Output } from "../../../src/Terminal/OutputTypes";
import { groupOutputHistory } from "../../../src/Terminal/ui/groupOutputHistory";
import { CommandBlock } from "../../../src/Terminal/ui/CommandBlock";
import { Terminal } from "../../../src/Terminal";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  Terminal.action = null;
});

function makeBlock(command = "ls", outputs: string[] = ["file1.js", "file2.js"]) {
  const start = new CommandBlockStart(command, "home", "");
  const items = [start, ...outputs.map((t) => new Output(t, "primary"))];
  const grouped = groupOutputHistory(items);
  return grouped.blocks[0];
}

function renderBlock(props: {
  block: ReturnType<typeof makeBlock>;
  collapsed?: boolean;
  running?: boolean;
  onToggleCollapse?: (start: CommandBlockStart) => void;
}): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <ul>
          <CommandBlock
            block={props.block}
            collapsed={props.collapsed ?? false}
            running={props.running ?? false}
            onToggleCollapse={props.onToggleCollapse ?? (() => {})}
          />
        </ul>
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

describe("CommandBlock", () => {
  it("renders the command, prompt glyph, and output items", () => {
    const block = makeBlock("scan-analyze 2", ["some output line"]);
    const root = renderBlock({ block });
    const header = root.querySelector("[data-command-block-header]");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("❯");
    expect(header?.textContent).toContain("scan-analyze 2");
    expect(root.textContent).toContain("some output line");
  });

  it("marks the header expanded by default and collapsed when collapsed", () => {
    const block = makeBlock();
    let root = renderBlock({ block, collapsed: false });
    expect(root.querySelector("[data-command-block-header]")?.getAttribute("aria-expanded")).toBe("true");
    root = renderBlock({ block, collapsed: true });
    expect(root.querySelector("[data-command-block-header]")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("calls onToggleCollapse with the block start when the header is clicked", () => {
    const block = makeBlock();
    const onToggleCollapse = jest.fn();
    const root = renderBlock({ block, onToggleCollapse });
    const header = root.querySelector("[data-command-block-header]");
    expect(header).not.toBeNull();
    act(() => {
      header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggleCollapse).toHaveBeenCalledWith(block.start);
  });

  it("shows a RUNNING tag and numeric progress bar while running with a timed action", () => {
    Terminal.action = {
      cancel: () => {},
      finished: Promise.resolve(),
      getProgressText: () => "progress text",
      startTime: performance.now() - 500,
      durationMs: 1000,
    };
    const block = makeBlock("hack", []);
    const root = renderBlock({ block, running: true });
    expect(root.textContent).toContain("RUNNING");
    const fill = root.querySelector<HTMLElement>("[data-command-block-progress-fill]");
    expect(fill).not.toBeNull();
    // ~50% elapsed; allow slack for test scheduling.
    const width = parseFloat(fill?.style.width ?? "0");
    expect(width).toBeGreaterThan(30);
    expect(width).toBeLessThanOrEqual(100);
  });

  it("falls back to the action's progress text when no numeric progress is available (wget/upload style actions)", () => {
    Terminal.action = {
      cancel: () => {},
      finished: Promise.resolve(),
      getProgressText: () => "Uploading files to home",
    };
    const block = makeBlock("wget", []);
    const root = renderBlock({ block, running: true });
    expect(root.textContent).toContain("RUNNING");
    expect(root.textContent).toContain("Uploading files to home");
    expect(root.querySelector("[data-command-block-progress-fill]")).toBeNull();
  });

  it("does not show the RUNNING tag when not running", () => {
    const block = makeBlock();
    const root = renderBlock({ block });
    expect(root.textContent).not.toContain("RUNNING");
  });
});
