/**
 * Pure selectors for the World Map (3A): what does each city have for the player
 * *right now*? No React, no globals — everything is computed from an explicit
 * snapshot of player state plus static, public game data.
 *
 * Honesty rules (no undiscovered-information leaks):
 *  - A faction appears for a city only if the player is a member of it, has a
 *    pending invitation from it, or it is a plain city faction whose public money
 *    threshold the player meets. We never evaluate multi-city gangs' stat/karma
 *    requirements ourselves — an invitation means the game already confirmed them.
 *  - Gym/university quality comes from LocationsMetadata (public static data).
 */
import { CityName, FactionName, LocationType } from "@enums";
import { CONSTANTS } from "../../Constants";
import { LocationsMetadata } from "../../Locations/data/LocationsMetadata";

export interface CityIntelInput {
  currentCity: CityName;
  money: number;
  /** Names of factions the player is a member of (Player.factions). */
  factions: string[];
  /** Names of factions with a pending invitation (Player.factionInvitations). */
  factionInvitations: string[];
}

export type FactionStanding = "member" | "invited" | "joinable";

export interface CityFactionIntel {
  name: FactionName;
  standing: FactionStanding;
}

export interface TrainingVenue {
  name: string;
  expMult: number;
}

export interface CityIntel {
  city: CityName;
  isCurrent: boolean;
  /** City-tied factions the player is allowed to know about here (see honesty rules). */
  factions: CityFactionIntel[];
  joinableFactions: FactionName[];
  pendingInvitations: FactionName[];
  memberFactions: FactionName[];
  bestGym: TrainingVenue | null;
  bestUniversity: TrainingVenue | null;
  /** Strictly better than the current city's best gym/university. */
  hasBetterGym: boolean;
  hasBetterUniversity: boolean;
  /** Drives the cyan "has something for you now" node color. */
  hasSomething: boolean;
  canAffordTicket: boolean;
}

/**
 * Plain city factions and their public money thresholds.
 * Source of truth: src/Faction/FactionInfo.tsx inviteReqs —
 * [locatedInCity(city), haveMoney(threshold)] for each.
 */
const CITY_FACTION_THRESHOLDS: Record<CityName, { faction: FactionName; money: number }> = {
  [CityName.Aevum]: { faction: FactionName.Aevum, money: 40e6 },
  [CityName.Chongqing]: { faction: FactionName.Chongqing, money: 20e6 },
  [CityName.Ishima]: { faction: FactionName.Ishima, money: 30e6 },
  [CityName.NewTokyo]: { faction: FactionName.NewTokyo, money: 20e6 },
  [CityName.Sector12]: { faction: FactionName.Sector12, money: 15e6 },
  [CityName.Volhaven]: { faction: FactionName.Volhaven, money: 50e6 },
};

/**
 * Enemy lists of the plain city factions. Joining a faction bans the player from
 * all of its enemies (FactionHelpers.joinFaction sets isBanned), so a city faction
 * is not joinable while the player is a member of any of its enemies.
 * Source of truth: src/Faction/FactionInfo.tsx `enemies`.
 */
const CITY_FACTION_ENEMIES: Record<CityName, readonly FactionName[]> = {
  [CityName.Aevum]: [FactionName.Chongqing, FactionName.NewTokyo, FactionName.Ishima, FactionName.Volhaven],
  [CityName.Chongqing]: [FactionName.Sector12, FactionName.Aevum, FactionName.Volhaven],
  [CityName.Ishima]: [FactionName.Sector12, FactionName.Aevum, FactionName.Volhaven],
  [CityName.NewTokyo]: [FactionName.Sector12, FactionName.Aevum, FactionName.Volhaven],
  [CityName.Sector12]: [FactionName.Chongqing, FactionName.NewTokyo, FactionName.Ishima, FactionName.Volhaven],
  [CityName.Volhaven]: [
    FactionName.Chongqing,
    FactionName.Sector12,
    FactionName.NewTokyo,
    FactionName.Aevum,
    FactionName.Ishima,
  ],
};

/**
 * Factions whose inviteReqs include locatedInCity/locatedInSomeCity plus further
 * (stat/karma) requirements we deliberately do not evaluate.
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
    CITY_FACTION_THRESHOLDS[city].faction,
    ...MULTI_CITY_FACTIONS.filter((entry) => entry.cities.includes(city)).map((entry) => entry.faction),
  ];
}

function bestVenueOfType(city: CityName, type: LocationType): TrainingVenue | null {
  let best: TrainingVenue | null = null;
  for (const location of LocationsMetadata) {
    if (location.city !== city || !location.types.includes(type)) continue;
    const expMult = location.expMult ?? 0;
    if (!best || expMult > best.expMult) best = { name: location.name, expMult };
  }
  return best;
}

/** Best gym/university per city, from public LocationsMetadata. Static — computed once. */
const trainingVenues = new Map<CityName, { gym: TrainingVenue | null; university: TrainingVenue | null }>();
function getTrainingVenues(city: CityName): { gym: TrainingVenue | null; university: TrainingVenue | null } {
  let venues = trainingVenues.get(city);
  if (!venues) {
    venues = { gym: bestVenueOfType(city, LocationType.Gym), university: bestVenueOfType(city, LocationType.University) };
    trainingVenues.set(city, venues);
  }
  return venues;
}

export function getCityIntel(city: CityName, input: CityIntelInput): CityIntel {
  const isCurrent = city === input.currentCity;

  const factions: CityFactionIntel[] = [];
  const cityFaction = CITY_FACTION_THRESHOLDS[city];
  for (const name of getCityFactions(city)) {
    if (input.factions.includes(name)) {
      factions.push({ name, standing: "member" });
    } else if (input.factionInvitations.includes(name)) {
      factions.push({ name, standing: "invited" });
    } else if (
      name === cityFaction.faction &&
      input.money >= cityFaction.money &&
      // Joining an enemy of this faction banned the player from it (see CITY_FACTION_ENEMIES).
      !CITY_FACTION_ENEMIES[city].some((enemy) => input.factions.includes(enemy))
    ) {
      factions.push({ name, standing: "joinable" });
    }
    // Otherwise the faction is omitted entirely — we don't leak rumor-gated factions.
  }
  const joinableFactions = factions.filter((f) => f.standing === "joinable").map((f) => f.name);
  const pendingInvitations = factions.filter((f) => f.standing === "invited").map((f) => f.name);
  const memberFactions = factions.filter((f) => f.standing === "member").map((f) => f.name);

  const { gym, university } = getTrainingVenues(city);
  const current = getTrainingVenues(input.currentCity);
  const hasBetterGym = !isCurrent && (gym?.expMult ?? 0) > (current.gym?.expMult ?? 0);
  const hasBetterUniversity = !isCurrent && (university?.expMult ?? 0) > (current.university?.expMult ?? 0);

  return {
    city,
    isCurrent,
    factions,
    joinableFactions,
    pendingInvitations,
    memberFactions,
    bestGym: gym,
    bestUniversity: university,
    hasBetterGym,
    hasBetterUniversity,
    hasSomething: joinableFactions.length > 0 || pendingInvitations.length > 0 || hasBetterGym || hasBetterUniversity,
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
