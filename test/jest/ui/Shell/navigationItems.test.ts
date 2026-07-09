import type { Gang } from "../../../../src/Gang/Gang";
import type { Corporation } from "../../../../src/Corporation/Corporation";
import type { Sleeve } from "../../../../src/PersonObjects/Sleeve/Sleeve";

import { Player } from "@player";
import { Page } from "../../../../src/ui/Router";
import { GoToPageKeyBindingTypes } from "../../../../src/utils/KeyBindingUtils";
import { ErrorState } from "../../../../src/ErrorHandling/ErrorState";
import { InvitationsSeen } from "../../../../src/Faction/ui/FactionsRoot";
import { ProgramsSeen } from "../../../../src/Programs/ui/ProgramsRoot";
import { getAvailableCreatePrograms } from "../../../../src/Programs/ProgramHelpers";
import { AugmentationName, CompanyName, FactionName, JobName } from "@enums";
import { PlayerOwnedAugmentation } from "../../../../src/Augmentation/PlayerOwnedAugmentation";

import {
  navigationSections,
  findNavigationItem,
  getNavigationSectionForPage,
  getBadgeCount,
  isItemActive,
  isItemVisible,
  isPageVisible,
} from "../../../../src/Sidebar/navigationItems";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../../Utilities";

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  // setupBasicTestingEnvironment grants SF4. Remove all source files so the player is "fresh" (knowAboutBitverse()
  // must be false for the visibility tests below).
  Player.sourceFiles.clear();
  ErrorState.UnreadErrors = 0;
  InvitationsSeen.clear();
});

function getItemOrThrow(page: Page) {
  const item = findNavigationItem(page);
  if (!item) throw new Error(`No navigation item for page ${page}`);
  return item;
}

describe("navigationSections structure", () => {
  it("has the four sidebar sections in order", () => {
    expect(navigationSections.map((s) => s.label)).toEqual(["Hacking", "Character", "World", "Help"]);
  });

  it("contains every page that SidebarRoot renders", () => {
    const pages = navigationSections.flatMap((s) => s.items.map((i) => i.page));
    expect(pages).toEqual([
      Page.Terminal,
      Page.ScriptEditor,
      Page.ActiveScripts,
      Page.CreateProgram,
      Page.StaneksGift,
      Page.Stats,
      Page.Factions,
      Page.Augmentations,
      Page.Hacknet,
      Page.Sleeves,
      Page.Grafting,
      Page.City,
      Page.Travel,
      Page.Job,
      Page.StockMarket,
      Page.Bladeburner,
      Page.Corporation,
      Page.Gang,
      Page.Go,
      Page.DarkNet,
      Page.Milestones,
      Page.Documentation,
      Page.Achievements,
      Page.Options,
      Page.DevMenu,
    ]);
  });

  it("has a navigation item for every go-to-page key binding type", () => {
    for (const keyBindingType of GoToPageKeyBindingTypes) {
      expect(findNavigationItem(keyBindingType as Page)).toBeDefined();
    }
  });
});

