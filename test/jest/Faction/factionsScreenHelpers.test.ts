/**
 * Tests for the pure selectors behind the redesigned Factions screen (Task W6):
 *   - getNextAugGoal: lowest unowned rep requirement (above or below current rep),
 *     all-owned → null, queued augs count as owned (Player.hasAugmentation default),
 *   - countPurchasableAugs: mirrors AugmentationsPage's canPurchase gate (rep AND money),
 *   - sortJoinedFactions comparators + default-order round-trip,
 *   - FactionCategories: complete over the FactionName enum, mapping mirrors FactionInfo groups.
 */
import { Player } from "@player";
import { FactionName } from "@enums";

import { Augmentations } from "../../../src/Augmentation/Augmentations";
import { getAugCost } from "../../../src/Augmentation/AugmentationHelpers";
import { PlayerOwnedAugmentation } from "../../../src/Augmentation/PlayerOwnedAugmentation";
import { Factions } from "../../../src/Faction/Factions";
import { FactionCategories, FactionCategory } from "../../../src/Faction/data/FactionCategories";
import {
  countPurchasableAugs,
  getNextAugGoal,
  getRepGoalDelta,
  getRepGoalProgress,
  getUnownedFactionAugs,
  sortJoinedFactions,
} from "../../../src/Faction/ui/factionsScreenHelpers";
import { Settings } from "../../../src/Settings/Settings";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
});

/** Distinct rep costs of a faction's augs, ascending — computed from the same data the game shows. */
function distinctRepCosts(facName: FactionName): number[] {
  const costs = Factions[facName].augmentations.map((augName) => getAugCost(Augmentations[augName]).repCost);
  return [...new Set(costs)].sort((a, b) => a - b);
}

function ownAllAugs(facName: FactionName): void {
  for (const augName of Factions[facName].augmentations) {
    Player.augmentations.push(new PlayerOwnedAugmentation(augName));
  }
}

describe("getNextAugGoal", () => {
  it("picks the unowned aug with the lowest rep requirement when rep is below it", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 0;
    const goal = getNextAugGoal(faction);
    if (!goal) throw new Error("Expected a next-aug goal");
    expect(goal.repCost).toBe(distinctRepCosts(FactionName.CyberSec)[0]);
    expect(getRepGoalDelta(faction, goal)).toBe(goal.repCost);
    expect(getRepGoalProgress(faction, goal)).toBe(0);
  });

  it("still targets the lowest unowned requirement when current rep already exceeds it (zero delta, full bar)", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    const goal = getNextAugGoal(faction);
    if (!goal) throw new Error("Expected a next-aug goal");
    expect(goal.repCost).toBe(distinctRepCosts(FactionName.CyberSec)[0]);
    expect(getRepGoalDelta(faction, goal)).toBe(0);
    expect(getRepGoalProgress(faction, goal)).toBe(100);
  });

  it("skips owned augs and advances to the next-lowest requirement", () => {
    const faction = Factions[FactionName.CyberSec];
    const costs = distinctRepCosts(FactionName.CyberSec);
    expect(costs.length).toBeGreaterThanOrEqual(2); // sanity: fixture faction has multiple tiers
    // Own every aug at the lowest requirement tier.
    for (const augName of faction.augmentations) {
      if (getAugCost(Augmentations[augName]).repCost === costs[0]) {
        Player.augmentations.push(new PlayerOwnedAugmentation(augName));
      }
    }
    expect(getNextAugGoal(faction)?.repCost).toBe(costs[1]);
  });

  it("treats QUEUED augs as owned (same as the old screen's augs-left count)", () => {
    const faction = Factions[FactionName.CyberSec];
    const costs = distinctRepCosts(FactionName.CyberSec);
    const queued = faction.augmentations.filter((augName) => getAugCost(Augmentations[augName]).repCost === costs[0]);
    for (const augName of queued) {
      Player.queuedAugmentations.push(new PlayerOwnedAugmentation(augName));
    }
    expect(getNextAugGoal(faction)?.repCost).toBe(costs[1]);
    const unowned = getUnownedFactionAugs(faction);
    for (const augName of queued) {
      expect(unowned).not.toContain(augName);
    }
  });

  it("returns null when every aug the faction offers is owned", () => {
    ownAllAugs(FactionName.CyberSec);
    expect(getNextAugGoal(Factions[FactionName.CyberSec])).toBeNull();
    expect(getUnownedFactionAugs(Factions[FactionName.CyberSec])).toHaveLength(0);
  });
});

