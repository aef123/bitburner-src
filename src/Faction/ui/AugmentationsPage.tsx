/**
 * Faction Augmentations screen (UI refresh Task W7, design-notes-1B).
 *
 * Layout: context strip (faction name + rep/favor/price-multiplier cluster) → tabs
 * Purchasable/Locked/Owned with count badges → 2-col purchasable cards / dimmed locked cards with
 * unlock progress / owned chip cloud → install-queue sidebar (312px) reconstructing the price
 * snowball from the game's own multiplier constant.
 *
 * The purchase flow is the old page's, verbatim: the Buy button either opens
 * PurchaseAugmentationModal or (with Settings.SuppressBuyAugmentationConfirmation) calls
 * purchaseAugmentation directly — in the game's model buying pays NOW and queues the aug for
 * install, so the button says "Buy", not the mock's "Queue". The install button is
 * AugmentationsRoot's flow: ConfirmationModal (same suppression setting) → installAugmentations().
 * canPurchaseAugNow (factionsScreenHelpers) is the single purchasability gate for cards, tags,
 * and the purchasable-first sort.
 */
import React, { useMemo, useState } from "react";
import { Info, Lock, NewReleases } from "@mui/icons-material";
import { Tooltip, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { AugmentationName, FactionName } from "@enums";

import type { Augmentation } from "../../Augmentation/Augmentation";
import { Augmentations } from "../../Augmentation/Augmentations";
import {
  getAugCost,
  getGenericAugmentationPriceMultiplier,
  installAugmentations,
} from "../../Augmentation/AugmentationHelpers";
import { PurchaseAugmentationModal } from "../../Augmentation/ui/PurchaseAugmentationModal";
import { CONSTANTS } from "../../Constants";
import { PurchaseAugmentationsOrderSetting } from "../../Settings/SettingEnums";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { addRepToFavor } from "../formulas/favor";
import MathNotation from "../../Documentation/data/MathNotation.json";
import { MathNotationOutput } from "../../Documentation/ui/MathNotationOutput";
import { formatFavor, formatMoney, formatMultiplier, formatReputation } from "../../ui/formatNumber";
import { Router } from "../../ui/GameRoot";
import { ConfirmationModal } from "../../ui/React/ConfirmationModal";
import { Favor } from "../../ui/React/Favor";
import { useRerender } from "../../ui/React/hooks";

import { Faction } from "../Faction";
import { getFactionAugmentationsFiltered, hasAugmentationPrereqs, purchaseAugmentation } from "../FactionHelpers";
import {
  getEffectSummary,
  getMultiplierTone,
  getQueueDisplayItems,
  getQueueTotal,
  getUnlockProgress,
  partitionAugs,
  type MultiplierTone,
} from "./augmentationsPageHelpers";
import { canPurchaseAugNow } from "./factionsScreenHelpers";

type AugTab = "purchasable" | "locked" | "owned";

const OWNED_COLLAPSED_COUNT = 6;

// ─── Styles ───────────────────────────────────────────────────────────────

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  const mono = Settings.styles.monoFontFamily;
  const borderCard = theme.colors.borderCard as string;
  const borderDefault = theme.colors.borderDefault as string;
  const accentCyan = theme.colors.accentCyan as string;
  const accentGreen = theme.colors.accentGreen as string;
  const accentGold = theme.colors.accentGold as string;
  const accentRed = theme.colors.accentRed as string;
  return {
    page: {
      display: "flex",
      alignItems: "stretch",
      gap: 0,
      maxWidth: "1340px",
    },
    main: {
      flex: 1,
      minWidth: 0,
      paddingRight: "26px",
      paddingBottom: "40px",
    },
    backButton: {
      fontFamily: "inherit",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      background: "none",
      border: "none",
      padding: "0 0 12px 0",
      cursor: "pointer",
      "&:hover": {
        color: theme.colors.textBody,
      },
    },
    // Context strip
    contextStrip: {
      display: "flex",
      alignItems: "center",
      gap: "20px",
      marginBottom: "20px",
      flexWrap: "wrap",
    },
    pageLabel: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      marginBottom: "2px",
    },
    infoIcon: {
      color: theme.colors.textTertiary,
      fontSize: "16px",
    },
    factionName: {
      fontSize: typeScale.title,
      fontWeight: 700,
      color: theme.colors.textPrimary,
    },
    stripSpacer: {
      flex: 1,
    },
    statCluster: {
      display: "flex",
      gap: "24px",
      backgroundColor: theme.colors.bgPanel,
      border: `1px solid ${borderCard}`,
      borderRadius: "10px",
      padding: "10px 18px",
    },
    statLabel: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
    },
    statValue: {
      fontFamily: mono,
      fontSize: typeScale.value,
      fontWeight: 600,
      color: theme.colors.textBody,
    },
    statValueRep: {
      color: accentCyan,
    },
    // Tab bar
    tabRow: {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      borderBottom: `1px solid ${borderDefault}`,
      marginBottom: "14px",
    },
    tab: {
      fontFamily: "inherit",
      fontSize: typeScale.body,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      background: "none",
      border: "none",
      borderBottom: "2px solid transparent",
      padding: "9px 14px",
      cursor: "pointer",
      transition: "color 120ms ease-out",
      "&:hover": {
        color: theme.colors.textBody,
      },
    },
    tabActive: {
      fontWeight: 600,
      color: accentCyan,
      borderBottomColor: accentCyan,
      "&:hover": {
        color: accentCyan,
      },
    },
    tabBadge: {
      fontFamily: mono,
      fontSize: typeScale.caption,
      backgroundColor: theme.colors.bgPanelDeep,
      borderRadius: "10px",
      padding: "2px 7px",
      marginLeft: "4px",
    },
    tabBadgeActive: {
      backgroundColor: theme.colors.bgActive,
    },
    filterInput: {
      fontFamily: "inherit",
      fontSize: typeScale.caption,
      color: theme.colors.textBody,
      backgroundColor: theme.colors.bgPanelDeep,
      border: `1px solid ${borderCard}`,
      borderRadius: "6px",
      padding: "6px 10px",
      width: "220px",
      outline: "none",
      "&::placeholder": {
        color: theme.colors.textTertiary,
      },
      "&:focus": {
        borderColor: theme.colors.borderFocus,
      },
    },
    // Sort pills
    toolbar: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "18px",
      flexWrap: "wrap",
    },
    toolbarLabel: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
    },
    sortPill: {
      fontFamily: "inherit",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      background: "none",
      border: `1px solid ${borderCard}`,
      borderRadius: "20px",
      padding: "4px 12px",
      cursor: "pointer",
      transition: "border-color 120ms ease-out, color 120ms ease-out",
      "&:hover": {
        borderColor: theme.colors.borderFocus,
        color: theme.colors.textBody,
      },
    },
    sortPillActive: {
      color: theme.colors.bgApp,
      backgroundColor: accentCyan,
      borderColor: accentCyan,
      "&:hover": {
        color: theme.colors.bgApp,
        borderColor: accentCyan,
      },
    },
    // Purchasable cards
    cardGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "14px",
      marginBottom: "22px",
    },
    augCard: {
      backgroundColor: theme.colors.bgPanel,
      border: `1px solid ${borderCard}`,
      borderRadius: "12px",
      padding: "16px 18px",
      minWidth: 0,
      transition: "border-color 120ms ease-out",
    },
    augCardReady: {
      borderColor: alpha(accentGreen, 0.35),
    },
    cardHeader: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "10px",
      marginBottom: "8px",
    },
    augName: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: typeScale.cardTitle,
      fontWeight: 600,
      color: theme.colors.textPrimary,
      minWidth: 0,
    },
    augNameText: {
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    exclusiveIcon: {
      flex: "none",
      color: Settings.theme.money,
      transform: "rotate(180deg)",
      fontSize: "16px",
    },
    statusTag: {
      flex: "none",
      fontFamily: mono,
      fontSize: typeScale.eyebrow,
      fontWeight: 600,
      letterSpacing: ".1em",
      borderRadius: "4px",
      padding: "3px 7px",
      whiteSpace: "nowrap",
    },
    statusReady: {
      color: accentGreen,
      backgroundColor: alpha(accentGreen, 0.08),
      border: `1px solid ${alpha(accentGreen, 0.3)}`,
    },
    statusCantAfford: {
      color: accentRed,
      backgroundColor: alpha(accentRed, 0.08),
      border: `1px solid ${alpha(accentRed, 0.3)}`,
    },
    effectSummary: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      lineHeight: 1.55,
      color: theme.colors.textSecondary,
      marginBottom: "12px",
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    requirementRow: {
      display: "flex",
      alignItems: "center",
      gap: "14px",
      flexWrap: "wrap",
    },
    requirement: {
      display: "flex",
      alignItems: "center",
      gap: "5px",
      fontFamily: mono,
      fontSize: typeScale.caption,
      fontWeight: 600,
      whiteSpace: "nowrap",
    },
    requirementMet: {
      color: accentGreen,
    },
    requirementUnmet: {
      color: accentRed,
    },
    moneyValue: {
      color: accentGold,
    },
    requirementSpacer: {
      flex: 1,
    },
    buyButton: {
      flex: "none",
      height: "30px",
      padding: "0 16px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: accentGreen,
      color: theme.colors.bgApp,
      fontFamily: "inherit",
      fontSize: typeScale.body,
      fontWeight: 600,
      cursor: "pointer",
      transition: "filter 120ms ease-out",
      "&:hover": {
        filter: "brightness(1.1)",
      },
    },
    buyButtonDisabled: {
      backgroundColor: "transparent",
      border: `1px solid ${borderCard}`,
      color: theme.colors.textTertiary,
      cursor: "default",
      "&:hover": {
        filter: "none",
      },
    },
    // Locked cards
    lockedList: {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      marginBottom: "22px",
    },
    lockedCard: {
      display: "flex",
      alignItems: "center",
      gap: "14px",
      backgroundColor: theme.colors.bgPanelDeep,
      border: `1px solid ${borderDefault}`,
      borderRadius: "12px",
      padding: "16px 18px",
      opacity: 0.8,
    },
    lockIcon: {
      flex: "none",
      color: theme.colors.textTertiary,
      fontSize: "16px",
    },
    lockedText: {
      flex: 1,
      minWidth: 0,
    },
    lockedName: {
      fontSize: typeScale.body,
      fontWeight: 600,
      color: theme.colors.textSecondary,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    lockedEffect: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
      marginTop: "1px",
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    unlockBlock: {
      width: "280px",
      flex: "none",
    },
    unlockLabels: {
      display: "flex",
      justifyContent: "space-between",
      gap: "10px",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
      marginBottom: "4px",
    },
    unlockCurrent: {
      fontFamily: mono,
    },
    unlockTrack: {
      height: "4px",
      borderRadius: "2px",
      backgroundColor: theme.colors.track,
      overflow: "hidden",
    },
    unlockFill: {
      height: "100%",
      backgroundColor: accentCyan,
      transition: "width 300ms ease-out",
    },
    // Owned chip cloud
    ownedCloud: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap",
      backgroundColor: theme.colors.bgPanelDeep,
      border: `1px solid ${borderDefault}`,
      borderRadius: "12px",
      padding: "14px 18px",
      marginBottom: "22px",
    },
    ownedChip: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      backgroundColor: theme.colors.bgPanel,
      borderRadius: "6px",
      padding: "4px 9px",
    },
    ownedExpander: {
      fontFamily: "inherit",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: accentCyan,
      background: "none",
      border: "none",
      padding: "4px 6px",
      cursor: "pointer",
    },
    emptyText: {
      fontSize: typeScale.body,
      color: theme.colors.textTertiary,
      marginBottom: "22px",
    },
    // Install queue sidebar
    sidebar: {
      width: "312px",
      flex: "none",
      borderLeft: `1px solid ${borderDefault}`,
      backgroundColor: theme.colors.bgSidebar,
      padding: "22px 20px",
      display: "flex",
      flexDirection: "column",
      alignSelf: "stretch",
    },
    sidebarTitle: {
      fontSize: typeScale.body,
      fontWeight: 600,
      color: theme.colors.textPrimary,
      marginBottom: "4px",
    },
    sidebarExplain: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      lineHeight: 1.5,
      color: theme.colors.textSecondary,
      marginBottom: "16px",
    },
    queueList: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },
    queueItem: {
      backgroundColor: theme.colors.bgPanel,
      border: `1px solid ${borderCard}`,
      borderRadius: "10px",
      padding: "12px 14px",
    },
    queueItemHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "8px",
    },
    queueItemName: {
      fontSize: typeScale.caption,
      fontWeight: 600,
      color: theme.colors.textBody,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    queueMultiplier: {
      flex: "none",
      fontFamily: mono,
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
    },
    queueMultiplierElevated: {
      color: accentGold,
    },
    queueMultiplierHigh: {
      color: accentRed,
    },
    queuePrice: {
      fontFamily: mono,
      fontSize: typeScale.caption,
      fontWeight: 600,
      color: accentGold,
      marginTop: "4px",
    },
    queueBasePrice: {
      fontWeight: 400,
      color: alpha(accentGold, 0.55),
      textDecoration: "line-through",
      marginLeft: "6px",
    },
    queueDivider: {
      height: "1px",
      backgroundColor: borderDefault,
      margin: "16px 0",
    },
    queueTotalRow: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
    },
    queueTotalValue: {
      fontFamily: mono,
      fontWeight: 700,
      color: accentGold,
    },
    queueEmpty: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
    },
    sidebarSpacer: {
      flex: 1,
    },
    installButton: {
      height: "38px",
      borderRadius: "9px",
      border: "none",
      backgroundColor: accentCyan,
      color: theme.colors.bgApp,
      fontFamily: "inherit",
      fontSize: typeScale.body,
      fontWeight: 600,
      cursor: "pointer",
      marginTop: "18px",
      transition: "filter 120ms ease-out",
      "&:hover": {
        filter: "brightness(1.1)",
      },
    },
    installButtonDisabled: {
      backgroundColor: "transparent",
      border: `1px solid ${borderCard}`,
      color: theme.colors.textTertiary,
      cursor: "default",
      "&:hover": {
        filter: "none",
      },
    },
  };
});