describe("visibility conditions mirror SidebarRoot", () => {
  it("hides Factions for a fresh player", () => {
    expect(isItemVisible(getItemOrThrow(Page.Factions))).toBe(false);
    expect(isPageVisible(Page.Factions)).toBe(false);
  });

  it("shows Factions when the player has a faction invitation", () => {
    Player.factionInvitations.push(FactionName.CyberSec);
    expect(isItemVisible(getItemOrThrow(Page.Factions))).toBe(true);
  });

  it("shows Factions when the player has joined a faction", () => {
    Player.factions.push(FactionName.CyberSec);
    expect(isItemVisible(getItemOrThrow(Page.Factions))).toBe(true);
  });

  it("shows Factions when the player has heard a rumor", () => {
    Player.factionRumors.add(FactionName.CyberSec);
    expect(isItemVisible(getItemOrThrow(Page.Factions))).toBe(true);
  });

  it("hides Augmentations for a fresh player and shows them once augs are queued", () => {
    const item = getItemOrThrow(Page.Augmentations);
    expect(isItemVisible(item)).toBe(false);
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.NeuroFluxGovernor));
    expect(isItemVisible(item)).toBe(true);
  });

  it("shows Gang only when Player.gang exists", () => {
    const item = getItemOrThrow(Page.Gang);
    expect(isItemVisible(item)).toBe(false);
    Player.gang = {} as Gang;
    expect(isItemVisible(item)).toBe(true);
  });

  it("shows Corporation only when Player.corporation exists", () => {
    const item = getItemOrThrow(Page.Corporation);
    expect(isItemVisible(item)).toBe(false);
    Player.corporation = {} as Corporation;
    expect(isItemVisible(item)).toBe(true);
  });

  it("shows Stock Market only with a WSE account", () => {
    const item = getItemOrThrow(Page.StockMarket);
    expect(isItemVisible(item)).toBe(false);
    Player.hasWseAccount = true;
    expect(isItemVisible(item)).toBe(true);
  });

  it("shows Job only when the player has at least one job", () => {
    const item = getItemOrThrow(Page.Job);
    expect(isItemVisible(item)).toBe(false);
    Player.jobs["MegaCorp" as CompanyName] = "Software Engineering Intern" as JobName;
    expect(isItemVisible(item)).toBe(true);
  });

  it("shows Sleeves only when the player has sleeves", () => {
    const item = getItemOrThrow(Page.Sleeves);
    expect(isItemVisible(item)).toBe(false);
    Player.sleeves.push({} as Sleeve);
    expect(isItemVisible(item)).toBe(true);
  });

  it("always shows the unconditional pages", () => {
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
      expect(isItemVisible(getItemOrThrow(page))).toBe(true);
    }
  });

  it("does not consider non-navigation pages visible", () => {
    expect(isPageVisible(Page.BitVerse)).toBe(false);
    expect(isPageVisible(Page.Work)).toBe(false);
  });
});

describe("active detection (alternateKeys)", () => {
  it("City is active on Page.Location", () => {
    const city = getItemOrThrow(Page.City);
    expect(isItemActive(city, Page.City)).toBe(true);
    expect(isItemActive(city, Page.Location)).toBe(true);
    expect(isItemActive(city, Page.Travel)).toBe(false);
  });

  it("Factions is active on Page.Faction", () => {
    const factions = getItemOrThrow(Page.Factions);
    expect(isItemActive(factions, Page.Faction)).toBe(true);
  });

  it("Active Scripts is active on recent errors / recently killed scripts", () => {
    const activeScripts = getItemOrThrow(Page.ActiveScripts);
    expect(isItemActive(activeScripts, Page.RecentErrors)).toBe(true);
    expect(isItemActive(activeScripts, Page.RecentlyKilledScripts)).toBe(true);
  });

  it("maps pages to their navigation section for the breadcrumb", () => {
    expect(getNavigationSectionForPage(Page.Terminal)?.label).toBe("Hacking");
    expect(getNavigationSectionForPage(Page.Faction)?.label).toBe("Character");
    expect(getNavigationSectionForPage(Page.Location)?.label).toBe("World");
    expect(getNavigationSectionForPage(Page.Options)?.label).toBe("Help");
    expect(getNavigationSectionForPage(Page.BitVerse)).toBeUndefined();
  });
});

describe("badge counts mirror SidebarRoot", () => {
  it("Active Scripts badge equals unread error count", () => {
    const item = getItemOrThrow(Page.ActiveScripts);
    expect(getBadgeCount(item)).toBe(0);
    ErrorState.UnreadErrors = 3;
    expect(getBadgeCount(item)).toBe(3);
  });

  it("Factions badge counts unseen invitations", () => {
    const item = getItemOrThrow(Page.Factions);
    expect(getBadgeCount(item)).toBe(0);
    Player.factionInvitations.push(FactionName.CyberSec, FactionName.TianDiHui);
    expect(getBadgeCount(item)).toBe(2);
    InvitationsSeen.add(FactionName.CyberSec);
    expect(getBadgeCount(item)).toBe(1);
  });

  it("Augmentations badge counts queued augmentations", () => {
    const item = getItemOrThrow(Page.Augmentations);
    expect(getBadgeCount(item)).toBe(0);
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(AugmentationName.NeuroFluxGovernor));
    expect(getBadgeCount(item)).toBe(1);
  });

  it("Create Program badge counts unseen available programs", () => {
    const item = getItemOrThrow(Page.CreateProgram);
    const expected = getAvailableCreatePrograms().length - ProgramsSeen.size;
    expect(getBadgeCount(item)).toBe(Math.max(expected, 0));
  });
});
