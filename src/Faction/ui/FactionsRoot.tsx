/**
 * Factions screen (UI refresh Task W6, design-notes-1A).
 *
 * Layout: optional "Your Gang" hero card → invitations → joined-faction rows with a rep progress
 * bar toward the next unowned augmentation → Share RAM → rumors. The joined list supports sort
 * pills (Closest to unlock / Reputation / Favor) and a "Can buy augments" filter toggle, both
 * persisted on Settings. Invitations and rumors keep the exact information and accept flow of the
 * old screen, restyled to the card grammar.
 *
 * Honesty: every derived number (rep-to-next-aug, purchasable count, gang stats) is data the
 * game's own faction/gang screens already show — see factionsScreenHelpers.ts.
 */
import React, { useEffect } from "react";
import { Explore, Info, LastPage, LocalPolice, NewReleases, Report, SportsMma } from "@mui/icons-material";
import { Tooltip, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";

import { Player } from "@player";
import { FactionName, FactionDiscovery, FactionWorkType } from "@enums";

import { GangConstants } from "../../Gang/data/Constants";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { formatFavor, formatMoney, formatNumberNoSuffix, formatReputation, formatRespect } from "../../ui/formatNumber";
import { Router } from "../../ui/GameRoot";
import { Page } from "../../ui/Router";
import { useCycleRerender } from "../../ui/React/hooks";
import { CorruptibleText } from "../../ui/React/CorruptibleText";
import { Requirement } from "../../ui/Components/Requirement";
import { isFactionWork } from "../../Work/FactionWork";

import { Faction } from "../Faction";
import { joinFaction } from "../FactionHelpers";
import { Factions } from "../Factions";
import { FactionCategories, FactionCategory } from "../data/FactionCategories";
import {
  countPurchasableAugs,
  factionsSortModes,
  getNextAugGoal,
  getRepGoalDelta,
  getRepGoalProgress,
  getUnownedFactionAugs,
  sortJoinedFactions,
  type FactionsSortMode,
} from "./factionsScreenHelpers";
import { ShareOption } from "./ShareOption";

export const InvitationsSeen = new Set<FactionName>();

const iconFontSize = "small";
const iconMarginRight = 0.5;

// ─── Styles ───────────────────────────────────────────────────────────────

const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  const mono = Settings.styles.monoFontFamily;
  const borderCard = theme.colors.borderCard as string;
  const accentCyan = theme.colors.accentCyan as string;
  const accentGreen = theme.colors.accentGreen as string;
  const accentViolet = theme.colors.accentViolet as string;
  return {
    page: {
      maxWidth: "1120px",
      paddingBottom: "40px",
    },
    pageTitle: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: typeScale.title,
      fontWeight: 600,
      color: theme.colors.textPrimary,
      marginBottom: "18px",
    },
    infoIcon: {
      color: theme.colors.textTertiary,
      fontSize: "18px",
    },
    section: {
      marginBottom: "26px",
    },
    sectionHeader: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      marginBottom: "14px",
      flexWrap: "wrap",
    },
    sectionTitle: {
      fontSize: typeScale.cardTitle,
      fontWeight: 600,
      color: theme.colors.textBody,
    },
    sectionCount: {
      fontSize: typeScale.cardTitle,
      fontWeight: 400,
      color: theme.colors.textTertiary,
    },
    sectionSpacer: {
      flex: 1,
    },
    rowList: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },
    // Card grammar: bgPanel, borderCard, radius 10, 13×16 padding, hover borderCard→borderFocus.
    rowCard: {
      display: "flex",
      alignItems: "center",
      gap: "18px",
      backgroundColor: theme.colors.bgPanel,
      border: `1px solid ${borderCard}`,
      borderRadius: "10px",
      padding: "13px 16px",
      transition: "border-color 120ms ease-out",
      "&:hover": {
        borderColor: theme.colors.borderFocus,
      },
    },
    rowClickable: {
      cursor: "pointer",
    },
    nameBlock: {
      width: "230px",
      flex: "none",
      minWidth: 0,
    },
    nameLine: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: typeScale.cardTitle,
      fontWeight: 600,
      color: theme.colors.textPrimary,
      minWidth: 0,
    },
    nameText: {
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    categoryChip: {
      flex: "none",
      fontFamily: mono,
      fontSize: typeScale.eyebrow,
      fontWeight: 600,
      letterSpacing: ".1em",
      borderRadius: "4px",
      padding: "1px 5px",
      lineHeight: 1.5,
    },
    subline: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
      marginTop: "3px",
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    repBlock: {
      flex: 1,
      minWidth: 0,
    },
    repLabels: {
      display: "flex",
      justifyContent: "space-between",
      gap: "12px",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      marginBottom: "5px",
    },
    repValue: {
      fontFamily: mono,
      whiteSpace: "nowrap",
    },
    repGoal: {
      fontFamily: mono,
      color: theme.colors.textSecondary,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
    },
    repGoalNear: {
      color: accentCyan,
    },
    repGoalDone: {
      color: theme.colors.textTertiary,
      fontFamily: "inherit",
    },
    repTrack: {
      height: "5px",
      borderRadius: "3px",
      backgroundColor: theme.colors.track,
      overflow: "hidden",
    },
    repFill: {
      height: "100%",
      backgroundColor: accentCyan,
      transition: "width 300ms ease-out",
    },
    favorBlock: {
      width: "80px",
      flex: "none",
      textAlign: "right",
    },
    favorValue: {
      fontFamily: mono,
      fontSize: typeScale.value,
      fontWeight: 600,
      color: theme.colors.textBody,
    },
    favorLabel: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textTertiary,
    },
    augPill: {
      width: "128px",
      flex: "none",
      fontFamily: "inherit",
      fontSize: typeScale.caption,
      fontWeight: 600,
      color: theme.colors.textTertiary,
      background: "none",
      border: `1px solid ${borderCard}`,
      borderRadius: "20px",
      padding: "4px 10px",
      cursor: "pointer",
      whiteSpace: "nowrap",
      transition: "border-color 120ms ease-out",
      "&:hover": {
        borderColor: theme.colors.borderFocus,
      },
    },
    augPillAvailable: {
      color: accentGreen,
      backgroundColor: alpha(accentGreen, 0.08),
      borderColor: alpha(accentGreen, 0.35),
      "&:hover": {
        borderColor: alpha(accentGreen, 0.6),
      },
    },
    chevron: {
      flex: "none",
      color: theme.colors.textTertiary,
      fontSize: typeScale.subheading,
      lineHeight: 1,
      userSelect: "none",
    },
    // Sort pills + toggle
    sortPill: {
      fontFamily: "inherit",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      background: "none",
      border: `1px solid ${borderCard}`,
      borderRadius: "20px",
      padding: "5px 12px",
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
    toggleWrapper: {
      display: "flex",
      alignItems: "center",
      gap: "7px",
      marginLeft: "8px",
      fontFamily: "inherit",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
    },
    toggleTrack: {
      width: "28px",
      height: "16px",
      borderRadius: "8px",
      backgroundColor: theme.colors.track,
      position: "relative",
      flex: "none",
      transition: "background-color 120ms ease-out",
    },
    toggleTrackOn: {
      backgroundColor: alpha(accentGreen, 0.25),
    },
    toggleThumb: {
      position: "absolute",
      left: "2px",
      top: "2px",
      width: "12px",
      height: "12px",
      borderRadius: "6px",
      backgroundColor: theme.colors.textTertiary,
      transition: "left 160ms ease-out, background-color 120ms ease-out",
    },
    toggleThumbOn: {
      left: "14px",
      backgroundColor: accentGreen,
    },
    // Gang hero card
    gangHero: {
      display: "flex",
      alignItems: "center",
      gap: "28px",
      flexWrap: "wrap",
      background: `linear-gradient(135deg, ${alpha(accentViolet, 0.08)} 0%, transparent 60%), ${
        theme.colors.bgPanel as string
      }`,
      border: `1px solid ${borderCard}`,
      borderRadius: "12px",
      padding: "18px 20px",
      marginBottom: "24px",
    },
    gangNameBlock: {
      minWidth: "200px",
    },
    gangLabel: {
      fontFamily: mono,
      fontSize: typeScale.eyebrow,
      fontWeight: 600,
      letterSpacing: ".14em",
      color: accentViolet,
      marginBottom: "5px",
    },
    gangName: {
      fontSize: typeScale.heading,
      fontWeight: 700,
      color: theme.colors.textPrimary,
    },
    gangMeta: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      marginTop: "3px",
    },
    gangDivider: {
      width: "1px",
      height: "44px",
      backgroundColor: borderCard,
      flex: "none",
    },
    gangStatLabel: {
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      marginBottom: "3px",
    },
    gangIncomeValue: {
      fontFamily: mono,
      fontSize: typeScale.subheading,
      fontWeight: 600,
      color: theme.colors.accentGold,
      whiteSpace: "nowrap",
    },
    gangIncomeSuffix: {
      fontSize: typeScale.caption,
      color: theme.colors.textTertiary,
    },
    gangRespectValue: {
      fontFamily: mono,
      fontSize: typeScale.subheading,
      fontWeight: 600,
      color: theme.colors.textBody,
      whiteSpace: "nowrap",
    },
    gangRespectRate: {
      fontFamily: mono,
      fontSize: typeScale.caption,
      color: accentGreen,
      marginLeft: "6px",
    },
    gangTerritory: {
      flex: 1,
      minWidth: "160px",
      maxWidth: "260px",
    },
    gangTerritoryLabels: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: typeScale.caption,
      fontWeight: 500,
      color: theme.colors.textSecondary,
      marginBottom: "5px",
    },
    gangTerritoryValue: {
      fontFamily: mono,
      color: theme.colors.textBody,
    },
    gangTerritoryTrack: {
      height: "6px",
      borderRadius: "3px",
      backgroundColor: theme.colors.track,
      overflow: "hidden",
    },
    gangTerritoryFill: {
      height: "100%",
      background: `linear-gradient(90deg, ${accentViolet}, ${accentCyan})`,
      transition: "width 300ms ease-out",
    },
    primaryButton: {
      flex: "none",
      height: "34px",
      padding: "0 18px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: accentCyan,
      color: theme.colors.bgApp,
      fontFamily: "inherit",
      fontSize: typeScale.body,
      fontWeight: 600,
      cursor: "pointer",
      transition: "filter 120ms ease-out",
      "&:hover": {
        filter: "brightness(1.15)",
      },
    },
    joinButton: {
      flex: "none",
      height: "32px",
      padding: "0 16px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: accentCyan,
      color: theme.colors.bgApp,
      fontFamily: "inherit",
      fontSize: typeScale.body,
      fontWeight: 600,
      cursor: "pointer",
      transition: "filter 120ms ease-out",
      "&:hover": {
        filter: "brightness(1.15)",
      },
    },
    prospectDetail: {
      display: "flex",
      alignItems: "center",
      marginTop: "4px",
      fontSize: typeScale.caption,
      color: theme.colors.textSecondary,
    },
    rumorText: {
      fontSize: typeScale.caption,
      fontStyle: "italic",
      color: theme.colors.textSecondary,
      marginTop: "4px",
    },
    emptyText: {
      fontSize: typeScale.body,
      color: theme.colors.textTertiary,
    },
  };
});