// ─── Small pieces ─────────────────────────────────────────────────────────

/** Full aug description for tooltips: the info + stats text the old page showed. */
function AugDescriptionTooltip({ aug, children }: { aug: Augmentation; children: React.ReactElement }) {
  return (
    <Tooltip
      title={
        <>
          <Typography variant="h5">
            {aug.name}
            {aug.name === AugmentationName.NeuroFluxGovernor && ` - Level ${aug.getLevel() + 1}`}
          </Typography>
          <Typography whiteSpace="pre-wrap">
            {aug.info}
            {aug.stats && (
              <>
                <br />
                <br />
                {aug.stats}
              </>
            )}
          </Typography>
        </>
      }
    >
      {children}
    </Tooltip>
  );
}

/** Exclusivity marker: same conditions and disclosures as the old page's Exclusive icon. */
function ExclusiveMarker({ aug, className }: { aug: Augmentation; className: string }): React.ReactElement | null {
  if (aug.factions.length !== 1) return null;
  return (
    <Tooltip
      title={
        <>
          <Typography sx={{ color: Settings.theme.money }}>
            This Augmentation can only be acquired from the following source(s):
          </Typography>
          <ul>
            <Typography sx={{ color: Settings.theme.money }}>
              <li>
                <b>{aug.factions[0]}</b> faction
              </li>
              {Player.isAwareOfGang() && !aug.isSpecial && (
                <li>
                  Certain <b>gangs</b>
                </li>
              )}
              {Player.canAccessGrafting() &&
                (!aug.isSpecial || aug.factions.includes(FactionName.Bladeburners)) &&
                aug.name !== AugmentationName.TheRedPill && (
                  <li>
                    <b>Grafting</b>
                  </li>
                )}
            </Typography>
          </ul>
        </>
      }
    >
      <NewReleases className={className} />
    </Tooltip>
  );
}

