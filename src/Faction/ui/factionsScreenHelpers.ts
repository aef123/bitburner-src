/**
 * Pure (non-React) selectors for the redesigned Factions screen (design-notes-1A).
 *
 * Every derived value here is data the game's own screens already show:
 *  - "unowned augmentations" uses the exact filter the old FactionsRoot used for its
 *    "N Augmentations left" line (Player.hasAugmentation counts QUEUED augs as owned, because
 *    that is its default behavior and the behavior the old screen relied on),
 *  - rep requirements come from getAugCost, the same helper AugmentationsPage displays,
 *  - "purchasable now" mirrors AugmentationsPage's canPurchase gate verbatim
 *    (prereqs met AND rep met AND (free OR affordable)).
 */
import type { Faction } from "../Faction";

import { Player } from "@player";
import type { AugmentationName } from "@enums";

import { Augmentations } from "../../Augmentation/Augmentations";
import { getAugCost } from "../../Augmentation/AugmentationHelpers";
import { getFactionAugmentationsFiltered, hasAugmentationPrereqs } from "../FactionHelpers";

/** The next augmentation goal for a faction: the unowned aug with the lowest rep requirement. */
export interface NextAugGoal {
  augName: AugmentationName;
  repCost: number;
}

/**
 * Augs this faction offers that the player does not own yet.
 * Queued augmentations count as owned (Player.hasAugmentation includes the purchase queue by
 * default) — identical semantics to the old screen's "N Augmentations left" count.
 */
export function getUnownedFactionAugs(faction: Faction): AugmentationName[] {
  return getFactionAugmentationsFiltered(faction).filter((augName) => !Player.hasAugmentation(augName));
}

/**
 * The unowned augmentation with the lowest reputation requirement, or null when the player owns
 * everything the faction offers. The goal may already be rep-met (repCost below current rep) —
 * the row then renders a full bar with a zero delta.
 */
export function getNextAugGoal(faction: Faction): NextAugGoal | null {
  let goal: NextAugGoal | null = null;
  for (const augName of getUnownedFactionAugs(faction)) {
    const aug = Augmentations[augName];
    if (!aug) continue;
    const repCost = getAugCost(aug).repCost;
    if (goal === null || repCost < goal.repCost) {
      goal = { augName, repCost };
    }
  }
  return goal;
}

/** Reputation still missing toward a goal; clamped at 0 once the requirement is met. */
export function getRepGoalDelta(faction: Faction, goal: NextAugGoal): number {
  return Math.max(0, goal.repCost - faction.playerReputation);
}

/** Rep progress toward the goal as a 0-100 percentage (full bar once the requirement is met). */
export function getRepGoalProgress(faction: Faction, goal: NextAugGoal): number {
  if (goal.repCost <= 0) return 100;
  return Math.min(100, (faction.playerReputation / goal.repCost) * 100);
}

/**
 * Whether the player could buy this aug from this faction right now.
 * This is AugmentationsPage's canPurchase gate, verbatim.
 */
export function canPurchaseAugNow(faction: Faction, augName: AugmentationName): boolean {
  const aug = Augmentations[augName];
  if (!aug) return false;
  const costs = getAugCost(aug);
  return (
    hasAugmentationPrereqs(aug) &&
    faction.playerReputation >= costs.repCost &&
    (costs.moneyCost === 0 || Player.money >= costs.moneyCost)
  );
}

/** How many of the faction's unowned augs are purchasable right now. */
export function countPurchasableAugs(faction: Faction): number {
  return getUnownedFactionAugs(faction).filter((augName) => canPurchaseAugNow(faction, augName)).length;
}

/** Valid non-default values for Settings.FactionsSortMode ("" = the game's standard order). */
export const factionsSortModes = ["closest", "reputation", "favor"] as const;
export type FactionsSortMode = (typeof factionsSortModes)[number];

/**
 * Returns a sorted copy of the joined-factions list.
 * "" (or any unknown mode) applies no sort — the game's standard faction order is preserved.
 * Ties keep the incoming (standard) order: Array.prototype.sort is stable.
 */
export function sortJoinedFactions(factions: Faction[], mode: string): Faction[] {
  const sorted = [...factions];
  switch (mode) {
    case "closest": {
      // Smallest rep delta to the next unowned aug first; all-owned factions go last.
      const deltas = new Map<Faction, number>();
      for (const faction of sorted) {
        const goal = getNextAugGoal(faction);
        deltas.set(faction, goal === null ? Number.POSITIVE_INFINITY : getRepGoalDelta(faction, goal));
      }
      sorted.sort(
        (a, b) => (deltas.get(a) ?? Number.POSITIVE_INFINITY) - (deltas.get(b) ?? Number.POSITIVE_INFINITY),
      );
      break;
    }
    case "reputation":
      sorted.sort((a, b) => b.playerReputation - a.playerReputation);
      break;
    case "favor":
      sorted.sort((a, b) => b.favor - a.favor);
      break;
    default:
      break;
  }
  return sorted;
}