// ─── Small helpers ────────────────────────────────────────────────────────

/** Category chip color roles (all theme tokens; assignment documented in FactionCategories.ts). */
function getCategoryColor(category: FactionCategory, theme: Theme): string {
  switch (category) {
    case FactionCategory.Hack:
      return theme.colors.accentCyan as string;
    case FactionCategory.Corp:
      return theme.colors.accentGold as string;
    case FactionCategory.Endgame:
      return theme.colors.accentRed as string;
    case FactionCategory.City:
      return theme.colors.accentGreen as string;
    case FactionCategory.Crime:
      return theme.colors.accentViolet as string;
    case FactionCategory.Special:
      return theme.colors.accentPink as string;
    case FactionCategory.Early:
    default:
      return theme.colors.textSecondary as string;
  }
}

const factionWorkLabels: Record<FactionWorkType, string> = {
  [FactionWorkType.hacking]: "Hacking contracts",
  [FactionWorkType.field]: "Field work",
  [FactionWorkType.security]: "Security work",
};

/** Current-work subline: faction work for this faction, else employment at the same-named company. */
function getWorkSubline(faction: Faction): string {
  const work = Player.currentWork;
  if (isFactionWork(work) && work.factionName === faction.name) {
    return `Working: ${factionWorkLabels[work.factionWorkType]}`;
  }
  const job = Object.entries(Player.jobs).find(([companyName]) => companyName === (faction.name as string));
  if (job) return `Employed: ${job[1]}`;
  return "Idle";
}

