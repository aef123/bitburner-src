/**
 * Mutual-exclusion matrix for the character overview after the floating overview was retired
 * (UI refresh wave 2, Task W3). Rendered through the real GameRoot so the wiring — not just the
 * individual components — is under test.
 *
 *   shell pages (incl. Work/focus) ...... docked HUD in ShellLayout (nothing when Settings.HudCollapsed;
 *                                         the TopBar reopen button is the way back)
 *   interactive tutorial ................ floating tutorial widget (hosts InteractiveTutorialRoot;
 *                                         contributes NO script-hook ids, so the docked HUD's stay unique)
 *   full-bleed pages (Recovery, BitVerse,
 *   Infiltration, BladeburnerCinematic) . no overview UI of any kind
 *
 * The Player starts a crime so determineStartPage() lands on Page.Work — which also asserts the
 * focus screen now renders inside the shell.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { Settings } from "../../../src/Settings/Settings";
import { ITutorial } from "../../../src/InteractiveTutorial";
import { GameRoot, Router } from "../../../src/ui/GameRoot";
import { Page } from "../../../src/ui/Router";
import { CrimeWork } from "../../../src/Work/CrimeWork";
import { CrimeType } from "@enums";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

const HOOK_IDS = ["overview-extra-hook-0", "overview-extra-hook-1", "overview-extra-hook-2"];

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
  // jsdom does not implement window.scrollTo (GameRoot's scroll-to-top effect calls it).
  window.scrollTo = jest.fn();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  Player.sourceFiles.clear();
  Settings.HudCollapsed = false;
  ITutorial.isRunning = false;
  // Start a crime so the start page is Page.Work (the focus screen).
  Player.currentWork = new CrimeWork({ crimeType: CrimeType.shoplift, singularity: false });
  Player.focus = true;
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
  ITutorial.isRunning = false;
  // GameRoot installs the real Router during render; re-apply the no-op patch from initGameEnvironment.
  Router.toPage = () => {};
});

function renderGame(): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <GameRoot />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

/** The docked HUD panel (ShellLayout's <aside>). */
function dockedHud(root: HTMLElement): Element | null {
  return root.querySelector(`[aria-label="Character overview"]`);
}

/** The floating Overview frame is the only element with the react-draggable "drag" handle. */
function floatingWidget(): Element | null {
  return document.querySelector(".drag");
}

function hookCount(id: string): number {
  return document.querySelectorAll(`#${id}`).length;
}

describe("shell pages (incl. the Work focus screen)", () => {
  it("renders Work inside the shell with the docked HUD and no floating widget", () => {
    const root = renderGame();
    // Work content lives in the shell's <main> pane.
    const main = root.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.textContent).toContain("You are attempting");
    // Shell chrome is present (icon rail + top bar breadcrumb).
    expect(root.querySelector(`[data-page="${Page.Terminal}"]`)).not.toBeNull();
    // Docked HUD present; floating overview gone.
    expect(dockedHud(root)).not.toBeNull();
    expect(floatingWidget()).toBeNull();
    // Script-injection hook ids exist exactly once in the document.
    for (const id of HOOK_IDS) {
      expect(hookCount(id)).toBe(1);
    }
  });

  it("renders nothing overview-shaped when the HUD is collapsed (no floating fallback)", () => {
    Settings.HudCollapsed = true;
    const root = renderGame();
    expect(dockedHud(root)).toBeNull();
    expect(floatingWidget()).toBeNull();
    for (const id of HOOK_IDS) {
      expect(hookCount(id)).toBe(0);
    }
    // The TopBar reopen button is the way back.
    expect(root.querySelector(`[aria-label="Show overview panel"]`)).not.toBeNull();
  });
});

describe("interactive tutorial", () => {
  it("mounts the floating tutorial widget alongside the docked HUD, without duplicating hook ids", () => {
    ITutorial.isRunning = true;
    const root = renderGame();
    const widget = floatingWidget();
    expect(widget).not.toBeNull();
    expect(widget?.textContent).toContain("Tutorial");
    // The docked HUD still owns the overview content and its hook ids stay unique.
    expect(dockedHud(root)).not.toBeNull();
    for (const id of HOOK_IDS) {
      expect(hookCount(id)).toBe(1);
    }
  });
});

describe("full-bleed pages", () => {
  it("renders no overview UI of any kind", () => {
    const root = renderGame();
    act(() => {
      Router.toPage(Page.BladeburnerCinematic);
    });
    expect(dockedHud(root)).toBeNull();
    expect(floatingWidget()).toBeNull();
    for (const id of HOOK_IDS) {
      expect(hookCount(id)).toBe(0);
    }
    // No shell chrome either.
    expect(root.querySelector("main")).toBeNull();
  });
});

describe("leaving the Work page", () => {
  it("stops focusing when routing away from Work", () => {
    renderGame();
    expect(Player.focus).toBe(true);
    act(() => {
      Router.toPage(Page.BladeburnerCinematic);
    });
    expect(Player.focus).toBe(false);
  });
});