// ─── Purchasable card ─────────────────────────────────────────────────────

interface PurchasableCardProps {
  faction: Faction;
  augName: AugmentationName;
  rerender: () => void;
}

function PurchasableCard({ faction, augName, rerender }: PurchasableCardProps): React.ReactElement | null {
  const { classes, cx } = useStyles();
  const [modalOpen, setModalOpen] = useState(false);
  const aug = Augmentations[augName];
  if (!aug) return null;

  // THE purchasability gate — same helper the Factions screen pill uses (single source).
  const ready = canPurchaseAugNow(faction, augName);
  const costs = getAugCost(aug);
  const moneyMet = costs.moneyCost === 0 || Player.money >= costs.moneyCost;
  const repMet = faction.playerReputation >= costs.repCost;
  const prereqsMet = hasAugmentationPrereqs(aug);

  /** The old page's purchase flow, verbatim: confirmation modal unless suppressed. */
  function buy(): void {
    if (!ready) return;
    if (!Settings.SuppressBuyAugmentationConfirmation) {
      setModalOpen(true);
    } else {
      purchaseAugmentation(faction, aug);
      rerender();
    }
  }

  const displayName = `${aug.name}${
    aug.name === AugmentationName.NeuroFluxGovernor ? ` - Level ${aug.getLevel() + 1}` : ""
  }`;

  return (
    <div className={cx(classes.augCard, ready && classes.augCardReady)} data-aug-card={augName}>
      <div className={classes.cardHeader}>
        <AugDescriptionTooltip aug={aug}>
          <span className={classes.augName}>
            <span className={classes.augNameText}>{displayName}</span>
          </span>
        </AugDescriptionTooltip>
        <ExclusiveMarker aug={aug} className={classes.exclusiveIcon} />
        <span
          className={cx(classes.statusTag, ready ? classes.statusReady : classes.statusCantAfford)}
          data-aug-status={ready ? "ready" : "cant-afford"}
        >
          {ready ? "READY" : "CAN'T AFFORD"}
        </span>
      </div>

      <AugDescriptionTooltip aug={aug}>
        <div className={classes.effectSummary}>{getEffectSummary(aug)}</div>
      </AugDescriptionTooltip>

      <div className={classes.requirementRow}>
        <span className={cx(classes.requirement, moneyMet ? classes.requirementMet : classes.requirementUnmet)}>
          {moneyMet ? "✓" : "✗"}
          <span className={moneyMet ? classes.moneyValue : undefined}>{formatMoney(costs.moneyCost)}</span>
        </span>
        <span className={cx(classes.requirement, repMet ? classes.requirementMet : classes.requirementUnmet)}>
          {repMet ? "✓" : "✗"} {formatReputation(costs.repCost)} rep
        </span>
        {aug.prereqs.length > 0 && (
          <Tooltip
            title={
              <>
                <Typography>This Augmentation has the following pre-requisite(s):</Typography>
                {aug.prereqs.map((preReq) => (
                  <Typography
                    key={preReq}
                    sx={{ color: Player.hasAugmentation(preReq) ? Settings.theme.successlight : Settings.theme.error }}
                  >
                    {Player.hasAugmentation(preReq) ? "✓" : "✗"} {preReq}
                  </Typography>
                ))}
              </>
            }
          >
            <span className={cx(classes.requirement, prereqsMet ? classes.requirementMet : classes.requirementUnmet)}>
              {prereqsMet ? "✓" : "✗"} prereqs
            </span>
          </Tooltip>
        )}
        <span className={classes.requirementSpacer} />
        <button
          type="button"
          className={cx(classes.buyButton, !ready && classes.buyButtonDisabled)}
          disabled={!ready}
          data-buy-button={augName}
          onClick={buy}
        >
          Buy
        </button>
      </div>

      {Settings.SuppressBuyAugmentationConfirmation || (
        <PurchaseAugmentationModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            rerender();
          }}
          faction={faction}
          aug={aug}
        />
      )}
    </div>
  );
}

