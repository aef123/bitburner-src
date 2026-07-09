/**
 * Render tests for the redesigned Factions screen (Task W6).
 * Follows the established Shell test pattern (see test/jest/ui/Shell/Hud.test.tsx):
 * ReactDOM + ThemeProvider, initGameEnvironment/setupBasicTestingEnvironment.
 *
 * Covers:
 *   - joined-faction rows render,
 *   - gang hero card gated on Player.gang,
 *   - sort pill click persists Settings.FactionsSortMode (and toggles back to default),
 *   - can-buy toggle persists Settings.FactionsCanBuyOnly,
 *   - clicking a row navigates to Page.Faction with the faction (Router spy).
 */
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { FactionDiscovery, FactionName } from "@enums";

import { Factions } from "../../../src/Faction/Factions";
import { FactionsRoot } from "../../../src/Faction/ui/FactionsRoot";
import { Settings } from "../../../src/Settings/Settings";
import { Router } from "../../../src/ui/GameRoot";
import { Page } from "../../../src/ui/Router";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;
let toPageSpy: jest.Mock;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  Settings.FactionsSortMode = "";
  Settings.FactionsCanBuyOnly = false;
  toPageSpy = jest.fn();
  Router.toPage = toPageSpy;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  Settings.FactionsSortMode = "";
  Settings.FactionsCanBuyOnly = false;
  Router.toPage = () => {};
});

function renderFactions(): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <FactionsRoot />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function joinTestFactions(): void {
  Factions[FactionName.CyberSec].isMember = true;
  Factions[FactionName.Sector12].isMember = true;
}

function click(element: Element | null): void {
  expect(element).not.toBeNull();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("joined faction rows", () => {
  it("renders a row card for every joined faction", () => {
    joinTestFactions();
    const root = renderFactions();
    expect(root.querySelector(`[data-faction-row="${FactionName.CyberSec}"]`)).not.toBeNull();
    expect(root.querySelector(`[data-faction-row="${FactionName.Sector12}"]`)).not.toBeNull();
    expect(root.querySelectorAll("[data-faction-row]")).toHaveLength(2);
  });

  it("shows the empty state when no factions are joined", () => {
    const root = renderFactions();
    expect(root.querySelectorAll("[data-faction-row]")).toHaveLength(0);
    expect(root.textContent).toContain("You have not yet joined any Factions.");
  });

  it("renders the category chip from the FactionInfo grouping", () => {
    joinTestFactions();
    const root = renderFactions();
    const row = root.querySelector(`[data-faction-row="${FactionName.CyberSec}"]`);
    expect(row?.querySelector(`[data-category-chip="HACK"]`)).not.toBeNull();
  });
});

describe("gang hero card", () => {
  it("does not render without a gang", () => {
    joinTestFactions();
    const root = renderFactions();
    expect(root.querySelector("[data-gang-hero]")).toBeNull();
  });

  it("renders when Player.gang exists", () => {
    joinTestFactions();
    Factions[FactionName.SlumSnakes].isMember = true;
    Player.startGang(FactionName.SlumSnakes, false);
    const root = renderFactions();
    expect(root.querySelector(`[data-gang-hero="${FactionName.SlumSnakes}"]`)).not.toBeNull();
    expect(root.textContent).toContain("Manage gang");
  });
});

describe("sort pills and can-buy toggle", () => {
  it("persists the sort mode on click and round-trips back to the default order", () => {
    joinTestFactions();
    const root = renderFactions();
    click(root.querySelector(`[data-sort-pill="reputation"]`));
    expect(Settings.FactionsSortMode).toBe("reputation");
    click(root.querySelector(`[data-sort-pill="closest"]`));
    expect(Settings.FactionsSortMode).toBe("closest");
    // Clicking the active pill returns to the default ("" = game's standard order).
    click(root.querySelector(`[data-sort-pill="closest"]`));
    expect(Settings.FactionsSortMode).toBe("");
  });

  it("persists the can-buy filter toggle", () => {
    joinTestFactions();
    const root = renderFactions();
    click(root.querySelector("[data-canbuy-toggle]"));
    expect(Settings.FactionsCanBuyOnly).toBe(true);
    click(root.querySelector("[data-canbuy-toggle]"));
    expect(Settings.FactionsCanBuyOnly).toBe(false);
  });
});

describe("navigation", () => {
  it("navigates to the faction details page when a row is clicked", () => {
    joinTestFactions();
    const root = renderFactions();
    click(root.querySelector(`[data-faction-row="${FactionName.CyberSec}"]`));
    expect(toPageSpy).toHaveBeenCalledWith(Page.Faction, { faction: Factions[FactionName.CyberSec] });
  });

  it("navigates to the faction augmentations page from the aug pill without triggering the row", () => {
    joinTestFactions();
    const root = renderFactions();
    click(root.querySelector(`[data-aug-pill="${FactionName.CyberSec}"]`));
    expect(toPageSpy).toHaveBeenCalledTimes(1);
    expect(toPageSpy).toHaveBeenCalledWith(Page.FactionAugmentations, {
      faction: Factions[FactionName.CyberSec],
    });
  });

  it("Enter keydown on the aug pill does NOT trigger row navigation, only FactionAugmentations", () => {
    joinTestFactions();
    const root = renderFactions();
    const augPill = root.querySelector(`[data-aug-pill="${FactionName.CyberSec}"]`);
    expect(augPill).not.toBeNull();
    act(() => {
      // Dispatch keydown on the pill; it bubbles to the row div.
      augPill?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      // Simulate the browser's default activation of the focused button.
      augPill?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toPageSpy).toHaveBeenCalledTimes(1);
    expect(toPageSpy).toHaveBeenCalledWith(Page.FactionAugmentations, {
      faction: Factions[FactionName.CyberSec],
    });
  });

  it("Enter keydown on the row div itself still navigates to Page.Faction", () => {
    joinTestFactions();
    const root = renderFactions();
    const row = root.querySelector(`[data-faction-row="${FactionName.CyberSec}"]`);
    expect(row).not.toBeNull();
    act(() => {
      row?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(toPageSpy).toHaveBeenCalledTimes(1);
    expect(toPageSpy).toHaveBeenCalledWith(Page.Faction, { faction: Factions[FactionName.CyberSec] });
  });
});

describe("invitation rows", () => {
  beforeEach(() => {
    // invitedFactions is derived from Player.factionInvitations (not Factions[x].alreadyInvited directly).
    Player.factionInvitations.push(FactionName.CyberSec);
    Factions[FactionName.CyberSec].alreadyInvited = true;
    Factions[FactionName.CyberSec].isMember = false;
    // The game always sets discovery = known when inviting; without it the no-chip assertion
    // passes vacuously (the known-gated name/tooltip path never renders).
    Factions[FactionName.CyberSec].discovery = FactionDiscovery.known;
  });

  afterEach(() => {
    Player.factionInvitations = Player.factionInvitations.filter((n) => n !== FactionName.CyberSec);
    Factions[FactionName.CyberSec].alreadyInvited = false;
  });

  it("renders a prospect row for an invited faction", () => {
    const root = renderFactions();
    expect(root.querySelector(`[data-prospect-row="${FactionName.CyberSec}"]`)).not.toBeNull();
  });

  it("invitation rows render no category chip", () => {
    const root = renderFactions();
    const prospectRow = root.querySelector(`[data-prospect-row="${FactionName.CyberSec}"]`);
    expect(prospectRow).not.toBeNull();
    expect(prospectRow?.querySelector("[data-category-chip]")).toBeNull();
  });
});