function getStylesForFactionName(faction: Faction): React.CSSProperties {
  return {
    color: faction.isBanned ? Settings.theme.error : "inherit",
    textDecorationLine: faction.isBanned ? "line-through" : "none",
  };
}

// ─── Shared row pieces (preserved information from the old screen) ────────

const WorkTypesOffered = (props: { faction: Faction }): React.ReactElement => {
  const info = props.faction.getInfo();

  return (
    <>
      {info.offerFieldWork && (
        <Tooltip title="This Faction offers field work">
          <Explore sx={{ color: Settings.theme.info, mr: iconMarginRight }} fontSize={iconFontSize} />
        </Tooltip>
      )}
      {info.offerHackingWork && (
        <Tooltip title="This Faction offers hacking work">
          <LastPage sx={{ color: Settings.theme.hack, mr: iconMarginRight }} fontSize={iconFontSize} />
        </Tooltip>
      )}
      {info.offerSecurityWork && (
        <Tooltip title="This Faction offers security work">
          <LocalPolice sx={{ color: Settings.theme.combat, mr: iconMarginRight }} fontSize={iconFontSize} />
        </Tooltip>
      )}
    </>
  );
};

const JoinChecklist = (props: { faction: Faction }): React.ReactElement => {
  const info = props.faction.getInfo();
  return (
    <>
      {[...info.inviteReqs].map((condition, i) => (
        <Requirement key={i} fulfilled={condition.isSatisfied(Player)} value={condition.toString()} />
      ))}
    </>
  );
};

