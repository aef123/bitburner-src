/**
 * Render tests for the redesigned Faction Augmentations screen (Task W7).
 * Same harness pattern as FactionsRoot.test.tsx: ReactDOM + ThemeProvider,
 * initGameEnvironment/setupBasicTestingEnvironment.
 *
 * Covers:
 *   - section headers carry the Purchasable/Locked/Owned counts and render in that fixed order
 *     (single sorted list — the tabs were removed on user request),
 *   - READY vs CAN'T AFFORD card states driven by money,
 *   - NFG is classified by its real state: purchasable-but-CAN'T-AFFORD when rep is met and money
 *     is short, locked with rep progress when rep is unmet (user report: it was always shown
 *     purchasable),
 *   - canPurchaseAugNow is the single purchasability source (spy flips every card),
 *   - locked cards render unlock progress from current rep / rep cost,
 *   - owned chip cloud collapses to 6 chips and expands via "+ N more",
 *   - the Buy button opens the EXISTING PurchaseAugmentationModal,
 *   - the install-queue sidebar totals the escalated prices and gates the install button.
 */
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { AugmentationName, FactionName } from "@enums";

import { Augmentations } from "../../../src/Augmentation/Augmentations";
import { getAugCost } from "../../../src/Augmentation/AugmentationHelpers";
import { Factions } from "../../../src/Faction/Factions";
import { getFactionAugmentationsFiltered, hasAugmentationPrereqs } from "../../../src/Faction/FactionHelpers";
import { AugmentationsPage } from "../../../src/Faction/ui/AugmentationsPage";
import { getQueueDisplayItems, getQueueTotal } from "../../../src/Faction/ui/augmentationsPageHelpers";
import * as factionsScreenHelpers from "../../../src/Faction/ui/factionsScreenHelpers";
import { PurchaseAugmentationsOrderSetting } from "../../../src/Settings/SettingEnums";
import { Settings } from "../../../src/Settings/Settings";
import { formatMoney } from "../../../src/ui/formatNumber";
import { Router } from "../../../src/ui/GameRoot";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  Settings.PurchaseAugmentationsOrder = PurchaseAugmentationsOrderSetting.Default;
  Settings.SuppressBuyAugmentationConfirmation = false;
  Router.toPage = () => {};
  Factions[FactionName.CyberSec].isMember = true;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  // Modals render into portals on document.body — clear leftovers between tests.
  document.body.innerHTML = "";
  Settings.PurchaseAugmentationsOrder = PurchaseAugmentationsOrderSetting.Default;
  Settings.SuppressBuyAugmentationConfirmation = false;
});

