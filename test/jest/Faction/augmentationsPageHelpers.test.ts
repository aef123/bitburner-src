/**
 * Tests for the pure selectors behind the redesigned Faction Augmentations screen (Task W7):
 *   - partitionAugs: Purchasable/Locked/Owned tab partition (union = old page's lists; NFG always
 *     purchasable; queued counts as owned),
 *   - getUnlockProgress: locked progress math,
 *   - getEffectSummary: one-line stats join,
 *   - getQueueDisplayItems/getQueueTotal: install-queue reconstruction replays getAugCost —
 *     multipliers escalate by the game's real constant (getBaseAugmentationPriceMultiplier),
 *   - getMultiplierTone thresholds.
 */
import { Player } from "@player";
import { AugmentationName, FactionName } from "@enums";

import { Augmentations } from "../../../src/Augmentation/Augmentations";
import {
  getAugCost,
  getBaseAugmentationPriceMultiplier,
} from "../../../src/Augmentation/AugmentationHelpers";
import { PlayerOwnedAugmentation } from "../../../src/Augmentation/PlayerOwnedAugmentation";
import { Factions } from "../../../src/Faction/Factions";
import {
  getEffectSummary,
  getMultiplierTone,
  getQueueDisplayItems,
  getQueueTotal,
  getUnlockProgress,
  partitionAugs,
} from "../../../src/Faction/ui/augmentationsPageHelpers";
import { getFactionAugmentationsFiltered } from "../../../src/Faction/FactionHelpers";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
});

const standardAugs = [
  AugmentationName.BitWire,
  AugmentationName.SynapticEnhancement,
  AugmentationName.SpeechProcessor,
] as const;

describe("partitionAugs", () => {
  it("partitions into locked (rep unmet) vs purchasable (rep met), union preserving the input", () => {
    const faction = Factions[FactionName.CyberSec];
    const augs = getFactionAugmentationsFiltered(faction);
    faction.playerReputation = 0;
    const atZero = partitionAugs(faction, augs);
    expect(atZero.owned).toHaveLength(0);
    // With zero rep, nothing except (possibly) NFG is purchasable.
    for (const augName of atZero.purchasable) {
      expect(augName).toBe(AugmentationName.NeuroFluxGovernor);
    }
    expect([...atZero.purchasable, ...atZero.locked, ...atZero.owned].sort()).toEqual([...augs].sort());

    faction.playerReputation = 1e12;
    const atMax = partitionAugs(faction, augs);
    expect(atMax.locked).toHaveLength(0);
    expect(atMax.purchasable.sort()).toEqual([...augs].sort());
  });

  it("keeps NFG purchasable regardless of reputation (old page's special case)", () => {
    const faction = Factions[FactionName.CyberSec];
    const augs = getFactionAugmentationsFiltered(faction);
    if (!augs.includes(AugmentationName.NeuroFluxGovernor)) return; // faction fixture must offer NFG
    faction.playerReputation = 0;
    const partition = partitionAugs(faction, augs);
    expect(partition.purchasable).toContain(AugmentationName.NeuroFluxGovernor);
    expect(partition.locked).not.toContain(AugmentationName.NeuroFluxGovernor);
  });

  it("moves installed AND queued augs to owned, exactly like the old page's owned list", () => {
    const faction = Factions[FactionName.CyberSec];
    const augs = getFactionAugmentationsFiltered(faction);
    faction.playerReputation = 1e12;
    const installed = augs.find((a) => a !== AugmentationName.NeuroFluxGovernor);
    const queued = augs.find((a) => a !== AugmentationName.NeuroFluxGovernor && a !== installed);
    if (!installed || !queued) throw new Error("Fixture faction needs at least two non-NFG augs");
    Player.augmentations.push(new PlayerOwnedAugmentation(installed));
    Player.queuedAugmentations.push(new PlayerOwnedAugmentation(queued));
    const partition = partitionAugs(faction, augs);
    expect(partition.owned).toContain(installed);
    expect(partition.owned).toContain(queued);
    expect(partition.purchasable).not.toContain(installed);
    expect(partition.purchasable).not.toContain(queued);
  });
});

