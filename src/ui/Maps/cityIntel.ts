/**
 * Pure selectors for the World Map (3A). No React, no globals — everything is
 * computed from an explicit snapshot of player state.
 *
 * Philosophy (UI-refresh feedback wave 1): the map does NOT surface derived
 * analytics. A city "has something" ONLY when the player holds a pending
 * faction invitation that requires being in that city — the one signal that is
 * both actionable and honest (the game itself already confirmed the invite).
 * Money thresholds, memberships, and gym/university comparisons never light a
 * node; players write scripts for that. Member-faction reputation stays
 * available so the popover can show plain facts about factions already joined.
 */
import { CityName, FactionName } from "@enums";
import { CONSTANTS } from "../../Constants";

export interface CityIntelInput {
  currentCity: CityName;
  money: number;
  /** Names of factions the player is a member of (Player.factions). */
  factions: string[];
  /** Names of factions with a pending invitation (Player.factionInvitations). */
  factionInvitations: string[];
}

export type FactionStanding = "member" | "invited";

export interface CityFactionIntel {
  name: FactionName;
  standing: FactionStanding;
}

export interface CityIntel {
  city: CityName;
  isCurrent: boolean;
  /** City-tied factions the player is a member of or invited to — nothing else. */
  factions: CityFactionIntel[];
  pendingInvitations: FactionName[];
  memberFactions: FactionName[];
  /** Drives the cyan node: a pending invitation requiring this city, ONLY. */
  hasSomething: boolean;
  canAffordTicket: boolean;
}

/**
 * The plain city faction of each city.
 * Source of truth: src/Faction/FactionInfo.tsx inviteReqs (locatedInCity).
 */
const CITY_FACTION: Record<CityName, FactionName> = {
  [CityName.Aevum]: FactionName.Aevum,
  [CityName.Chongqing]: FactionName.Chongqing,
  [CityName.Ishima]: FactionName.Ishima,
  [CityName.NewTokyo]: FactionName.NewTokyo,
  [CityName.Sector12]: FactionName.Sector12,
  [CityName.Volhaven]: FactionName.Volhaven,
};

/**
 * Factions whose inviteReqs require presence in specific cities (plus further
 * requirements we deliberately never evaluate — an invitation means the game
 * already confirmed them).
 * Source of truth: src/Faction/FactionInfo.tsx inviteReqs.
 */
const MULTI_CITY_FACTIONS: readonly { faction: FactionName; cities: readonly CityName[] }[] = [
  { faction: FactionName.TheDarkArmy, cities: [CityName.Chongqing] },
  { faction: FactionName.TheSyndicate, cities: [CityName.Aevum, CityName.Sector12] },
  { faction: FactionName.Tetrads, cities: [CityName.Chongqing, CityName.NewTokyo, CityName.Ishima] },
  { faction: FactionName.TianDiHui, cities: [CityName.Chongqing, CityName.NewTokyo, CityName.Ishima] },
];

/** All factions whose invite requires presence in the given city, city faction first. */
export function getCityFactions(city: CityName): FactionName[] {
  return [
    CITY_FACTION[city],
    ...MULTI_CITY_FACTIONS.filter((entry) => entry.cities.includes(city)).map((entry) => entry.faction),
  ];
}

export function getCityIntel(city: CityName, input: CityIntelInput): CityIntel {
  const factions: CityFactionIntel[] = [];
  for (const name of getCityFactions(city)) {
    if (input.factions.includes(name)) {
      factions.push({ name, standing: "member" });
    } else if (input.factionInvitations.includes(name)) {
      factions.push({ name, standing: "invited" });
    }
    // Otherwise the faction is omitted entirely — we don't leak rumor-gated factions.
  }
  const pendingInvitations = factions.filter((f) => f.standing === "invited").map((f) => f.name);
  const memberFactions = factions.filter((f) => f.standing === "member").map((f) => f.name);

  return {
    city,
    isCurrent: city === input.currentCity,
    factions,
    pendingInvitations,
    memberFactions,
    hasSomething: pendingInvitations.length > 0,
    canAffordTicket: input.money >= CONSTANTS.TravelCost,
  };
}

export function getAllCityIntel(input: CityIntelInput): Record<CityName, CityIntel> {
  const result = {} as Record<CityName, CityIntel>;
  for (const city of Object.values(CityName)) {
    result[city] = getCityIntel(city, input);
  }
  return result;
}
