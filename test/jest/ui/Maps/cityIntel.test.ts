/**
 * Tests for the pure city-intel selectors behind the World Map (Task 5, 3A).
 *
 * cityIntel computes, per city, what is "worth flying for" from player state ONLY:
 *   - plain city factions joinable (money threshold met, not member, not invited)
 *   - pending invitations from factions tied to that city (incl. multi-city gangs)
 *   - better gym / university than the current city's best (public LocationsMetadata data)
 *   - ticket affordability
 *
 * Thresholds and city↔faction associations mirror src/Faction/FactionInfo.tsx inviteReqs.
 * Gym/university expMult values mirror src/Locations/data/LocationsMetadata.ts.
 */

import { CityName, FactionName } from "@enums";
import { CONSTANTS } from "../../../../src/Constants";
import {
  type CityIntelInput,
  getAllCityIntel,
  getCityIntel,
} from "../../../../src/ui/Maps/cityIntel";

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

describe("fresh player", () => {
  it("has no joinable factions, invitations, or memberships anywhere", () => {
    const intel = getAllCityIntel(input());
    for (const city of ALL_CITIES) {
      expect(intel[city].joinableFactions).toEqual([]);
      expect(intel[city].pendingInvitations).toEqual([]);
      expect(intel[city].memberFactions).toEqual([]);
      expect(intel[city].canAffordTicket).toBe(false);
    }
  });

  it("from Sector-12: only cities with a better university light up (S12 has the best gym)", () => {
    // Sector-12: Powerhouse Gym x10 (best in game), Rothman University x2.
    // Aevum Summit x3 and Volhaven ZB x4 beat Rothman; no gym beats Powerhouse.
    const intel = getAllCityIntel(input({ currentCity: CityName.Sector12 }));
    expect(intel[CityName.Sector12].hasSomething).toBe(false);
    expect(intel[CityName.Aevum].hasSomething).toBe(true);
    expect(intel[CityName.Aevum].hasBetterUniversity).toBe(true);
    expect(intel[CityName.Aevum].hasBetterGym).toBe(false);
    expect(intel[CityName.Volhaven].hasSomething).toBe(true);
    expect(intel[CityName.Volhaven].hasBetterUniversity).toBe(true);
    expect(intel[CityName.Volhaven].hasBetterGym).toBe(false);
    expect(intel[CityName.Chongqing].hasSomething).toBe(false);
    expect(intel[CityName.NewTokyo].hasSomething).toBe(false);
    expect(intel[CityName.Ishima].hasSomething).toBe(false);
  });

  it("from Chongqing: every city with any gym/university is better (Chongqing has none)", () => {
    const intel = getAllCityIntel(input({ currentCity: CityName.Chongqing }));
    for (const city of [CityName.Sector12, CityName.Aevum, CityName.Volhaven]) {
      expect(intel[city].hasBetterGym).toBe(true);
      expect(intel[city].hasBetterUniversity).toBe(true);
      expect(intel[city].hasSomething).toBe(true);
    }
    for (const city of [CityName.NewTokyo, CityName.Ishima]) {
      expect(intel[city].hasBetterGym).toBe(false);
      expect(intel[city].hasBetterUniversity).toBe(false);
      expect(intel[city].hasSomething).toBe(false);
    }
  });
});

describe("city faction money thresholds", () => {
  // Thresholds from FactionInfo inviteReqs: Sector-12 15e6, Chongqing 20e6, New Tokyo 20e6,
  // Ishima 30e6, Aevum 40e6, Volhaven 50e6.
  it("marks a city faction joinable exactly at its threshold", () => {
    const intel = getAllCityIntel(input({ money: 15e6 }));
    expect(intel[CityName.Sector12].joinableFactions).toEqual([FactionName.Sector12]);
    expect(intel[CityName.Chongqing].joinableFactions).toEqual([]);
    expect(intel[CityName.Aevum].joinableFactions).toEqual([]);
  });

  it("does not mark a city faction joinable just below its threshold", () => {
    const intel = getAllCityIntel(input({ money: 15e6 - 1 }));
    expect(intel[CityName.Sector12].joinableFactions).toEqual([]);
  });

  it("marks all six city factions joinable at 50e6", () => {
    const intel = getAllCityIntel(input({ money: 50e6 }));
    expect(intel[CityName.Sector12].joinableFactions).toEqual([FactionName.Sector12]);
    expect(intel[CityName.Aevum].joinableFactions).toEqual([FactionName.Aevum]);
    expect(intel[CityName.Chongqing].joinableFactions).toEqual([FactionName.Chongqing]);
    expect(intel[CityName.NewTokyo].joinableFactions).toEqual([FactionName.NewTokyo]);
    expect(intel[CityName.Ishima].joinableFactions).toEqual([FactionName.Ishima]);
    expect(intel[CityName.Volhaven].joinableFactions).toEqual([FactionName.Volhaven]);
  });

  it("a joinable city faction makes the city 'have something'", () => {
    // Ishima has no gym/university, so from Sector-12 only the faction can light it up.
    const below = getCityIntel(CityName.Ishima, input({ money: 30e6 - 1 }));
    expect(below.hasSomething).toBe(false);
    const at = getCityIntel(CityName.Ishima, input({ money: 30e6 }));
    expect(at.joinableFactions).toEqual([FactionName.Ishima]);
    expect(at.hasSomething).toBe(true);
  });

  it("does not evaluate multi-city gangs' stat requirements as joinable", () => {
    // Tons of money alone never makes The Syndicate / Tetrads / Tian Di Hui / The Dark Army joinable.
    const intel = getAllCityIntel(input({ money: 1e12 }));
    for (const city of ALL_CITIES) {
      for (const faction of intel[city].joinableFactions) {
        expect([
          FactionName.Aevum,
          FactionName.Chongqing,
          FactionName.Ishima,
          FactionName.NewTokyo,
          FactionName.Sector12,
          FactionName.Volhaven,
        ]).toContain(faction);
      }
    }
  });
});