describe("getUnlockProgress", () => {
  it("is the current-rep / rep-cost percentage, clamped at 100", () => {
    const faction = Factions[FactionName.CyberSec];
    const augName = getFactionAugmentationsFiltered(faction).find(
      (a) => a !== AugmentationName.NeuroFluxGovernor && getAugCost(Augmentations[a]).repCost > 0,
    );
    if (!augName) throw new Error("Fixture faction needs a rep-gated aug");
    const repCost = getAugCost(Augmentations[augName]).repCost;

    faction.playerReputation = 0;
    expect(getUnlockProgress(faction, augName)).toBe(0);
    faction.playerReputation = repCost / 2;
    expect(getUnlockProgress(faction, augName)).toBeCloseTo(50, 6);
    faction.playerReputation = repCost * 3;
    expect(getUnlockProgress(faction, augName)).toBe(100);
  });
});

describe("getEffectSummary", () => {
  it("joins the aug's existing stats lines with middle dots, dropping the Effects: header", () => {
    const aug = Augmentations[AugmentationName.BitWire];
    const expected = aug.stats
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && line.toLowerCase() !== "effects:")
      .join(" · ");
    expect(expected.length).toBeGreaterThan(0);
    expect(getEffectSummary(aug)).toBe(expected);
    expect(getEffectSummary(aug)).not.toContain("Effects:");
  });

  it("falls back to the aug's info text when there are no stat lines", () => {
    const aug = Augmentations[AugmentationName.BitWire];
    const bare = Object.create(aug) as typeof aug;
    Object.defineProperty(bare, "stats", { value: "Effects:" });
    expect(getEffectSummary(bare)).toBe(aug.info);
  });
});

describe("install queue reconstruction", () => {
  it("replays getAugCost: recorded price at each purchase equals the reconstructed price", () => {
    const recorded: number[] = [];
    for (const augName of standardAugs) {
      // Record what the game itself charges at this queue depth, then queue (the real flow).
      recorded.push(getAugCost(Augmentations[augName]).moneyCost);
      Player.queueAugmentation(augName);
    }
    const items = getQueueDisplayItems();
    expect(items.map((i) => i.name)).toEqual([...standardAugs]);
    items.forEach((item, i) => {
      expect(item.price).toBeCloseTo(recorded[i], 6);
    });
  });

  it("escalates multipliers by the game's price-mult constant per queue position", () => {
    const base = getBaseAugmentationPriceMultiplier();
    for (const augName of standardAugs) Player.queueAugmentation(augName);
    const items = getQueueDisplayItems();
    expect(items.map((i) => i.multiplier)).toEqual([1, base, Math.pow(base, 2)]);
    items.forEach((item) => {
      expect(item.price).toBeCloseTo(item.basePrice * item.multiplier, 6);
    });
  });

  it("prices queued NFG levels with the level multiplier the game charged", () => {
    const nfg = Augmentations[AugmentationName.NeuroFluxGovernor];
    const recorded: number[] = [];
    for (let i = 0; i < 2; i++) {
      recorded.push(getAugCost(nfg).moneyCost);
      Player.queueAugmentation(AugmentationName.NeuroFluxGovernor);
    }
    const items = getQueueDisplayItems();
    expect(items).toHaveLength(2);
    expect(items[0].level).toBe(1);
    expect(items[1].level).toBe(2);
    expect(items[0].price).toBeCloseTo(recorded[0], 6);
    expect(items[1].price).toBeCloseTo(recorded[1], 6);
  });

  it("totals the reconstructed prices", () => {
    for (const augName of standardAugs) Player.queueAugmentation(augName);
    const items = getQueueDisplayItems();
    expect(getQueueTotal(items)).toBeCloseTo(items.reduce((sum, i) => sum + i.price, 0), 6);
    expect(getQueueTotal([])).toBe(0);
  });
});

describe("getMultiplierTone", () => {
  it("is baseline at ×1, elevated after one queued aug, high from base² up", () => {
    const base = getBaseAugmentationPriceMultiplier();
    expect(getMultiplierTone(1)).toBe("baseline");
    expect(getMultiplierTone(base)).toBe("elevated");
    expect(getMultiplierTone(Math.pow(base, 2))).toBe("high");
    expect(getMultiplierTone(Math.pow(base, 5))).toBe("high");
  });
});
