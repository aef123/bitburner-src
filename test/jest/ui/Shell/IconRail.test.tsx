import type { Gang } from "../../../../src/Gang/Gang";

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { FactionName } from "@enums";
import { Settings } from "../../../../src/Settings/Settings";
import { Page } from "../../../../src/ui/Router";
import { Router } from "../../../../src/ui/GameRoot";
import { ErrorState } from "../../../../src/ErrorHandling/ErrorState";
import { InvitationsSeen } from "../../../../src/Faction/ui/FactionsRoot";
import { IconRail } from "../../../../src/ui/Shell/IconRail";

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
  ErrorState.UnreadErrors = 0;
  InvitationsSeen.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  // Re-apply the no-op patch from initGameEnvironment (some tests replace Router.toPage with a mock).
  Router.toPage = () => {};
});

function renderRail(page: Page): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <IconRail page={page} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function getItem(root: HTMLElement, page: Page): HTMLElement | null {
  return root.querySelector(`[data-page="${page}"]`);
}

describe("IconRail visibility", () => {
  it("renders the always-visible pages for a fresh player", () => {
    const root = renderRail(Page.Terminal);
    for (const page of [
      Page.Terminal,
      Page.ScriptEditor,
      Page.ActiveScripts,
      Page.CreateProgram,
      Page.Stats,
      Page.Hacknet,
      Page.City,
      Page.Travel,
      Page.Milestones,
      Page.Documentation,
      Page.Achievements,
      Page.Options,
    ]) {
      expect(getItem(root, page)).not.toBeNull();
    }
  });

  it("hides gated pages for a fresh player", () => {
    const root = renderRail(Page.Terminal);
    for (const page of [Page.Factions, Page.Augmentations, Page.Gang, Page.Corporation, Page.StockMarket, Page.Job]) {
      expect(getItem(root, page)).toBeNull();
    }
  });

  it("shows Factions once the player is invited, and Gang when a gang exists", () => {
    Player.factionInvitations.push(FactionName.CyberSec);
    Player.gang = {} as Gang;
    const root = renderRail(Page.Terminal);
    expect(getItem(root, Page.Factions)).not.toBeNull();
    expect(getItem(root, Page.Gang)).not.toBeNull();
  });
});

describe("IconRail active detection", () => {
  it("marks the current page active", () => {
    const root = renderRail(Page.Terminal);
    expect(getItem(root, Page.Terminal)?.getAttribute("aria-current")).toBe("page");
    expect(getItem(root, Page.City)?.getAttribute("aria-current")).toBeNull();
  });

  it("marks City active on Page.Location (alternateKeys)", () => {
    const root = renderRail(Page.Location);
    expect(getItem(root, Page.City)?.getAttribute("aria-current")).toBe("page");
  });

  it("marks Factions active on Page.Faction (alternateKeys)", () => {
    Player.factions.push(FactionName.CyberSec);
    const root = renderRail(Page.Faction);
    expect(getItem(root, Page.Factions)?.getAttribute("aria-current")).toBe("page");
  });
});

describe("IconRail badges", () => {
  it("shows the unread error count on Active Scripts", () => {
    ErrorState.UnreadErrors = 3;
    const root = renderRail(Page.Terminal);
    const item = getItem(root, Page.ActiveScripts);
    expect(item?.textContent).toContain("3");
  });

  it("shows the unseen invitation count on Factions", () => {
    Player.factionInvitations.push(FactionName.CyberSec, FactionName.TianDiHui);
    const root = renderRail(Page.Terminal);
    const item = getItem(root, Page.Factions);
    expect(item?.textContent).toContain("2");
  });

  it("shows no badge when there is nothing to report", () => {
    const root = renderRail(Page.Terminal);
    const item = getItem(root, Page.ActiveScripts);
    expect(item?.textContent).toBe("");
  });
});

describe("IconRail navigation", () => {
  it("navigates via Router.toPage on click", () => {
    const toPage = jest.fn();
    Router.toPage = toPage;
    const root = renderRail(Page.City);
    act(() => {
      getItem(root, Page.Terminal)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toPage).toHaveBeenCalledWith(Page.Terminal);
  });
});
