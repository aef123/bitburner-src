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
import { ShellLayout } from "../../../../src/ui/Shell/ShellLayout";

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
  // Collapsed (icons-only) baseline: the pre-existing tests assert icon-only rendering.
  Settings.IsSidebarOpened = false;
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

function getChevron(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[aria-label="Expand sidebar"], [aria-label="Collapse sidebar"]');
}

describe("IconRail expand/collapse", () => {
  it("collapsed rail renders icons only (no page names)", () => {
    const root = renderRail(Page.Terminal);
    expect(getItem(root, Page.Terminal)?.textContent).toBe("");
    expect(getItem(root, Page.City)?.textContent).toBe("");
  });

  it("expanded rail renders page names next to the icons", () => {
    Settings.IsSidebarOpened = true;
    const root = renderRail(Page.Terminal);
    expect(getItem(root, Page.Terminal)?.textContent).toBe(String(Page.Terminal));
    expect(getItem(root, Page.City)?.textContent).toBe(String(Page.City));
  });

  it("expanded rail renders group headers", () => {
    Settings.IsSidebarOpened = true;
    const root = renderRail(Page.Terminal);
    expect(root.textContent).toContain("Hacking");
    expect(root.textContent).toContain("World");
  });

  it("chevron click expands the rail and persists Settings.IsSidebarOpened", () => {
    const root = renderRail(Page.Terminal);
    expect(getChevron(root)?.getAttribute("aria-label")).toBe("Expand sidebar");
    act(() => {
      getChevron(root)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(Settings.IsSidebarOpened).toBe(true);
    expect(getItem(root, Page.Terminal)?.textContent).toBe(String(Page.Terminal));
    expect(getChevron(root)?.getAttribute("aria-label")).toBe("Collapse sidebar");
  });

  it("chevron click collapses an expanded rail back to icons", () => {
    Settings.IsSidebarOpened = true;
    const root = renderRail(Page.Terminal);
    act(() => {
      getChevron(root)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(Settings.IsSidebarOpened).toBe(false);
    expect(getItem(root, Page.Terminal)?.textContent).toBe("");
    expect(getChevron(root)?.getAttribute("aria-label")).toBe("Expand sidebar");
  });

  it("marks the active item in both modes (aria-current + accent label class)", () => {
    let root = renderRail(Page.Terminal);
    expect(getItem(root, Page.Terminal)?.getAttribute("aria-current")).toBe("page");

    // Fresh mount: the rail reads Settings.IsSidebarOpened on mount (and via the chevron's event).
    if (container) ReactDOM.unmountComponentAtNode(container);
    Settings.IsSidebarOpened = true;
    root = renderRail(Page.Terminal);
    const activeItem = getItem(root, Page.Terminal);
    const inactiveItem = getItem(root, Page.City);
    expect(activeItem?.getAttribute("aria-current")).toBe("page");
    // The active label carries the accent styling class the inactive label lacks.
    const activeLabel = activeItem?.querySelector("span");
    const inactiveLabel = inactiveItem?.querySelector("span");
    expect(activeLabel).not.toBeNull();
    expect(inactiveLabel).not.toBeNull();
    expect(activeLabel?.className).not.toBe(inactiveLabel?.className);
  });

  it("keeps badges visible while expanded", () => {
    Settings.IsSidebarOpened = true;
    ErrorState.UnreadErrors = 3;
    const root = renderRail(Page.Terminal);
    expect(getItem(root, Page.ActiveScripts)?.textContent).toContain("3");
  });
});

describe("ShellLayout rail column", () => {
  function renderShell(): HTMLDivElement {
    if (!container) throw new Error("No container");
    act(() => {
      ReactDOM.render(
        <ThemeProvider theme={testTheme}>
          <ShellLayout page={Page.Terminal} save={jest.fn()} killScripts={jest.fn()}>
            <div />
          </ShellLayout>
        </ThemeProvider>,
        container,
      );
    });
    return container;
  }

  it("first grid column follows the rail expansion (60px ↔ 210px)", () => {
    Settings.HudCollapsed = false;
    const root = renderShell();
    const shell = root.firstElementChild as HTMLElement;
    expect(shell.style.gridTemplateColumns).toBe("60px 1fr 272px");
    act(() => {
      getChevron(root)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(shell.style.gridTemplateColumns).toBe("210px 1fr 272px");
    act(() => {
      getChevron(root)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(shell.style.gridTemplateColumns).toBe("60px 1fr 272px");
  });
});
