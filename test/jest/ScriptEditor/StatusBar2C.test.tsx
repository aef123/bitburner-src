/**
 * Render tests for the new script-editor status bar (Task 11, 2C part 1).
 *
 * Monaco does not run in jsdom (it is NullMock'd in jest.config.js), so these tests exercise the
 * editor-less seams: segments render from plain props + ScriptEditorContext defaults, the RAM
 * segment opens the breakdown modal, and the vim segment hosts whatever element useVimEditor
 * produced. Cursor/marker listeners only attach when a real editor instance exists.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../src/Settings/Settings";
import { ScriptEditorContextProvider } from "../../../src/ScriptEditor/ui/ScriptEditorContext";
import { StatusBar2C } from "../../../src/ScriptEditor/ui/StatusBar2C";
import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
});

interface RenderOptions {
  path?: string;
  hostname?: string;
  vimStatus?: React.ReactElement | null;
  onRun?: () => void;
  onSave?: () => void;
  onBeautify?: () => void;
  onOpenRAMModal?: () => void;
}

function renderBar(options: RenderOptions = {}): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <ScriptEditorContextProvider>
          <StatusBar2C
            currentScript={{ path: options.path ?? "bootstrap.js", hostname: options.hostname ?? "home" }}
            editor={null}
            vimStatus={options.vimStatus ?? null}
            onRun={options.onRun ?? (() => {})}
            onSave={options.onSave ?? (() => {})}
            onBeautify={options.onBeautify ?? (() => {})}
            onOpenRAMModal={options.onOpenRAMModal ?? (() => {})}
          />
        </ScriptEditorContextProvider>
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

describe("StatusBar2C segments", () => {
  it("shows file name and language", () => {
    const root = renderBar();
    const fileSegment = root.querySelector("[data-status-file]");
    expect(fileSegment?.textContent).toContain("bootstrap.js");
    expect(fileSegment?.textContent).toContain("JavaScript");
  });

  it("shows the problems segment with the clean state by default (no markers without an editor)", () => {
    const root = renderBar();
    expect(root.querySelector("[data-status-problems]")?.textContent).toContain("no problems");
  });

  it("shows cursor position (defaults to Ln 1, Col 1 without an editor)", () => {
    const root = renderBar();
    expect(root.querySelector("[data-status-cursor]")?.textContent).toBe("Ln 1, Col 1");
  });

  it("shows the Run button targeting the script's server", () => {
    const onRun = jest.fn();
    const root = renderBar({ onRun });
    const run = root.querySelector<HTMLButtonElement>("[data-status-run]");
    expect(run?.textContent).toContain("home");
    act(() => {
      run?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRun).toHaveBeenCalled();
  });

  it("disables Run for text files (existing behavior: only scripts can run)", () => {
    const root = renderBar({ path: "notes.txt" });
    expect(root.querySelector<HTMLButtonElement>("[data-status-run]")?.disabled).toBe(true);
  });

  it("opens the RAM breakdown when the RAM segment is clicked (capability moved from Toolbar)", () => {
    const onOpenRAMModal = jest.fn();
    const root = renderBar({ onOpenRAMModal });
    const ram = root.querySelector("[data-status-ram]");
    expect(ram).not.toBeNull();
    act(() => {
      ram?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenRAMModal).toHaveBeenCalled();
  });

  it("shows no fits/exceeds clause while the RAM cost is unknown", () => {
    const root = renderBar();
    expect(root.textContent).not.toContain("fits");
    expect(root.textContent).not.toContain("exceeds");
  });

  it("hosts the vim status element inside the bar", () => {
    const root = renderBar({ vimStatus: <span data-vim-probe>--NORMAL--</span> });
    expect(root.querySelector("[data-status-vim] [data-vim-probe]")?.textContent).toBe("--NORMAL--");
  });

  it("keeps Save and Beautify reachable (capabilities moved from Toolbar)", () => {
    const onSave = jest.fn();
    const onBeautify = jest.fn();
    const root = renderBar({ onSave, onBeautify });
    act(() => {
      root.querySelector("[data-status-save]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      root.querySelector("[data-status-beautify]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSave).toHaveBeenCalled();
    expect(onBeautify).toHaveBeenCalled();
  });
});