/** Gang / special / enemies indicator icons, identical information to the old screen. */
function FactionIndicators({ faction }: { faction: Faction }): React.ReactElement {
  const facInfo = faction.getInfo();
  return (
    <span style={{ display: "flex", alignItems: "center", flex: "none" }}>
      {Player.hasGangWith(faction.name) && (
        <Tooltip title="You have a gang with this Faction">
          <SportsMma sx={{ color: Settings.theme.hp }} fontSize={iconFontSize} />
        </Tooltip>
      )}
      {facInfo.special && (
        <Tooltip title="This is a special Faction">
          <NewReleases
            sx={{ ml: 0.5, color: Settings.theme.money, transform: "rotate(180deg)" }}
            fontSize={iconFontSize}
          />
        </Tooltip>
      )}
      {facInfo.enemies.length > 0 && (
        <Tooltip
          title={
            <Typography component="div">
              This Faction is enemies with:
              <ul>
                {facInfo.enemies.map((enemy) => (
                  <li key={enemy}>{enemy}</li>
                ))}
              </ul>
              {!faction.isMember && <>Joining this Faction will prevent you from joining its enemies</>}
            </Typography>
          }
        >
          <Report sx={{ ml: 0.5, color: Settings.theme.error }} fontSize={iconFontSize} />
        </Tooltip>
      )}
    </span>
  );
}

function CategoryChip({ faction }: { faction: Faction }): React.ReactElement {
  const { classes, theme } = useStyles();
  const category = FactionCategories[faction.name];
  const color = getCategoryColor(category, theme);
  return (
    <span
      className={classes.categoryChip}
      style={{ color, border: `1px solid ${alpha(color, 0.35)}` }}
      data-category-chip={category}
    >
      {category}
    </span>
  );
}

// ─── Joined faction row ───────────────────────────────────────────────────

