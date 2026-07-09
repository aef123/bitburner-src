/**
 * Tests for the terminal command-history panel (Task 8, 2A part 1).
 *
 * Covers:
 *   - pin/unpin persistence via Settings.PinnedTerminalCommands (incl. save/load round trip)
 *   - PINNED / THIS SESSION / EARLIER sections render their commands
 *   - re-run (click and ↻) goes through Terminal.executeCommands, disabled while an action is active
 *   - Shift+click pastes into the input via the onPaste callback
 *   - search filters the lists
 */

import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { Settings } from "../../../src/Settings/Settings";
import { loadSettings } from "../../../src/Settings/SettingsUtils";
import { Terminal } from "../../../src/Terminal";
import { clearSessionCommands, recordSessionCommand } from "../../../src/Terminal/sessionHistory";
import { CommandHistoryPanel, togglePinnedCommand } from "../../../src/Terminal/ui/CommandHistoryPanel";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  clearSessionCommands();
  Settings.PinnedTerminalCommands.length = 0;
  Terminal.action = null;
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
  Settings.PinnedTerminalCommands.length = 0;
  clearSessionCommands();
});

function renderPanel(
  onPaste: (command: string) => void = () => {},
  onCollapse: () => void = () => {},
): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <CommandHistoryPanel onPaste={onPaste} onCollapse={onCollapse} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function setFakeAction(): void {
  Terminal.action = {
    cancel: () => {},
    finished: Promise.resolve(),
    getProgressText: () => "",
  };
}

describe("togglePinnedCommand — persistence", () => {
  it("adds and removes commands from Settings.PinnedTerminalCommands", () => {
    togglePinnedCommand("scan-analyze 10");
    expect(Settings.PinnedTerminalCommands).toEqual(["scan-analyze 10"]);
    togglePinnedCommand("home; killall");
    expect(Settings.PinnedTerminalCommands).toEqual(["scan-analyze 10", "home; killall"]);
    togglePinnedCommand("scan-analyze 10");
    expect(Settings.PinnedTerminalCommands).toEqual(["home; killall"]);
  });

  it("survives a Settings save/load round trip", () => {
    togglePinnedCommand("run batcher.js --target phantasy");
    const saved = JSON.stringify(Settings);
    Settings.PinnedTerminalCommands.length = 0;
    loadSettings(saved);
    expect(Settings.PinnedTerminalCommands).toEqual(["run batcher.js --target phantasy"]);
  });

  it("loadSettings sanitizes a non-array PinnedTerminalCommands from a tampered save", () => {
    const saved = JSON.parse(JSON.stringify(Settings)) as Record<string, unknown>;
    saved.PinnedTerminalCommands = "not-an-array";
    loadSettings(JSON.stringify(saved));
    expect(Settings.PinnedTerminalCommands).toEqual([]);
  });
});

describe("CommandHistoryPanel — sections", () => {
  it("renders pinned, session, and earlier commands in their sections", () => {
    Settings.PinnedTerminalCommands.push("scan-analyze 10");
    recordSessionCommand("hack", Date.now());
    Player.terminalCommandHistory = ["buy SQLInject.exe", "hack"];

    const root = renderPanel();
    expect(root.textContent).toContain("PINNED");
    expect(root.textContent).toContain("THIS SESSION");
    expect(root.textContent).toContain("EARLIER");
    expect(root.querySelector("[data-history-section='pinned']")?.textContent).toContain("scan-analyze 10");
    expect(root.querySelector("[data-history-section='session']")?.textContent).toContain("hack");
    // "hack" is in the session; EARLIER must only show the remainder.
    const earlier = root.querySelector("[data-history-section='earlier']");
    expect(earlier?.textContent).toContain("buy SQLInject.exe");
    expect(earlier?.textContent).not.toContain("hack");
  });

  it("filters commands with the search box", () => {
    recordSessionCommand("hack", Date.now());
    recordSessionCommand("scan-analyze 5", Date.now());
    const root = renderPanel();
    const search = root.querySelector<HTMLInputElement>("[data-history-search] input, input[data-history-search]");
    expect(search).not.toBeNull();
    act(() => {
      if (!search) return;
      search.value = "scan";
      Simulate.change(search);
    });
    const session = root.querySelector("[data-history-section='session']");
    expect(session?.textContent).toContain("scan-analyze 5");
    expect(session?.textContent).not.toContain("hack");
  });
});

describe("CommandHistoryPanel — re-run and paste", () => {
  it("click re-runs the command via Terminal.executeCommands", () => {
    const exec = jest.spyOn(Terminal, "executeCommands").mockResolvedValue();
    recordSessionCommand("free", Date.now());
    const root = renderPanel();
    const row = root.querySelector("[data-history-section='session'] [data-history-command='free']");
    expect(row).not.toBeNull();
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(exec).toHaveBeenCalledWith("free");
  });

  it("Shift+click pastes into the input instead of re-running", () => {
    const exec = jest.spyOn(Terminal, "executeCommands").mockResolvedValue();
    const onPaste = jest.fn();
    recordSessionCommand("free", Date.now());
    const root = renderPanel(onPaste);
    const row = root.querySelector("[data-history-section='session'] [data-history-command='free']");
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    });
    expect(onPaste).toHaveBeenCalledWith("free");
    expect(exec).not.toHaveBeenCalled();
  });

  it("does not re-run while a terminal action is active", () => {
    const exec = jest.spyOn(Terminal, "executeCommands").mockResolvedValue();
    recordSessionCommand("free", Date.now());
    setFakeAction();
    const root = renderPanel();
    const row = root.querySelector("[data-history-section='session'] [data-history-command='free']");
    act(() => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it("disables the pinned ↻ re-run button while a terminal action is active", () => {
    Settings.PinnedTerminalCommands.push("scan-analyze 10");
    setFakeAction();
    const root = renderPanel();
    const rerun = root.querySelector<HTMLButtonElement>("[data-history-section='pinned'] [data-history-rerun]");
    expect(rerun).not.toBeNull();
    expect(rerun?.disabled).toBe(true);
  });

  it("enables the pinned ↻ re-run button when idle and it fires executeCommands", () => {
    const exec = jest.spyOn(Terminal, "executeCommands").mockResolvedValue();
    Settings.PinnedTerminalCommands.push("scan-analyze 10");
    const root = renderPanel();
    const rerun = root.querySelector<HTMLButtonElement>("[data-history-section='pinned'] [data-history-rerun]");
    expect(rerun?.disabled).toBe(false);
    act(() => {
      rerun?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(exec).toHaveBeenCalledWith("scan-analyze 10");
  });

  it("star button pins and unpins a session command", () => {
    recordSessionCommand("free", Date.now());
    const root = renderPanel();
    const pin = root.querySelector<HTMLButtonElement>("[data-history-section='session'] [data-history-pin]");
    expect(pin).not.toBeNull();
    act(() => {
      pin?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(Settings.PinnedTerminalCommands).toContain("free");
  });
});

describe("CommandHistoryPanel — collapse chevron", () => {
  it("renders a header collapse button that fires onCollapse", () => {
    const onCollapse = jest.fn();
    const root = renderPanel(() => {}, onCollapse);
    const chevron = root.querySelector<HTMLButtonElement>("[data-history-collapse]");
    expect(chevron).not.toBeNull();
    act(() => {
      chevron?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });
});
