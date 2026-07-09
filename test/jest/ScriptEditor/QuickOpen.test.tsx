/**
 * Render tests for the script-editor quick-open overlay (Task 12, 2C part 2).
 *
 * Covers: file list from the honest multi-server set, ranking as you type, Enter/click opening
 * through the Root's open-file machinery (callback payload), and Escape closing. The honest-filter
 * data logic itself is unit-tested in editorSearch.test.ts; here we assert it end-to-end against
 * real test servers.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../src/Settings/Settings";
import { GetServerOrThrow } from "../../../src/Server/AllServers";
import type { ScriptFilePath } from "../../../src/Paths/ScriptFilePath";
import { QuickOpen } from "../../../src/ScriptEditor/ui/QuickOpen";
import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

// jsdom does not implement scrollIntoView — stub it so the scroll-into-view effect doesn't throw.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  initGameEnvironment();
});

let container: HTMLDivElement | null = null;

beforeEach(() => {
  setupBasicTestingEnvironment();
  const home = GetServerOrThrow("home");
  home.writeToScriptFile("batcher.js" as ScriptFilePath, "// batcher");
  home.writeToScriptFile("shared/logger.js" as ScriptFilePath, "// logger");
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
  onOpenFile?: (hostname: string, path: string) => void;
  onClose?: () => void;
}

function renderOverlay(options: RenderOptions = {}): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <QuickOpen
          open={true}
          currentHostname="home"
          onOpenFile={options.onOpenFile ?? (() => {})}
          onClose={options.onClose ?? (() => {})}
        />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function getInput(root: HTMLElement): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>("[data-quick-open-input]");
  if (!input) throw new Error("No quick-open input");
  return input;
}

function typeQuery(root: HTMLElement, value: string): void {
  const input = getInput(root);
  act(() => {
    input.value = value;
    Simulate.change(input);
  });
}

describe("QuickOpen", () => {
  it("lists files from accessible servers with a server badge, and excludes inaccessible ones", () => {
    const noodles = GetServerOrThrow("n00dles");
    noodles.hasAdminRights = false;
    noodles.writeToScriptFile("secret.js" as ScriptFilePath, "// hidden");
    const root = renderOverlay();
    expect(root.textContent).toContain("batcher.js");
    expect(root.textContent).toContain("shared/logger.js");
    // The honesty assertion, end to end: no file access → the file never appears.
    expect(root.textContent).not.toContain("secret.js");
  });

  it("ranks as you type and opens the selection on Enter", () => {
    const onOpenFile = jest.fn();
    const onClose = jest.fn();
    const root = renderOverlay({ onOpenFile, onClose });
    typeQuery(root, "logger");
    act(() => {
      Simulate.keyDown(getInput(root), { key: "Enter" });
    });
    expect(onOpenFile).toHaveBeenCalledWith("home", "shared/logger.js");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens a result on click", () => {
    const onOpenFile = jest.fn();
    const root = renderOverlay({ onOpenFile });
    const row = root.querySelector("[data-quick-open-result='home:/batcher.js']");
    expect(row).not.toBeNull();
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenFile).toHaveBeenCalledWith("home", "batcher.js");
  });

  it("closes on Escape", () => {
    const onClose = jest.fn();
    const root = renderOverlay({ onClose });
    act(() => {
      Simulate.keyDown(getInput(root), { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalled();
  });
});