function JoinedFactionRow({ faction }: { faction: Faction }): React.ReactElement {
  const { classes, cx } = useStyles();

  const goal = getNextAugGoal(faction);
  const purchasable = countPurchasableAugs(faction);
  const augsLeft = getUnownedFactionAugs(faction).length;

  function openFaction(): void {
    Router.toPage(Page.Faction, { faction });
  }

  function openAugPage(event: React.MouseEvent): void {
    event.stopPropagation();
    Router.toPage(Page.FactionAugmentations, { faction });
  }

  let repRight: React.ReactElement;
  let barPercent: number;
  if (goal) {
    const delta = getRepGoalDelta(faction, goal);
    barPercent = getRepGoalProgress(faction, goal);
    // Goal text lights up cyan when the unlock is near (>= 75% progress, incl. already met).
    const near = barPercent >= 75;
    repRight = (
      <span className={cx(classes.repGoal, near && classes.repGoalNear)}>
        {formatReputation(delta)} to {goal.augName}
      </span>
    );
  } else {
    barPercent = 100;
    repRight = <span className={cx(classes.repGoal, classes.repGoalDone)}>all augmentations unlocked</span>;
  }

  let augPillText: string;
  if (purchasable > 0) {
    augPillText = `${purchasable} augment${purchasable === 1 ? "" : "s"}`;
  } else if (augsLeft === 0) {
    augPillText = "none left";
  } else {
    augPillText = `${augsLeft} locked`;
  }

  return (
    <div
      className={cx(classes.rowCard, classes.rowClickable)}
      data-faction-row={faction.name}
      role="button"
      tabIndex={0}
      onClick={openFaction}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") openFaction();
        if (event.key === " ") {
          event.preventDefault();
          openFaction();
        }
      }}
    >
      <div className={classes.nameBlock}>
        <div className={classes.nameLine}>
          <span className={classes.nameText} style={getStylesForFactionName(faction)}>
            {faction.name}
          </span>
          <CategoryChip faction={faction} />
          <FactionIndicators faction={faction} />
        </div>
        <div className={classes.subline}>{getWorkSubline(faction)}</div>
      </div>

      <div className={classes.repBlock}>
        <div className={classes.repLabels}>
          <Tooltip title={formatNumberNoSuffix(faction.playerReputation, 3)}>
            <span className={classes.repValue}>{formatReputation(faction.playerReputation)} rep</span>
          </Tooltip>
          {repRight}
        </div>
        <div className={classes.repTrack}>
          <div className={classes.repFill} style={{ width: `${barPercent}%` }} />
        </div>
      </div>

      <div className={classes.favorBlock}>
        <div className={classes.favorValue}>{formatFavor(faction.favor)}</div>
        <div className={classes.favorLabel}>favor</div>
      </div>

      <button
        type="button"
        className={cx(classes.augPill, purchasable > 0 && classes.augPillAvailable)}
        data-aug-pill={faction.name}
        aria-label={`Augmentations from ${faction.name}`}
        onClick={openAugPage}
      >
        {augPillText}
      </button>

      <span className={classes.chevron}>›</span>
    </div>
  );
}

// ─── Invitation / rumor rows ──────────────────────────────────────────────

interface ProspectRowProps {
  faction: Faction;
  /** Rerender function to force the entire FactionsRoot to rerender */
  rerender: () => void;
}

