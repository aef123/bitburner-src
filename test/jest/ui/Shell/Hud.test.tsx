/**
 * Tests for the docked HUD panel — since W3 retired the floating overview, this is the ONLY
 * overview UI on shell pages (the wiring matrix lives in test/jest/ui/GameRootOverview.test.tsx).
 *
 * Follows the established Shell test pattern (see IconRail.test.tsx):
 * ReactDOM + ThemeProvider, initGameEnvironment/setupBasicTestingEnvironment.
 *
 * Covers:
 *   - skill rows render (Hack + combat + Cha)
 *   - Int row gated on Player.skills.intelligence > 0
 *   - script-injection hook ids present (overview-extra-hook-0/1/2 and per-stat hooks)
 *   - collapse button flips Settings.HudCollapsed
 *   - action card hidden with no current work
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { Settings } from "../../../../src/Settings/Settings";
import { Hud } from "../../../../src/ui/Shell/Hud";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  // setupBasicTestingEnvironment grants SF4; remove it so the player is "fresh".
  Player.sourceFiles.clear();
  Settings.HudCollapsed = false;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  Settings.HudCollapsed = false;
});

function renderHud(): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <Hud save={jest.fn()} killScripts={jest.fn()} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

describe("Hud skill rows", () => {
  it("renders the standard skill rows", () => {
    const root = renderHud();
    for (const skill of ["Hack", "Str", "Def", "Dex", "Agi", "Cha"]) {
      expect(root.querySelector(`[data-skill="${skill}"]`)).not.toBeNull();
    }
  });

  it("hides the Int row when intelligence is 0", () => {
    Player.skills.intelligence = 0;
    const root = renderHud();
    expect(root.querySelector(`[data-skill="Int"]`)).toBeNull();
  });

  it("shows the Int row when intelligence is above 0", () => {
    Player.skills.intelligence = 5;
    const root = renderHud();
    expect(root.querySelector(`[data-skill="Int"]`)).not.toBeNull();
  });
});

describe("Hud script-injection hooks", () => {
  it("renders the three overview-extra-hook elements", () => {
    const root = renderHud();
    for (const id of ["overview-extra-hook-0", "overview-extra-hook-1", "overview-extra-hook-2"]) {
      expect(root.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("renders the per-stat hook elements from the floating overview", () => {
    Player.skills.intelligence = 1;
    const root = renderHud();
    for (const id of [
      "overview-hp-hook",
      "overview-money-hook",
      "overview-hack-hook",
      "overview-str-hook",
      "overview-def-hook",
      "overview-dex-hook",
      "overview-agi-hook",
      "overview-cha-hook",
      "overview-int-hook",
    ]) {
      expect(root.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});

describe("Hud collapse", () => {
  it("sets Settings.HudCollapsed when the collapse button is clicked", () => {
    const root = renderHud();
    const button = root.querySelector(`[aria-label="Collapse overview panel"]`);
    expect(button).not.toBeNull();
    expect(Settings.HudCollapsed).toBe(false);
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(Settings.HudCollapsed).toBe(true);
  });
});

describe("Hud action card", () => {
  it("does not render an action card when there is no current work", () => {
    Player.currentWork = null;
    const root = renderHud();
    expect(root.querySelector(`[data-hud-action]`)).toBeNull();
  });
});
