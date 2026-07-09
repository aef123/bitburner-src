/**
 * Tests for the simplified city-intel selectors behind the World Map (3A).
 *
 * The rule (UI-refresh feedback wave 1, "clunky is a feature"): a city has
 * something ONLY when the player holds a pending faction invitation that
 * requires being in that city. Money, memberships, and gym/university quality
 * NEVER light a node. Member-faction standing stays available for the popover.
 *
 * City↔faction associations mirror src/Faction/FactionInfo.tsx inviteReqs.
 */

import { CityName, FactionName } from "@enums";
import { CONSTANTS } from "../../../../src/Constants";
import { type CityIntelInput, getAllCityIntel, getCityIntel } from "../../../../src/ui/Maps/cityIntel";

const ALL_CITIES = Object.values(CityName);

function input(partial: Partial<CityIntelInput> = {}): CityIntelInput {
  return {
    currentCity: CityName.Sector12,
    money: 0,
    factions: [],
    factionInvitations: [],
    ...partial,
  };
}

describe("invitation-only rule", () => {
  it("gives a fresh player all-slate nodes", () => {
    const intel = getAllCityIntel(input());
    for (const city of ALL_CITIES) {
      expect(intel[city].hasSomething).toBe(false);
      expect(intel[city].pendingInvitations).toEqual([]);
      expect(intel[city].memberFactions).toEqual([]);
      expect(intel[city].factions).toEqual([]);
    }
  });

  it("gives a rich player ($1e12) with no invitations all-slate nodes — money never matters", () => {
    const intel = getAllCityIntel(input({ money: 1e12 }));
    for (const city of ALL_CITIES) {
      expect(intel[city].hasSomething).toBe(false);
      expect(intel[city].factions).toEqual([]);
    }
  });

  it("never lights a node for gym/university differences (Chongqing has no venues, still all-slate)", () => {
    // Under the old rules, every city with any training venue would light up from Chongqing.
    const intel = getAllCityIntel(input({ currentCity: CityName.Chongqing, money: 1e12 }));
    for (const city of ALL_CITIES) {
      expect(intel[city].hasSomething).toBe(false);
    }
  });

  it("never lights a node for membership, but keeps the member standing for the popover", () => {
    const intel = getCityIntel(CityName.Ishima, input({ money: 1e12, factions: [FactionName.Ishima] }));
    expect(intel.hasSomething).toBe(false);
    expect(intel.memberFactions).toEqual([FactionName.Ishima]);
    expect(intel.factions).toEqual([{ name: FactionName.Ishima, standing: "member" }]);
  });

  it("lights exactly the invitation's city for a plain city faction", () => {
    const intel = getAllCityIntel(input({ factionInvitations: [FactionName.Ishima] }));
    for (const city of ALL_CITIES) {
      expect(intel[city].hasSomething).toBe(city === CityName.Ishima);
    }
    expect(intel[CityName.Ishima].pendingInvitations).toEqual([FactionName.Ishima]);
    expect(intel[CityName.Ishima].factions).toEqual([{ name: FactionName.Ishima, standing: "invited" }]);
  });

  it("maps a Tetrads invitation to all three of its cities", () => {
    const intel = getAllCityIntel(input({ factionInvitations: [FactionName.Tetrads] }));
    for (const city of [CityName.Chongqing, CityName.NewTokyo, CityName.Ishima]) {
      expect(intel[city].pendingInvitations).toEqual([FactionName.Tetrads]);
      expect(intel[city].hasSomething).toBe(true);
    }
    for (const city of [CityName.Sector12, CityName.Aevum, CityName.Volhaven]) {
      expect(intel[city].pendingInvitations).toEqual([]);
      expect(intel[city].hasSomething).toBe(false);
    }
  });

  it("maps The Syndicate to Aevum and Sector-12, The Dark Army to Chongqing, Tian Di Hui to the east", () => {
    const intel = getAllCityIntel(
      input({
        currentCity: CityName.Volhaven,
        factionInvitations: [FactionName.TheSyndicate, FactionName.TheDarkArmy, FactionName.TianDiHui],
      }),
    );
    expect(intel[CityName.Aevum].pendingInvitations).toEqual([FactionName.TheSyndicate]);
    expect(intel[CityName.Sector12].pendingInvitations).toEqual([FactionName.TheSyndicate]);
    expect(intel[CityName.Chongqing].pendingInvitations).toEqual(
      expect.arrayContaining([FactionName.TheDarkArmy, FactionName.TianDiHui]),
    );
    expect(intel[CityName.NewTokyo].pendingInvitations).toEqual([FactionName.TianDiHui]);
    expect(intel[CityName.Ishima].pendingInvitations).toEqual([FactionName.TianDiHui]);
    expect(intel[CityName.Volhaven].pendingInvitations).toEqual([]);
    expect(intel[CityName.Volhaven].hasSomething).toBe(false);
  });

  it("ignores invitations from factions with no city requirement", () => {
    const intel = getAllCityIntel(input({ factionInvitations: [FactionName.CyberSec, FactionName.NiteSec] }));
    for (const city of ALL_CITIES) {
      expect(intel[city].pendingInvitations).toEqual([]);
      expect(intel[city].hasSomething).toBe(false);
    }
  });
});

describe("isCurrent", () => {
  it("flags exactly the player's current city", () => {
    for (const currentCity of ALL_CITIES) {
      const intel = getAllCityIntel(input({ currentCity }));
      for (const city of ALL_CITIES) {
        expect(intel[city].isCurrent).toBe(city === currentCity);
      }
    }
  });
});

describe("ticket affordability", () => {
  it("is affordable exactly at CONSTANTS.TravelCost", () => {
    const intel = getAllCityIntel(input({ money: CONSTANTS.TravelCost }));
    for (const city of ALL_CITIES) {
      expect(intel[city].canAffordTicket).toBe(true);
    }
  });

  it("is not affordable one dollar below CONSTANTS.TravelCost", () => {
    const intel = getAllCityIntel(input({ money: CONSTANTS.TravelCost - 1 }));
    for (const city of ALL_CITIES) {
      expect(intel[city].canAffordTicket).toBe(false);
    }
  });
});