describe("membership and invitations", () => {
  it("excludes factions the player is already a member of from joinable", () => {
    const intel = getCityIntel(CityName.Ishima, input({ money: 30e6, factions: [FactionName.Ishima] }));
    expect(intel.joinableFactions).toEqual([]);
    expect(intel.memberFactions).toEqual([FactionName.Ishima]);
    // Membership alone is not a reason to fly there (Ishima has no training venues).
    expect(intel.hasSomething).toBe(false);
  });

  it("excludes factions with a pending invitation from joinable but counts them as something", () => {
    const intel = getCityIntel(
      CityName.Ishima,
      input({ money: 30e6, factionInvitations: [FactionName.Ishima] }),
    );
    expect(intel.joinableFactions).toEqual([]);
    expect(intel.pendingInvitations).toEqual([FactionName.Ishima]);
    expect(intel.hasSomething).toBe(true);
  });

  it("maps a Tetrads invitation to all three of its cities", () => {
    const intel = getAllCityIntel(input({ factionInvitations: [FactionName.Tetrads] }));
    for (const city of [CityName.Chongqing, CityName.NewTokyo, CityName.Ishima]) {
      expect(intel[city].pendingInvitations).toEqual([FactionName.Tetrads]);
      expect(intel[city].hasSomething).toBe(true);
    }
    for (const city of [CityName.Sector12, CityName.Aevum, CityName.Volhaven]) {
      expect(intel[city].pendingInvitations).toEqual([]);
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
  });

  it("ignores invitations from factions with no city requirement", () => {
    const intel = getAllCityIntel(input({ factionInvitations: [FactionName.CyberSec, FactionName.NiteSec] }));
    for (const city of ALL_CITIES) {
      expect(intel[city].pendingInvitations).toEqual([]);
    }
  });
});

describe("training venues", () => {
  it("knows each city's best gym and university from LocationsMetadata", () => {
    const intel = getAllCityIntel(input());
    expect(intel[CityName.Sector12].bestGym).toEqual({ name: "Powerhouse Gym", expMult: 10 });
    expect(intel[CityName.Sector12].bestUniversity).toEqual({ name: "Rothman University", expMult: 2 });
    expect(intel[CityName.Aevum].bestGym).toEqual({ name: "Snap Fitness Gym", expMult: 5 });
    expect(intel[CityName.Aevum].bestUniversity).toEqual({ name: "Summit University", expMult: 3 });
    expect(intel[CityName.Volhaven].bestGym).toEqual({ name: "Millenium Fitness Gym", expMult: 4 });
    expect(intel[CityName.Volhaven].bestUniversity).toEqual({
      name: "ZB Institute of Technology",
      expMult: 4,
    });
    for (const city of [CityName.Chongqing, CityName.NewTokyo, CityName.Ishima]) {
      expect(intel[city].bestGym).toBeNull();
      expect(intel[city].bestUniversity).toBeNull();
    }
  });

  it("from Volhaven: Sector-12 and Aevum have better gyms, nobody has a better university", () => {
    const intel = getAllCityIntel(input({ currentCity: CityName.Volhaven }));
    expect(intel[CityName.Sector12].hasBetterGym).toBe(true);
    expect(intel[CityName.Aevum].hasBetterGym).toBe(true);
    for (const city of ALL_CITIES) {
      expect(intel[city].hasBetterUniversity).toBe(false);
    }
  });

  it("the current city never beats itself", () => {
    for (const city of ALL_CITIES) {
      const intel = getCityIntel(city, input({ currentCity: city }));
      expect(intel.isCurrent).toBe(true);
      expect(intel.hasBetterGym).toBe(false);
      expect(intel.hasBetterUniversity).toBe(false);
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