describe("countPurchasableAugs (aug pill logic)", () => {
  it("is 0 without reputation, regardless of money", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 0;
    Player.money = 1e15;
    expect(countPurchasableAugs(faction)).toBe(0);
  });

  it("is 0 without money, regardless of reputation", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.money = 0;
    expect(countPurchasableAugs(faction)).toBe(0);
  });

  it("counts unowned augs when both rep and money gates pass, and never exceeds the unowned count", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.money = 1e15;
    const count = countPurchasableAugs(faction);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(getUnownedFactionAugs(faction).length);
  });

  it("drops to 0 when everything is owned", () => {
    const faction = Factions[FactionName.CyberSec];
    faction.playerReputation = 1e12;
    Player.money = 1e15;
    ownAllAugs(FactionName.CyberSec);
    expect(countPurchasableAugs(faction)).toBe(0);
  });
});

describe("sortJoinedFactions", () => {
  it('applies no sort for the default "" mode (the game\'s standard order round-trips)', () => {
    const input = [Factions[FactionName.Sector12], Factions[FactionName.CyberSec], Factions[FactionName.NiteSec]];
    expect(sortJoinedFactions(input, "")).toEqual(input);
    expect(sortJoinedFactions(input, "not-a-mode")).toEqual(input);
  });

  it("does not mutate the input list", () => {
    const input = [Factions[FactionName.CyberSec], Factions[FactionName.NiteSec]];
    const copy = [...input];
    sortJoinedFactions(input, "reputation");
    expect(input).toEqual(copy);
  });

  it("sorts by reputation descending", () => {
    Factions[FactionName.CyberSec].playerReputation = 10;
    Factions[FactionName.NiteSec].playerReputation = 500;
    Factions[FactionName.Sector12].playerReputation = 100;
    const sorted = sortJoinedFactions(
      [Factions[FactionName.CyberSec], Factions[FactionName.NiteSec], Factions[FactionName.Sector12]],
      "reputation",
    );
    expect(sorted.map((f) => f.name)).toEqual([FactionName.NiteSec, FactionName.Sector12, FactionName.CyberSec]);
  });

  it("sorts by favor descending", () => {
    Factions[FactionName.CyberSec].setFavor(5);
    Factions[FactionName.NiteSec].setFavor(80);
    Factions[FactionName.Sector12].setFavor(20);
    const sorted = sortJoinedFactions(
      [Factions[FactionName.CyberSec], Factions[FactionName.NiteSec], Factions[FactionName.Sector12]],
      "favor",
    );
    expect(sorted.map((f) => f.name)).toEqual([FactionName.NiteSec, FactionName.Sector12, FactionName.CyberSec]);
  });

  it('sorts "closest" by rep delta to the next unowned aug, with all-owned factions last', () => {
    const cyberSec = Factions[FactionName.CyberSec];
    const niteSec = Factions[FactionName.NiteSec];
    const netburners = Factions[FactionName.Netburners];
    // CyberSec: 1 rep away from its cheapest aug.
    cyberSec.playerReputation = distinctRepCosts(FactionName.CyberSec)[0] - 1;
    // NiteSec: full delta (rep 0); its cheapest aug needs more than 1 rep.
    niteSec.playerReputation = 0;
    expect(distinctRepCosts(FactionName.NiteSec)[0]).toBeGreaterThan(1);
    // Netburners: everything owned → goes last.
    ownAllAugs(FactionName.Netburners);
    const sorted = sortJoinedFactions([netburners, niteSec, cyberSec], "closest");
    expect(sorted.map((f) => f.name)).toEqual([FactionName.CyberSec, FactionName.NiteSec, FactionName.Netburners]);
  });
});

describe("FactionCategories", () => {
  it("covers every faction in the FactionName enum", () => {
    for (const facName of Object.values(FactionName)) {
      expect(FactionCategories[facName]).toBeDefined();
    }
  });

  it("mirrors the FactionInfo.tsx group comments", () => {
    expect(FactionCategories[FactionName.Daedalus]).toBe(FactionCategory.Endgame);
    expect(FactionCategories[FactionName.Illuminati]).toBe(FactionCategory.Endgame);
    expect(FactionCategories[FactionName.MegaCorp]).toBe(FactionCategory.Corp);
    expect(FactionCategories[FactionName.FulcrumSecretTechnologies]).toBe(FactionCategory.Corp);
    expect(FactionCategories[FactionName.CyberSec]).toBe(FactionCategory.Hack);
    expect(FactionCategories[FactionName.BitRunners]).toBe(FactionCategory.Hack);
    expect(FactionCategories[FactionName.Sector12]).toBe(FactionCategory.City);
    expect(FactionCategories[FactionName.SlumSnakes]).toBe(FactionCategory.Crime);
    expect(FactionCategories[FactionName.TianDiHui]).toBe(FactionCategory.Early);
    expect(FactionCategories[FactionName.Bladeburners]).toBe(FactionCategory.Special);
  });
});

describe("Factions screen settings", () => {
  it("defaults to the game's standard order and no can-buy filter", () => {
    expect(Settings.FactionsSortMode).toBe("");
    expect(Settings.FactionsCanBuyOnly).toBe(false);
  });
});
