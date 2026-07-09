/**
 * Tests for the terminal root layout (Task F2, feedback wave 1): collapsible side panels.
 *
 * Philosophy under test: the terminal ships FULL-WIDTH — both side panels default to collapsed
 * slim rails (Settings.TerminalHistoryCollapsed / Settings.TerminalTargetCollapsed default true)
 * so space-padded script output keeps its alignment. Panels are opt-in via the rails.
 *
 * Covers:
 *   - both settings default to true and survive a save/load round trip
 *   - old saves (keys absent) keep the collapsed default; tampered saves coerce to booleans
 *   - collapsed rails render with expand buttons; expanding renders the panel with its collapse
 *     chevron; collapsing renders the rail again
 *   - the output column (#terminal) is present in all four collapse states
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../src/Settings/Settings";
import { loadSettings } from "../../../src/Settings/SettingsUtils";
import { Terminal } from "../../../src/Terminal";
import { TerminalRoot } from "../../../src/Terminal/ui/TerminalRoot";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

// Captured at module load, before any test mutates the singleton: the shipped defaults.
const defaultHistoryCollapsed = Settings.TerminalHistoryCollapsed;
const defaultTargetCollapsed = Settings.TerminalTargetCollapsed;

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  Terminal.action = null;
  Settings.TerminalHistoryCollapsed = true;
  Settings.TerminalTargetCollapsed = true;
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
  Settings.TerminalHistoryCollapsed = true;
  Settings.TerminalTargetCollapsed = true;
});

function renderRoot(): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <TerminalRoot />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function click(element: Element | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Terminal side-panel collapse settings — defaults and persistence", () => {
  it("both panels ship collapsed by default", () => {
    expect(defaultHistoryCollapsed).toBe(true);
    expect(defaultTargetCollapsed).toBe(true);
  });

  it("survives a Settings save/load round trip", () => {
    Settings.TerminalHistoryCollapsed = false;
    Settings.TerminalTargetCollapsed = false;
    const saved = JSON.stringify(Settings);
    Settings.TerminalHistoryCollapsed = true;
    Settings.TerminalTargetCollapsed = true;
    loadSettings(saved);
    expect(Settings.TerminalHistoryCollapsed).toBe(false);
    expect(Settings.TerminalTargetCollapsed).toBe(false);
  });

  it("keeps the collapsed default when the keys are absent from an old save", () => {
    const saved = JSON.parse(JSON.stringify(Settings)) as Record<string, unknown>;
    delete saved.TerminalHistoryCollapsed;
    delete saved.TerminalTargetCollapsed;
    loadSettings(JSON.stringify(saved));
    expect(Settings.TerminalHistoryCollapsed).toBe(true);
    expect(Settings.TerminalTargetCollapsed).toBe(true);
  });

  it("loadSettings coerces tampered non-boolean values to real booleans", () => {
    const saved = JSON.parse(JSON.stringify(Settings)) as Record<string, unknown>;
    saved.TerminalHistoryCollapsed = "not-a-boolean";
    saved.TerminalTargetCollapsed = null;
    loadSettings(JSON.stringify(saved));
    expect(Settings.TerminalHistoryCollapsed).toBe(true);
    expect(Settings.TerminalTargetCollapsed).toBe(false);
  });
});

describe("TerminalRoot — collapsed rails (default state)", () => {
  it("renders both rails with expand buttons, no panels, and the output column", () => {
    const root = renderRoot();
    expect(root.querySelector("[data-history-expand]")).not.toBeNull();
    expect(root.querySelector("[data-target-expand]")).not.toBeNull();
    expect(root.querySelector("[data-history-panel]")).toBeNull();
    expect(root.querySelector("[data-target-panel]")).toBeNull();
    expect(root.querySelector("#terminal")).not.toBeNull();
  });
});

describe("TerminalRoot — expand and collapse", () => {
  it("expanding the history rail renders the panel and persists the setting", () => {
    const root = renderRoot();
    click(root.querySelector("[data-history-expand]"));
    expect(root.querySelector("[data-history-panel]")).not.toBeNull();
    expect(root.querySelector("[data-history-expand]")).toBeNull();
    expect(Settings.TerminalHistoryCollapsed).toBe(false);
    expect(root.querySelector("#terminal")).not.toBeNull();
  });

  it("collapsing the history panel via its chevron renders the rail again and persists", () => {
    Settings.TerminalHistoryCollapsed = false;
    const root = renderRoot();
    expect(root.querySelector("[data-history-panel]")).not.toBeNull();
    click(root.querySelector("[data-history-collapse]"));
    expect(root.querySelector("[data-history-panel]")).toBeNull();
    expect(root.querySelector("[data-history-expand]")).not.toBeNull();
    expect(Settings.TerminalHistoryCollapsed).toBe(true);
    expect(root.querySelector("#terminal")).not.toBeNull();
  });

  it("expanding the target rail renders the panel and persists the setting", () => {
    const root = renderRoot();
    click(root.querySelector("[data-target-expand]"));
    expect(root.querySelector("[data-target-panel]")).not.toBeNull();
    expect(root.querySelector("[data-target-expand]")).toBeNull();
    expect(Settings.TerminalTargetCollapsed).toBe(false);
    expect(root.querySelector("#terminal")).not.toBeNull();
  });

  it("collapsing the target panel via its chevron renders the rail again and persists", () => {
    Settings.TerminalTargetCollapsed = false;
    const root = renderRoot();
    expect(root.querySelector("[data-target-panel]")).not.toBeNull();
    click(root.querySelector("[data-target-collapse]"));
    expect(root.querySelector("[data-target-panel]")).toBeNull();
    expect(root.querySelector("[data-target-expand]")).not.toBeNull();
    expect(Settings.TerminalTargetCollapsed).toBe(true);
    expect(root.querySelector("#terminal")).not.toBeNull();
  });

  it("renders the output column with both panels expanded (fourth state)", () => {
    Settings.TerminalHistoryCollapsed = false;
    Settings.TerminalTargetCollapsed = false;
    const root = renderRoot();
    expect(root.querySelector("[data-history-panel]")).not.toBeNull();
    expect(root.querySelector("[data-target-panel]")).not.toBeNull();
    expect(root.querySelector("#terminal")).not.toBeNull();
  });
});