/** Row for invited and rumored factions: same information and accept flow as the old screen. */
function ProspectRow({ faction, rerender }: ProspectRowProps): React.ReactElement {
  const { classes } = useStyles();
  const invited = faction.alreadyInvited && !faction.isMember;
  const augsLeft = getUnownedFactionAugs(faction).length;

  function acceptInvitation(event: React.MouseEvent<HTMLButtonElement>): void {
    if (!event.isTrusted || !Factions[faction.name].alreadyInvited || Factions[faction.name].isBanned) {
      return;
    }
    joinFaction(Factions[faction.name]);
    rerender();
  }

  return (
    <div className={classes.rowCard} data-prospect-row={faction.name}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={classes.nameLine}>
          {faction.discovery === FactionDiscovery.known ? (
            <Tooltip
              title={
                <>
                  <Typography sx={{ textAlign: "center" }}>{faction.name}</Typography>
                  <JoinChecklist faction={faction} />
                </>
              }
            >
              <span className={classes.nameText} style={getStylesForFactionName(faction)}>
                {faction.name}
              </span>
            </Tooltip>
          ) : (
            <Tooltip title={"Rumored Faction"}>
              <span className={classes.nameText} style={getStylesForFactionName(faction)}>
                <CorruptibleText content={faction.name} spoiler={false} />
              </span>
            </Tooltip>
          )}
          <FactionIndicators faction={faction} />
        </div>
        {invited ? (
          <span className={classes.prospectDetail}>
            <WorkTypesOffered faction={faction} />
            <span>{`${augsLeft || "No"} Augmentations left`}</span>
          </span>
        ) : (
          <div className={classes.rumorText}>{faction.getInfo().rumorText}</div>
        )}
      </div>
      {invited && (
        <button type="button" className={classes.joinButton} data-join-button={faction.name} onClick={acceptInvitation}>
          Join!
        </button>
      )}
    </div>
  );
}

// ─── Gang hero card ───────────────────────────────────────────────────────

function GangHeroCard(): React.ReactElement | null {
  const { classes } = useStyles();
  const gang = Player.gang;
  if (!gang) return null;
  const gangFaction = Player.getGangFaction();
  const augsLeft = getUnownedFactionAugs(gangFaction).length;
  const territoryPercent = Math.max(0, Math.min(100, gang.getTerritory() * 100));

  return (
    <div className={classes.gangHero} data-gang-hero={gang.facName}>
      <div className={classes.gangNameBlock}>
        <div className={classes.gangLabel}>YOUR GANG</div>
        <div className={classes.gangName}>{gang.facName}</div>
        <div className={classes.gangMeta}>
          {gang.members.length} / {GangConstants.MaximumGangMembers} members · {augsLeft} augmentation
          {augsLeft === 1 ? "" : "s"} left
        </div>
      </div>

      <div className={classes.gangDivider} />

      <div>
        <div className={classes.gangStatLabel}>Income</div>
        <div className={classes.gangIncomeValue}>
          {/* Per-cycle rate × 5 cycles/sec, exactly like GangStats' "Money gain rate". */}
          {formatMoney(5 * gang.moneyGainRate)} <span className={classes.gangIncomeSuffix}>/sec</span>
        </div>
      </div>

      <div>
        <div className={classes.gangStatLabel}>Respect</div>
        <div className={classes.gangRespectValue}>
          {formatRespect(gang.respect)}
          <span className={classes.gangRespectRate}>+{formatRespect(5 * gang.respectGainRate)}/s</span>
        </div>
      </div>

      <div className={classes.gangTerritory}>
        <div className={classes.gangTerritoryLabels}>
          <span>Territory</span>
          <span className={classes.gangTerritoryValue}>{formatNumberNoSuffix(territoryPercent, 2)}%</span>
        </div>
        <div className={classes.gangTerritoryTrack}>
          <div className={classes.gangTerritoryFill} style={{ width: `${territoryPercent}%` }} />
        </div>
      </div>

      <button type="button" className={classes.primaryButton} onClick={() => Router.toPage(Page.Gang)}>
        Manage gang
      </button>
    </div>
  );
}

// ─── Sort pills + filter toggle ───────────────────────────────────────────

const sortPillLabels: Record<FactionsSortMode, string> = {
  closest: "Closest to unlock",
  reputation: "Reputation",
  favor: "Favor",
};

