/**
 * Shared navigation structure for the game's main navigation surfaces: the classic SidebarRoot and the UI-refresh
 * IconRail both consume this module, so page lists, visibility conditions, badge counts and active-page detection
 * cannot drift between them.
 *
 * This module is pure data + functions over player state. It must not import the Router (no navigation side effects
 * here).
 */
import React from "react";

import LastPageIcon from "@mui/icons-material/LastPage"; // Terminal
import CreateIcon from "@mui/icons-material/Create"; // Create Script
import StorageIcon from "@mui/icons-material/Storage"; // Active Scripts
import BugReportIcon from "@mui/icons-material/BugReport"; // Create Program
import EqualizerIcon from "@mui/icons-material/Equalizer"; // Stats
import ContactsIcon from "@mui/icons-material/Contacts"; // Factions
import DoubleArrowIcon from "@mui/icons-material/DoubleArrow"; // Augmentations
import AccountTreeIcon from "@mui/icons-material/AccountTree"; // Hacknet
import PeopleAltIcon from "@mui/icons-material/PeopleAlt"; // Sleeves
import LocationCityIcon from "@mui/icons-material/LocationCity"; // City
import AirplanemodeActiveIcon from "@mui/icons-material/AirplanemodeActive"; // Travel
import WorkIcon from "@mui/icons-material/Work"; // Job
import TrendingUpIcon from "@mui/icons-material/TrendingUp"; // Stock Market
import FormatBoldIcon from "@mui/icons-material/FormatBold"; // Bladeburner
import BusinessIcon from "@mui/icons-material/Business"; // Corp
import SportsMmaIcon from "@mui/icons-material/SportsMma"; // Gang
import CheckIcon from "@mui/icons-material/Check"; // Milestones
import HelpIcon from "@mui/icons-material/Help"; // Tutorial
import SettingsIcon from "@mui/icons-material/Settings"; // Options
import DeveloperBoardIcon from "@mui/icons-material/DeveloperBoard"; // Stanek + Dev
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents"; // Achievements
import AccountBoxIcon from "@mui/icons-material/AccountBox"; // Character (section)
import ComputerIcon from "@mui/icons-material/Computer"; // Hacking (section)
import PublicIcon from "@mui/icons-material/Public"; // World (section)
import LiveHelpIcon from "@mui/icons-material/LiveHelp"; // Help (section)
import BorderInnerSharpIcon from "@mui/icons-material/BorderInnerSharp"; // IPvGO
import ShareIcon from "@mui/icons-material/Share"; // DarkWeb
import BiotechIcon from "@mui/icons-material/Biotech"; // Grafting
import type { SvgIconProps } from "@mui/material/SvgIcon";

import { Player } from "@player";
import { AugmentationName } from "@enums";
import { Page } from "../ui/Router";
import { getAvailableCreatePrograms } from "../Programs/ProgramHelpers";
import { ProgramsSeen } from "../Programs/ui/ProgramsRoot";
import { InvitationsSeen } from "../Faction/ui/FactionsRoot";
import { ErrorState } from "../ErrorHandling/ErrorState";
import { knowAboutBitverse } from "../BitNode/BitNodeUtils";
import { playerHasDiscoveredGo } from "../Go/effects/effect";
import { hasDarknetAccess } from "../DarkNet/utils/darknetAuthUtils";
import { ITutorial, iTutorialSteps } from "../InteractiveTutorial";

/** The Augmentations icon: the standard DoubleArrow icon rotated to point up. */
export const RotatedDoubleArrowIcon = React.forwardRef<SVGSVGElement, SvgIconProps>(
  function RotatedDoubleArrowIcon(props, ref) {
    return React.createElement(DoubleArrowIcon, {
      ...props,
      ref,
      style: { transform: "rotate(-90deg)", ...props.style },
    });
  },
);

export interface NavigationItem {
  /** Target page for this navigation entry. */
  page: Page;
  icon: React.ElementType;
  /** Visibility condition, evaluated against live player state. Item is always visible when omitted. */
  condition?: () => boolean;
  /** Badge count, evaluated against live player state. No badge when omitted. */
  badge?: () => number;
  /** Additional pages for which this item counts as "active" (e.g. City is active on Page.Location). */
  alternateKeys?: Page[];
}

export type NavigationSectionLabel = "Hacking" | "Character" | "World" | "Help";

export interface NavigationSection {
  label: NavigationSectionLabel;
  /** Section icon (used by the classic sidebar accordion headers). */
  icon: React.ElementType;
  items: NavigationItem[];
}

// Visibility conditions. These MUST mirror the historical SidebarRoot rules exactly.
const canOpenFactions = (): boolean =>
  Player.factionInvitations.length > 0 ||
  Player.factions.length > 0 ||
  Player.factionRumors.size > 0 ||
  Player.augmentations.length > 0 ||
  Player.queuedAugmentations.length > 0 ||
  knowAboutBitverse();

const canOpenAugmentations = (): boolean =>
  Player.augmentations.length > 0 ||
  Player.queuedAugmentations.length > 0 ||
  knowAboutBitverse() ||
  Player.exploits.length > 0;

const canStaneksGift = (): boolean => Player.augmentations.some((aug) => aug.name === AugmentationName.StaneksGift1);