function renderPage(facName: FactionName = FactionName.CyberSec): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <AugmentationsPage faction={Factions[facName]} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function click(element: Element | null): void {
  expect(element).not.toBeNull();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** CyberSec's non-NFG augs, ascending by rep cost — the fixture we split across tabs. */
function cyberSecAugsByRep(): AugmentationName[] {
  return getFactionAugmentationsFiltered(Factions[FactionName.CyberSec])
    .filter((augName) => augName !== AugmentationName.NeuroFluxGovernor)
    .sort((a, b) => getAugCost(Augmentations[a]).repCost - getAugCost(Augmentations[b]).repCost);
}

describe("section headers and order", () => {
  it("headers carry the Purchasable/Locked/Owned partition counts (no NFG special case)", () => {
    const faction = Factions[FactionName.CyberSec];
    const augs = cyberSecAugsByRep();
    expect(augs.length).toBeGreaterThanOrEqual(2);
    // Rep exactly at the cheapest requirement: at least one purchasable, at least one locked.
    faction.playerReputation = getAugCost(Augmentations[augs[0]]).repCost;
    const all = getFactionAugmentationsFiltered(faction);
    // Every aug — NFG included — counts by its real rep state.
    const purchasableCount = all.filter(
      (a) => faction.playerReputation >= getAugCost(Augmentations[a]).repCost,
    ).length;
    const lockedCount = all.length - purchasableCount;

    const root = renderPage();
    expect(root.querySelector('[data-section-header="purchasable"]')?.textContent).toBe(
      `Purchasable (${purchasableCount})`,
    );
    expect(root.querySelector('[data-section-header="locked"]')?.textContent).toBe(`Locked (${lockedCount})`);
    expect(root.querySelector('[data-section-header="owned"]')?.textContent).toBe("Owned (0)");
  });

  it("renders all three sections in one list: purchasable before locked before owned", () => {
    const faction = Factions[FactionName.CyberSec];
    const augs = cyberSecAugsByRep();
    expect(augs.length).toBeGreaterThanOrEqual(3);
    // Populate all three sections: own the cheapest, meet the second's rep, leave the last locked.
    Player.queueAugmentation(augs[0]);
    faction.playerReputation = getAugCost(Augmentations[augs[1]]).repCost;
    expect(getAugCost(Augmentations[augs[augs.length - 1]]).repCost).toBeGreaterThan(faction.playerReputation);

    const root = renderPage();
    const purchasableCard = root.querySelector(`[data-aug-card="${augs[1]}"]`);
    const lockedCard = root.querySelector(`[data-locked-card="${augs[augs.length - 1]}"]`);
    const ownedChip = root.querySelector(`[data-owned-chip="${augs[0]}"]`);
    expect(purchasableCard).not.toBeNull();
    expect(lockedCard).not.toBeNull();
    expect(ownedChip).not.toBeNull();
    // DOM order is the requested fixed order: purchasable, then locked, then owned.
    const follows = (earlier: Element | null, later: Element | null) =>
      !!earlier && !!later && (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(purchasableCard, lockedCard)).toBe(true);
    expect(follows(lockedCard, ownedChip)).toBe(true);
    // The old tabs are gone — nothing to click through.
    expect(root.querySelector("[data-tab]")).toBeNull();
  });
});

describe("purchasable card states", () => {
  it("tags rep-met augs READY with money and CAN'T AFFORD without", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.money = 1e15;
    // Even with rep+money, prereq-gated augs (e.g. CSP Gen II needs Gen I) stay not-READY —
    // canPurchaseAugNow includes prereqs, same as the old page's gate.
    const prereqGated = getFactionAugmentationsFiltered(faction).filter(
      (augName) => !hasAugmentationPrereqs(Augmentations[augName]),
    ).length;
    let root = renderPage();
    expect(root.querySelectorAll('[data-aug-status="ready"]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('[data-aug-status="cant-afford"]')).toHaveLength(prereqGated);

    Player.money = 0;
    if (container) ReactDOM.unmountComponentAtNode(container);
    root = renderPage();
    expect(root.querySelectorAll('[data-aug-status="ready"]')).toHaveLength(0);
    expect(root.querySelectorAll('[data-aug-status="cant-afford"]').length).toBeGreaterThan(0);
  });

  it("uses canPurchaseAugNow as the single purchasability source", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.money = 0; // would be CAN'T AFFORD for real…
    const spy = jest.spyOn(factionsScreenHelpers, "canPurchaseAugNow").mockReturnValue(true);
    const root = renderPage();
    // …but every card obeys the helper, proving there is no second inline gate.
    expect(root.querySelectorAll('[data-aug-status="cant-afford"]')).toHaveLength(0);
    expect(root.querySelectorAll('[data-aug-status="ready"]').length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
  });

  it("shows NFG as purchasable with CAN'T AFFORD when rep is met but money is short", () => {
    // User report: NFG appeared purchasable ("READY"-adjacent) when it actually was not.
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.money = 0;
    const root = renderPage();
    const nfgCard = root.querySelector(`[data-aug-card="${AugmentationName.NeuroFluxGovernor}"]`);
    expect(nfgCard).not.toBeNull();
    expect(nfgCard?.querySelector("[data-aug-status]")?.getAttribute("data-aug-status")).toBe("cant-afford");
    expect(root.querySelector(`[data-locked-card="${AugmentationName.NeuroFluxGovernor}"]`)).toBeNull();
  });

  it("Buy opens the existing PurchaseAugmentationModal (confirmation not suppressed)", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.money = 1e15;
    Settings.SuppressBuyAugmentationConfirmation = false;
    const root = renderPage();
    const buyButton = root.querySelector("[data-buy-button]");
    expect(document.body.textContent).not.toContain("Would you like to purchase");
    click(buyButton);
    expect(document.body.textContent).toContain("Would you like to purchase");
  });
});

describe("locked cards", () => {
  it("renders unlock progress as current rep / rep cost", () => {
    const faction = Factions[FactionName.CyberSec];
    const augs = cyberSecAugsByRep();
    const target = augs[augs.length - 1];
    const repCost = getAugCost(Augmentations[target]).repCost;
    faction.playerReputation = repCost / 4;
    const root = renderPage();
    const fill = root.querySelector(`[data-unlock-fill="${target}"]`);
    if (!(fill instanceof HTMLElement)) throw new Error("Expected an unlock progress fill element");
    expect(parseFloat(fill.style.width)).toBeCloseTo(25, 5);
  });

  it("locks NFG with rep progress when its escalating rep requirement is unmet", () => {
    const faction = Factions[FactionName.CyberSec];
    const nfg = AugmentationName.NeuroFluxGovernor;
    const repCost = getAugCost(Augmentations[nfg]).repCost;
    expect(repCost).toBeGreaterThan(0); // fixture sanity: NFG level 1 is rep-gated
    faction.playerReputation = repCost / 4;
    Player.money = 1e15; // money alone must not make it purchasable

    const root = renderPage();
    expect(root.querySelector(`[data-aug-card="${nfg}"]`)).toBeNull();
    const lockedCard = root.querySelector(`[data-locked-card="${nfg}"]`);
    expect(lockedCard).not.toBeNull();
    // Keeps its "- Level N+1" naming even while locked.
    expect(lockedCard?.textContent).toContain(`${nfg} - Level 1`);
    const fill = root.querySelector(`[data-unlock-fill="${nfg}"]`);
    if (!(fill instanceof HTMLElement)) throw new Error("Expected an unlock progress fill element");
    expect(parseFloat(fill.style.width)).toBeCloseTo(25, 5);
  });
});

describe("owned chip cloud", () => {
  it("collapses to 6 chips with a '+ N more' expander, expanding on click", () => {
    // NiteSec offers > 6 non-NFG augs, enough to overflow the collapsed cloud.
    const faction = Factions[FactionName.NiteSec];
    faction.playerReputation = 1e12;
    const augs = getFactionAugmentationsFiltered(faction).filter(
      (augName) => augName !== AugmentationName.NeuroFluxGovernor,
    );
    expect(augs.length).toBeGreaterThan(6); // fixture sanity
    for (const augName of augs) Player.queueAugmentation(augName);

    const root = renderPage(FactionName.NiteSec);
    expect(root.querySelector('[data-section-header="owned"]')?.textContent).toBe(`Owned (${augs.length})`);
    expect(root.querySelectorAll("[data-owned-chip]")).toHaveLength(6);
    const expander = root.querySelector("[data-owned-expander]");
    expect(expander?.textContent).toBe(`+ ${augs.length - 6} more`);
    click(expander);
    expect(root.querySelectorAll("[data-owned-chip]")).toHaveLength(augs.length);
  });
});

describe("install queue sidebar", () => {
  it("shows each queued aug and totals the escalated prices from the game's multiplier", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    const [first, second] = cyberSecAugsByRep();
    Player.queueAugmentation(first);
    Player.queueAugmentation(second);
    const expectedTotal = getQueueTotal(getQueueDisplayItems());

    const root = renderPage();
    expect(root.querySelector(`[data-queue-item="${first}"]`)).not.toBeNull();
    expect(root.querySelector(`[data-queue-item="${second}"]`)).not.toBeNull();
    expect(root.querySelector("[data-queue-total]")?.textContent).toBe(formatMoney(expectedTotal));
    const installButton = root.querySelector("[data-install-button]");
    if (!(installButton instanceof HTMLButtonElement)) throw new Error("Expected an install button");
    expect(installButton.disabled).toBe(false);
    expect(installButton.textContent).toContain("Install 2 augmentations");
  });

  it("disables the install button when nothing is queued", () => {
    const root = renderPage();
    expect(root.querySelector("[data-queue-empty]")).not.toBeNull();
    const installButton = root.querySelector("[data-install-button]");
    if (!(installButton instanceof HTMLButtonElement)) throw new Error("Expected an install button");
    expect(installButton.disabled).toBe(true);
  });

  it("install opens the existing reset confirmation (not suppressed)", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.queueAugmentation(cyberSecAugsByRep()[0]);
    const root = renderPage();
    expect(document.body.textContent).not.toContain("Installing will reset");
    click(root.querySelector("[data-install-button]"));
    expect(document.body.textContent).toContain("Installing will reset");
  });
});
