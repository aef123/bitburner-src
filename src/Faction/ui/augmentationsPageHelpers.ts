/**
 * Pure (non-React) selectors for the redesigned Faction Augmentations screen (design-notes-1B).
 *
 * Honesty notes (nothing here invents data the game doesn't already expose):
 *  - the Purchasable/Locked/Owned partition classifies every aug — including NFG — by its real
 *    current rep state via getAugCost (the same rep numbers the cards display); owned = installed
 *    OR queued, except NFG which levels infinitely and is therefore never "owned",
 *  - the install-queue reconstruction replays the game's own price formula (getAugCost) over the
 *    queue order: queuedAugmentations only ever grows between installs, so the i-th non-SoA queued
 *    item was bought at generic multiplier base^i (base = getBaseAugmentationPriceMultiplier(),
 *    CONSTANTS.MultipleAugMultiplier adjusted by SF11). No new mechanics — just the constant the
 *    game already applies, unrolled per queue position.
 */
import type { Faction } from "../Faction";

import { Player } from "@player";
import { AugmentationName } from "@enums";

import type { Augmentation } from "../../Augmentation/Augmentation";
import { Augmentations } from "../../Augmentation/Augmentations";
import {
  getAugCost,
  getBaseAugmentationPriceMultiplier,
  soaAugmentationNames,
} from "../../Augmentation/AugmentationHelpers";
import { currentNodeMults } from "../../BitNode/BitNodeMultipliers";
import { CONSTANTS } from "../../Constants";

// ─── Tab partition ────────────────────────────────────────────────────────

export interface AugTabPartition {
  /** Unowned augs whose rep requirement is met (affordable or not). */
  purchasable: AugmentationName[];
  /** Unowned augs whose rep requirement is not met yet. */
  locked: AugmentationName[];
  /** Installed or queued augs — the old page's "owned" list, unchanged (never contains NFG). */
  owned: AugmentationName[];
}

/**
 * Splits a faction's aug list (already faction-filtered/sorted/text-filtered by the caller) into
 * the three sections. Owned matches the old page's "owned" list verbatim; everything else lands in
 * purchasable or locked based on its ACTUAL current rep requirement (getAugCost — the same numbers
 * the cards display).
 *
 * NFG special handling: it levels infinitely, so it is never "owned" — but it is otherwise
 * classified like any other aug. The old page's "NFG is always purchasable" special case is gone:
 * a user reported "NeuroFlux Governor - Level 12" shown as purchasable when its escalated rep
 * requirement was not actually met. getAugCost already returns the per-level escalated rep cost,
 * so rep-unmet NFG now lands in locked with an honest unlock progress bar.
 */
export function partitionAugs(faction: Faction, augNames: AugmentationName[]): AugTabPartition {
  const purchasable: AugmentationName[] = [];
  const locked: AugmentationName[] = [];
  const owned: AugmentationName[] = [];
  for (const augName of augNames) {
    const aug = Augmentations[augName];
    if (!aug) continue;
    const isOwned =
      augName !== AugmentationName.NeuroFluxGovernor &&
      (Player.augmentations.some((a) => a.name === augName) ||
        Player.queuedAugmentations.some((a) => a.name === augName));
    if (isOwned) {
      owned.push(augName);
      continue;
    }
    if (faction.playerReputation >= getAugCost(aug).repCost) {
      purchasable.push(augName);
    } else {
      locked.push(augName);
    }
  }
  return { purchasable, locked, owned };
}

// ─── Effect summary ───────────────────────────────────────────────────────

/**
 * One-line effect summary from the aug's existing stats string ("Effects:\n+75% ...\n+100% ...")
 * joined with middle dots. Falls back to the aug's info text when it has no stat lines — both are
 * strings the old page already displayed in full.
 */
export function getEffectSummary(aug: Augmentation): string {
  const lines = aug.stats
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line.toLowerCase() !== "effects:");
  if (lines.length > 0) return lines.join(" · ");
  return aug.info;
}