export const navigationSections: NavigationSection[] = [
  {
    label: "Hacking",
    icon: ComputerIcon,
    items: [
      { page: Page.Terminal, icon: LastPageIcon },
      { page: Page.ScriptEditor, icon: CreateIcon },
      {
        page: Page.ActiveScripts,
        icon: StorageIcon,
        badge: () => ErrorState.UnreadErrors,
        alternateKeys: [Page.RecentErrors, Page.RecentlyKilledScripts],
      },
      {
        page: Page.CreateProgram,
        icon: BugReportIcon,
        badge: () => getAvailableCreatePrograms().length - ProgramsSeen.size,
      },
      { page: Page.StaneksGift, icon: DeveloperBoardIcon, condition: canStaneksGift },
    ],
  },
  {
    label: "Character",
    icon: AccountBoxIcon,
    items: [
      { page: Page.Stats, icon: EqualizerIcon },
      {
        page: Page.Factions,
        icon: ContactsIcon,
        condition: canOpenFactions,
        badge: () => Player.factionInvitations.filter((faction) => !InvitationsSeen.has(faction)).length,
        alternateKeys: [Page.Faction],
      },
      {
        page: Page.Augmentations,
        icon: RotatedDoubleArrowIcon,
        condition: canOpenAugmentations,
        badge: () => Player.queuedAugmentations.length,
      },
      { page: Page.Hacknet, icon: AccountTreeIcon },
      { page: Page.Sleeves, icon: PeopleAltIcon, condition: () => Player.sleeves.length > 0 },
      { page: Page.Grafting, icon: BiotechIcon, condition: () => Player.canAccessGrafting() },
    ],
  },
  {
    label: "World",
    icon: PublicIcon,
    items: [
      { page: Page.City, icon: LocationCityIcon, alternateKeys: [Page.Location] },
      { page: Page.Travel, icon: AirplanemodeActiveIcon },
      { page: Page.Job, icon: WorkIcon, condition: () => Object.values(Player.jobs).length > 0 },
      { page: Page.StockMarket, icon: TrendingUpIcon, condition: () => Player.hasWseAccount },
      { page: Page.Bladeburner, icon: FormatBoldIcon, condition: () => !!Player.bladeburner },
      { page: Page.Corporation, icon: BusinessIcon, condition: () => !!Player.corporation },
      { page: Page.Gang, icon: SportsMmaIcon, condition: () => !!Player.gang },
      { page: Page.Go, icon: BorderInnerSharpIcon, condition: () => playerHasDiscoveredGo() },
      { page: Page.DarkNet, icon: ShareIcon, condition: () => hasDarknetAccess() },
    ],
  },
  {
    label: "Help",
    icon: LiveHelpIcon,
    items: [
      { page: Page.Milestones, icon: CheckIcon },
      { page: Page.Documentation, icon: HelpIcon },
      { page: Page.Achievements, icon: EmojiEventsIcon },
      { page: Page.Options, icon: SettingsIcon },
      { page: Page.DevMenu, icon: DeveloperBoardIcon, condition: () => process.env.NODE_ENV === "development" },
    ],
  },
];

/** Whether the item should currently be shown, based on live player state. */
export function isItemVisible(item: NavigationItem): boolean {
  return item.condition ? item.condition() : true;
}

/** Whether the item should render as active for the given current page (includes alternateKeys). */
export function isItemActive(item: NavigationItem, currentPage: Page): boolean {
  return item.page === currentPage || (item.alternateKeys?.includes(currentPage) ?? false);
}

/** Current badge count for the item, clamped to zero. */
export function getBadgeCount(item: NavigationItem): number {
  const count = item.badge ? item.badge() : 0;
  return count > 0 ? count : 0;
}

/** Find the navigation item whose target page is the given page. */
export function findNavigationItem(page: Page): NavigationItem | undefined {
  for (const section of navigationSections) {
    for (const item of section.items) {
      if (item.page === page) return item;
    }
  }
  return undefined;
}

/** Whether the page has a navigation item and that item is currently visible. Used for hotkey suppression. */
export function isPageVisible(page: Page): boolean {
  const item = findNavigationItem(page);
  return item !== undefined && isItemVisible(item);
}

/** Find the navigation section containing the item that is active for the given page (used for the breadcrumb). */
export function getNavigationSectionForPage(page: Page): NavigationSection | undefined {
  for (const section of navigationSections) {
    for (const item of section.items) {
      if (isItemActive(item, page)) return section;
    }
  }
  return undefined;
}

/** The page the interactive tutorial currently wants the player to visit, if any. */
export function getTutorialFlashPage(): Page | null {
  switch (ITutorial.currStep) {
    case iTutorialSteps.CharacterGoToTerminalPage:
    case iTutorialSteps.ActiveScriptsPage:
      return Page.Terminal;
    case iTutorialSteps.GoToCharacterPage:
      return Page.Stats;
    case iTutorialSteps.TerminalGoToActiveScriptsPage:
      return Page.ActiveScripts;
    case iTutorialSteps.GoToHacknetNodesPage:
      return Page.Hacknet;
    case iTutorialSteps.HacknetNodesGoToWorldPage:
      return Page.City;
    case iTutorialSteps.WorldDescription:
      return Page.Documentation;
    default:
      return null;
  }
}