function SortControls({ rerender }: { rerender: () => void }): React.ReactElement {
  const { classes, cx } = useStyles();
  const canBuyOnly = Settings.FactionsCanBuyOnly;

  function togglePill(mode: FactionsSortMode): void {
    // Clicking the active pill returns to the default order ("" round-trips as "no sort applied").
    Settings.FactionsSortMode = Settings.FactionsSortMode === mode ? "" : mode;
    rerender();
  }

  return (
    <>
      {factionsSortModes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={cx(classes.sortPill, Settings.FactionsSortMode === mode && classes.sortPillActive)}
          data-sort-pill={mode}
          aria-pressed={Settings.FactionsSortMode === mode}
          onClick={() => togglePill(mode)}
        >
          {sortPillLabels[mode]}
        </button>
      ))}
      <button
        type="button"
        className={classes.toggleWrapper}
        data-canbuy-toggle=""
        aria-pressed={canBuyOnly}
        onClick={() => {
          Settings.FactionsCanBuyOnly = !Settings.FactionsCanBuyOnly;
          rerender();
        }}
      >
        <span className={cx(classes.toggleTrack, canBuyOnly && classes.toggleTrackOn)}>
          <span className={cx(classes.toggleThumb, canBuyOnly && classes.toggleThumbOn)} />
        </span>
        Can buy augments
      </button>
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────

export function FactionsRoot(): React.ReactElement {
  const { classes } = useStyles();
  const rerender = useCycleRerender();
  useEffect(() => {
    Player.factionInvitations.forEach((factionName) => {
      InvitationsSeen.add(factionName);
    });
  }, []);

  // Joined factions in the game's standard order (Object.values(Factions) order), like the old screen.
  const joinedFactions = Object.values(Factions).filter((faction) => faction.isMember);
  // Invitations and rumors keep the order they were received in.
  const invitedFactions = Player.factionInvitations.map((facName) => Factions[facName]).filter((faction) => !!faction);
  const rumoredFactions = [...Player.factionRumors]
    .map((facName) => Factions[facName])
    .filter((faction) => !!faction && !faction.isMember && !faction.alreadyInvited);

  const filteredFactions = Settings.FactionsCanBuyOnly
    ? joinedFactions.filter((faction) => countPurchasableAugs(faction) > 0)
    : joinedFactions;
  const displayedFactions = sortJoinedFactions(filteredFactions, Settings.FactionsSortMode);

  return (
    <div className={classes.page}>
      <div className={classes.pageTitle}>
        Factions
        <Tooltip
          title={
            <Typography>
              Throughout the game you may receive invitations from factions. There are many different factions, and each
              faction has different criteria for determining its potential members. Joining a faction and furthering its
              cause is crucial to progressing in the game and unlocking endgame content.
            </Typography>
          }
        >
          <Info className={classes.infoIcon} />
        </Tooltip>
      </div>

      <GangHeroCard />

      {invitedFactions.length > 0 && (
        <div className={classes.section}>
          <div className={classes.sectionHeader}>
            <span className={classes.sectionTitle}>Faction invitations</span>
            <span className={classes.sectionCount}>· {invitedFactions.length}</span>
          </div>
          <div className={classes.rowList}>
            {invitedFactions.map((faction) => (
              <ProspectRow key={faction.name} faction={faction} rerender={rerender} />
            ))}
          </div>
        </div>
      )}

      <div className={classes.section}>
        <div className={classes.sectionHeader}>
          <span className={classes.sectionTitle}>Joined factions</span>
          <span className={classes.sectionCount}>· {joinedFactions.length}</span>
          <span className={classes.sectionSpacer} />
          <SortControls rerender={rerender} />
        </div>
        <div className={classes.rowList}>
          {displayedFactions.length > 0 ? (
            displayedFactions.map((faction) => <JoinedFactionRow key={faction.name} faction={faction} />)
          ) : joinedFactions.length > 0 ? (
            <Typography className={classes.emptyText}>
              No joined faction has purchasable augmentations right now.
            </Typography>
          ) : (
            <Typography className={classes.emptyText}>You have not yet joined any Factions.</Typography>
          )}
        </div>
      </div>

      <div className={classes.section}>
        <div className={classes.sectionHeader}>
          <span className={classes.sectionTitle}>Share RAM</span>
        </div>
        <ShareOption rerender={rerender} />
      </div>

      {rumoredFactions.length > 0 && (
        <div className={classes.section}>
          <div className={classes.sectionHeader}>
            <span className={classes.sectionTitle}>Rumors</span>
            <span className={classes.sectionCount}>· {rumoredFactions.length}</span>
          </div>
          <div className={classes.rowList}>
            {rumoredFactions.map((faction) => (
              <ProspectRow key={faction.name} faction={faction} rerender={rerender} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