// ─── Locked progress ──────────────────────────────────────────────────────

/** Rep progress toward an aug's unlock as a 0-100 percentage (clamped once met). */
export function getUnlockProgress(faction: Faction, augName: AugmentationName): number {
  const aug = Augmentations[augName];
  if (!aug) return 0;
  const repCost = getAugCost(aug).repCost;
  if (repCost <= 0) return 100;
  return Math.min(100, (faction.playerReputation / repCost) * 100);
}

// ─── Install queue reconstruction ─────────────────────────────────────────

export interface QueueDisplayItem {
  name: AugmentationName;
  /** NFG level acquired by this queue entry; 0 for everything else. */
  level: number;
  /** Generic price multiplier that applied at purchase time (1 for SoA augs — they never snowball). */
  multiplier: number;
  /** Price paid: basePrice × multiplier. */
  price: number;
  /** Price without the generic snowball (what the aug would have cost first-in-queue). */
  basePrice: number;
}

/**
 * Replays the game's price formula over the queue in order. The queue only grows between installs
 * (install always empties it), so the i-th non-SoA entry was purchased at base^i.
 *
 * - Standard augs: basePrice = baseCost × AugmentationMoneyCost node mult (getAugCost's default branch).
 * - NFG: also × NeuroFluxGovernorLevelMult^(level-1) — the queued entry stores the level it bought.
 * - SoA augs: priced by SoACostMult^(SoA augs owned at purchase) and NOT affected by (nor counting
 *   toward) the generic multiplier — exactly getAugCost's SoA branch. Owned-at-purchase is
 *   reconstructed as installed SoA count + SoA entries earlier in the queue (Player.hasAugmentation
 *   counts queued augs).
 */
export function getQueueDisplayItems(): QueueDisplayItem[] {
  const base = getBaseAugmentationPriceMultiplier();
  const items: QueueDisplayItem[] = [];
  let nonSoAIndex = 0;
  let soaOwned = Player.augmentations.filter((aug) => soaAugmentationNames.includes(aug.name)).length;
  for (const queued of Player.queuedAugmentations) {
    const aug = Augmentations[queued.name];
    if (!aug) continue;
    if (soaAugmentationNames.includes(queued.name)) {
      const price = aug.baseCost * Math.pow(CONSTANTS.SoACostMult, soaOwned);
      items.push({ name: queued.name, level: 0, multiplier: 1, price, basePrice: price });
      soaOwned++;
      continue;
    }
    let basePrice = aug.baseCost * currentNodeMults.AugmentationMoneyCost;
    if (queued.name === AugmentationName.NeuroFluxGovernor) {
      basePrice =
        aug.baseCost *
        Math.pow(CONSTANTS.NeuroFluxGovernorLevelMult, Math.max(0, queued.level - 1)) *
        currentNodeMults.AugmentationMoneyCost;
    }
    const multiplier = Math.pow(base, nonSoAIndex);
    items.push({
      name: queued.name,
      level: queued.name === AugmentationName.NeuroFluxGovernor ? queued.level : 0,
      multiplier,
      price: basePrice * multiplier,
      basePrice,
    });
    nonSoAIndex++;
  }
  return items;
}

/** Total money spent on the queued augs (sum of reconstructed prices). */
export function getQueueTotal(items: QueueDisplayItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

/**
 * Color tone for a generic price multiplier, per the design notes' escalation:
 * ×1.00 → neutral, one snowball step (< base²) → gold warning, base² and beyond → red.
 * Thresholds derive from the game's own constant so they track SF11 discounts.
 */
export type MultiplierTone = "baseline" | "elevated" | "high";
export function getMultiplierTone(multiplier: number): MultiplierTone {
  const epsilon = 1e-9;
  if (multiplier <= 1 + epsilon) return "baseline";
  const base = getBaseAugmentationPriceMultiplier();
  if (multiplier < Math.pow(base, 2) - epsilon) return "elevated";
  return "high";
}