// ─── Locked card ──────────────────────────────────────────────────────────

function LockedCard({ faction, augName }: { faction: Faction; augName: AugmentationName }): React.ReactElement | null {
  const { classes } = useStyles();
  const aug = Augmentations[augName];
  if (!aug) return null;
  const repCost = getAugCost(aug).repCost;
  const percent = getUnlockProgress(faction, augName);

  return (
    <div className={classes.lockedCard} data-locked-card={augName}>
      <Lock className={classes.lockIcon} />
      <div className={classes.lockedText}>
        <AugDescriptionTooltip aug={aug}>
          <div className={classes.lockedName}>{aug.name}</div>
        </AugDescriptionTooltip>
        <div className={classes.lockedEffect}>{getEffectSummary(aug)}</div>
      </div>
      <div className={classes.unlockBlock}>
        <div className={classes.unlockLabels}>
          <span>Unlocks at {formatReputation(repCost)} rep</span>
          <span className={classes.unlockCurrent}>{formatReputation(faction.playerReputation)}</span>
        </div>
        <div className={classes.unlockTrack}>
          <div className={classes.unlockFill} data-unlock-fill={augName} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Owned chip cloud ─────────────────────────────────────────────────────

function OwnedCloud({ augNames }: { augNames: AugmentationName[] }): React.ReactElement {
  const { classes } = useStyles();
  const [expanded, setExpanded] = useState(false);

  if (augNames.length === 0) {
    return <Typography className={classes.emptyText}>You do not own any augmentations from this faction.</Typography>;
  }

  const visible = expanded ? augNames : augNames.slice(0, OWNED_COLLAPSED_COUNT);
  const hidden = augNames.length - visible.length;

  return (
    <div className={classes.ownedCloud} data-owned-cloud>
      {visible.map((augName) => (
        <span key={augName} className={classes.ownedChip} data-owned-chip={augName}>
          {augName}
        </span>
      ))}
      {hidden > 0 && (
        <button type="button" className={classes.ownedExpander} data-owned-expander onClick={() => setExpanded(true)}>
          + {hidden} more
        </button>
      )}
      {expanded && augNames.length > OWNED_COLLAPSED_COUNT && (
        <button type="button" className={classes.ownedExpander} data-owned-collapser onClick={() => setExpanded(false)}>
          show less
        </button>
      )}
    </div>
  );
}

// ─── Install queue sidebar ────────────────────────────────────────────────

const multiplierToneClass: Record<MultiplierTone, "queueMultiplier" | "queueMultiplierElevated" | "queueMultiplierHigh"> =
  {
    baseline: "queueMultiplier",
    elevated: "queueMultiplierElevated",
    high: "queueMultiplierHigh",
  };

function InstallQueueSidebar(): React.ReactElement {
  const { classes, cx } = useStyles();
  const [installOpen, setInstallOpen] = useState(false);
  const items = getQueueDisplayItems();
  const total = getQueueTotal(items);

  /** AugmentationsRoot's install flow: confirmation modal unless suppressed, then the real install. */
  function doInstall(): void {
    if (items.length === 0) return;
    if (!Settings.SuppressBuyAugmentationConfirmation) {
      setInstallOpen(true);
    } else {
      installAugmentations();
    }
  }

  return (
    <aside className={classes.sidebar} data-install-sidebar>
      <div className={classes.sidebarTitle}>Install queue</div>
      <div className={classes.sidebarExplain}>
        The price of every Augmentation increases for every queued Augmentation and is reset when you install them.
        Installing resets the run.
      </div>

      {items.length > 0 ? (
        <>
          <div className={classes.queueList}>
            {items.map((item, index) => {
              const tone = getMultiplierTone(item.multiplier);
              return (
                <div key={`${item.name}-${index}`} className={classes.queueItem} data-queue-item={item.name}>
                  <div className={classes.queueItemHeader}>
                    <span className={classes.queueItemName}>
                      {item.name}
                      {item.level > 0 && ` - Level ${item.level}`}
                    </span>
                    <span
                      className={cx(classes.queueMultiplier, classes[multiplierToneClass[tone]])}
                      data-queue-mult={formatMultiplier(item.multiplier)}
                    >
                      × {formatMultiplier(item.multiplier)}
                    </span>
                  </div>
                  <div className={classes.queuePrice}>
                    {formatMoney(item.price)}
                    {item.multiplier > 1 && <span className={classes.queueBasePrice}>{formatMoney(item.basePrice)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={classes.queueDivider} />
          <div className={classes.queueTotalRow}>
            <span>Total</span>
            <span className={classes.queueTotalValue} data-queue-total>
              {formatMoney(total)}
            </span>
          </div>
        </>
      ) : (
        <div className={classes.queueEmpty} data-queue-empty>
          Nothing queued yet. Purchased augmentations wait here until you install them.
        </div>
      )}

      <span className={classes.sidebarSpacer} />
      <button
        type="button"
        className={cx(classes.installButton, items.length === 0 && classes.installButtonDisabled)}
        disabled={items.length === 0}
        data-install-button
        onClick={doInstall}
      >
        Install {items.length} augmentation{items.length === 1 ? "" : "s"}
      </button>

      <ConfirmationModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onConfirm={() => installAugmentations()}
        confirmationText={
          <>
            Installing will reset
            <br />
            <br />- money
            <br />- skill / experience
            <br />- every server except home
            <br />- factions and reputation
            <br />- current work activity
            <br />
            <br />
            You will keep:
            <br />
            <br />- All scripts on home
            <br />- home ram and cores
            <br />
            <br />
            It is recommended to install several Augmentations at once.
          </>
        }
      />
    </aside>
  );
}

// ─── Context strip ────────────────────────────────────────────────────────

function StatCluster({ faction }: { faction: Faction }): React.ReactElement {
  const { classes, cx } = useStyles();
  const isSoA = faction.name === FactionName.ShadowsOfAnarchy;
  // SoA count over the faction's full aug list (not the text-filtered one) — same numbers the old
  // page's multiplier block derived.
  const soaOwnedCount = isSoA
    ? getFactionAugmentationsFiltered(faction).filter((augName) => Player.hasAugmentation(augName)).length
    : 0;
  const priceMult = isSoA ? Math.pow(CONSTANTS.SoACostMult, soaOwnedCount) : getGenericAugmentationPriceMultiplier();
  const tone = getMultiplierTone(priceMult);
  const priceMultColor =
    tone === "baseline"
      ? (Settings.theme.accentGreen )
      : tone === "elevated"
        ? (Settings.theme.accentGold )
        : (Settings.theme.accentRed );

  return (
    <div className={classes.statCluster}>
      <Tooltip
        title={
          <>
            <Typography>
              You will have <Favor favor={addRepToFavor(faction.favor, faction.playerReputation)} /> faction favor after
              installing an Augmentation.
            </Typography>
            <Typography style={{ fontSize: "2rem" }}>r = Total faction reputation</Typography>
            <MathNotationOutput notation={MathNotation.RepToFavor} />
          </>
        }
      >
        <div>
          <div className={classes.statLabel}>Reputation</div>
          <div className={cx(classes.statValue, classes.statValueRep)}>
            {formatReputation(faction.playerReputation)}
          </div>
        </div>
      </Tooltip>
      <Tooltip
        title={
          <>
            <Typography>
              Faction favor increases the rate at which you earn reputation for this faction by 1% per favor. Faction
              favor is gained whenever you install an Augmentation. The amount of favor you gain depends on the total
              amount of reputation you earned with this faction across all resets.
            </Typography>
            <Typography style={{ fontSize: "2rem" }}>r = Reputation gain</Typography>
            <MathNotationOutput notation={MathNotation.FavorBonus} />
          </>
        }
      >
        <div>
          <div className={classes.statLabel}>Favor</div>
          <div className={classes.statValue}>{formatFavor(faction.favor)}</div>
        </div>
      </Tooltip>
      <Tooltip
        title={
          <Typography>
            {isSoA
              ? `This price multiplier increases for each ${FactionName.ShadowsOfAnarchy} augmentation already ` +
                "purchased. The multiplier is NOT reset when installing augmentations."
              : "The price of every Augmentation increases for every queued Augmentation and it is reset when you " +
                "install them."}
          </Typography>
        }
      >
        <div>
          <div className={classes.statLabel}>Price multiplier</div>
          <div className={classes.statValue} style={{ color: priceMultColor }} data-price-mult>
            × {formatMultiplier(priceMult)}
          </div>
        </div>
      </Tooltip>
      {isSoA && (
        <div>
          <div className={classes.statLabel}>Rep multiplier</div>
          <div className={classes.statValue}>× {formatMultiplier(Math.pow(CONSTANTS.SoARepMult, soaOwnedCount))}</div>
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────

const sortLabels: Record<PurchaseAugmentationsOrderSetting, string> = {
  [PurchaseAugmentationsOrderSetting.Default]: "Default",
  [PurchaseAugmentationsOrderSetting.Cost]: "Cost",
  [PurchaseAugmentationsOrderSetting.Reputation]: "Reputation",
  [PurchaseAugmentationsOrderSetting.Purchasable]: "Purchasable",
};
const sortOrder: PurchaseAugmentationsOrderSetting[] = [
  PurchaseAugmentationsOrderSetting.Default,
  PurchaseAugmentationsOrderSetting.Cost,
  PurchaseAugmentationsOrderSetting.Reputation,
  PurchaseAugmentationsOrderSetting.Purchasable,
];

/** Root React Component for displaying a faction's "Purchase Augmentations" page */
export function AugmentationsPage({ faction }: { faction: Faction }): React.ReactElement {
  const { classes, cx } = useStyles();
  const rerender = useRerender(400);
  const [filterText, setFilterText] = useState("");
  const [activeTab, setActiveTab] = useState<AugTab>("purchasable");

  const matches = (s1: string, s2: string) => s1.toLowerCase().includes(s2.toLowerCase());
  const factionAugs = useMemo(() => getFactionAugmentationsFiltered(faction), [faction]);
  const filteredFactionAugs = useMemo(
    () =>
      factionAugs.filter(
        (aug: AugmentationName) =>
          !filterText ||
          matches(Augmentations[aug].name, filterText) ||
          matches(Augmentations[aug].info, filterText) ||
          matches(Augmentations[aug].stats, filterText),
      ),
    [filterText, factionAugs],
  );

  /** The page's existing sort options, with canPurchaseAugNow as the single purchasable gate. */
  function getAugsSorted(): AugmentationName[] {
    const augs = [...filteredFactionAugs];
    const byCost = (a: AugmentationName, b: AugmentationName) =>
      getAugCost(Augmentations[a]).moneyCost - getAugCost(Augmentations[b]).moneyCost;
    const byRep = (a: AugmentationName, b: AugmentationName) =>
      getAugCost(Augmentations[a]).repCost - getAugCost(Augmentations[b]).repCost;
    switch (Settings.PurchaseAugmentationsOrder) {
      case PurchaseAugmentationsOrderSetting.Cost:
        return augs.sort(byCost);
      case PurchaseAugmentationsOrderSetting.Reputation:
        return augs.sort(byRep);
      case PurchaseAugmentationsOrderSetting.Purchasable: {
        const buyable = augs.filter((augName) => canPurchaseAugNow(faction, augName)).sort(byCost);
        const rest = augs.filter((augName) => !canPurchaseAugNow(faction, augName)).sort(byRep);
        return buyable.concat(rest);
      }
      default:
        return augs;
    }
  }

  function switchSortOrder(newOrder: PurchaseAugmentationsOrderSetting): void {
    Settings.PurchaseAugmentationsOrder = newOrder;
    rerender();
  }

  const augs = getAugsSorted();
  const partition = partitionAugs(faction, augs);
  const tabs: { id: AugTab; label: string; count: number }[] = [
    { id: "purchasable", label: "Purchasable", count: partition.purchasable.length },
    { id: "locked", label: "Locked", count: partition.locked.length },
    { id: "owned", label: "Owned", count: partition.owned.length },
  ];

  return (
    <div className={classes.page} data-augmentations-page>
      <div className={classes.main}>
        <button type="button" className={classes.backButton} data-back-button onClick={() => Router.back()}>
          ‹ Back
        </button>

        <div className={classes.contextStrip}>
          <div>
            <div className={classes.pageLabel}>
              Faction augmentations
              <Tooltip
                title={
                  <Typography>
                    These are all of the Augmentations that are available to purchase from <b>{faction.name}</b>.
                    Augmentations are powerful upgrades that will enhance your abilities.
                  </Typography>
                }
              >
                <Info className={classes.infoIcon} />
              </Tooltip>
            </div>
            <div className={classes.factionName}>{faction.name}</div>
          </div>
          <span className={classes.stripSpacer} />
          <StatCluster faction={faction} />
        </div>

        <div className={classes.tabRow}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cx(classes.tab, activeTab === tab.id && classes.tabActive)}
              data-tab={tab.id}
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span
                className={cx(classes.tabBadge, activeTab === tab.id && classes.tabBadgeActive)}
                data-tab-count={tab.id}
              >
                {tab.count}
              </span>
            </button>
          ))}
          <span className={classes.stripSpacer} />
          <input
            className={classes.filterInput}
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            autoFocus
            spellCheck={false}
            placeholder="Filter augmentations"
            data-filter-input
          />
        </div>

        <div className={classes.toolbar}>
          <span className={classes.toolbarLabel}>Sort by</span>
          {sortOrder.map((order) => (
            <button
              key={order}
              type="button"
              className={cx(classes.sortPill, Settings.PurchaseAugmentationsOrder === order && classes.sortPillActive)}
              data-sort-pill={sortLabels[order]}
              aria-pressed={Settings.PurchaseAugmentationsOrder === order}
              onClick={() => switchSortOrder(order)}
            >
              {sortLabels[order]}
            </button>
          ))}
        </div>

        {activeTab === "purchasable" &&
          (partition.purchasable.length > 0 ? (
            <div className={classes.cardGrid}>
              {partition.purchasable.map((augName) => (
                <PurchasableCard key={augName} faction={faction} augName={augName} rerender={rerender} />
              ))}
            </div>
          ) : (
            <Typography className={classes.emptyText}>No augmentations available for purchase.</Typography>
          ))}

        {activeTab === "locked" &&
          (partition.locked.length > 0 ? (
            <div className={classes.lockedList}>
              {partition.locked.map((augName) => (
                <LockedCard key={augName} faction={faction} augName={augName} />
              ))}
            </div>
          ) : (
            <Typography className={classes.emptyText}>No locked augmentations — every requirement is met.</Typography>
          ))}

        {activeTab === "owned" && <OwnedCloud augNames={partition.owned} />}
      </div>

      <InstallQueueSidebar />
    </div>
  );
}
