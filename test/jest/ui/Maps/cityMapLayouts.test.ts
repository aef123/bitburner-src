/**
 * Coverage tests for the City Transit Map layouts (Task 6, 3B).
 *
 * These are the correctness net for hand-authored geometry: every check is
 * computed against the real game data (Cities/Locations), so if the game adds,
 * removes or renames a location, these tests fail instead of the map silently
 * drifting out of sync.
 *
 * Checks per city:
 *  - every location of the city appears in the layout exactly once
 *    (except the deliberately hidden easter-egg locations, see below)
 *  - every layout station references a real location that belongs to that city
 *  - the category mapping table matches the plan (Commerce/Training/Street)
 *  - the interchange rule is computed from types spanning category groups
 *  - station positions lie inside the SVG viewBox (with a node-radius margin)
 *  - label-collision floor: no two stations of a city within MIN_STATION_DISTANCE
 *  - the Volhaven layout is verbatim from the design mock
 *  - best-in-city gym (the ★ marker) matches the public expMult data
 *
 * Hidden locations: "The Void" is an easter egg (reachable only by lingering in
 * the Shadowed Walkway; visiting grants an achievement). The classic ASCII maps
 * deliberately omit it, and putting a clickable station on every city map would
 * hand the achievement out for free. It is excluded from all layouts on purpose.
 */
import { CityName, LocationName, LocationType } from "@enums";
import { Cities } from "../../../../src/Locations/Cities";
import { Locations } from "../../../../src/Locations/Locations";
import {
  categoriesOf,
  CITY_MAP_HEIGHT,
  CITY_MAP_WIDTH,
  cityMapLayouts,
  bestGymOf,
  HIDDEN_CITY_LOCATIONS,
  isInterchange,
  MIN_STATION_DISTANCE,
  primaryCategoryOf,
  TYPE_CATEGORY,
  type TransitCategory,
} from "../../../../src/ui/Maps/cityMapLayouts";

const allCities = Object.values(CityName);

/** The locations a city map must show: everything the city has, minus hidden easter eggs. */
function expectedStations(city: CityName): LocationName[] {
  return Cities[city].locations.filter((name) => !HIDDEN_CITY_LOCATIONS.includes(name));
}

/** Station layout accessor that throws instead of returning undefined. */
function stationOf(city: CityName, name: LocationName): { x: number; y: number } {
  const station = cityMapLayouts[city].stations[name];
  if (!station) throw new Error(`No station for ${name} in ${city}`);
  return station;
}

describe("category mapping (plan: Commerce gold / Training green / Street violet)", () => {
  const expected: Record<LocationType, TransitCategory> = {
    [LocationType.Company]: "commerce",
    [LocationType.TechVendor]: "commerce",
    [LocationType.StockMarket]: "commerce",
    [LocationType.Casino]: "commerce",
    [LocationType.TravelAgency]: "commerce",
    [LocationType.Gym]: "training",
    [LocationType.University]: "training",
    [LocationType.Hospital]: "training",
    [LocationType.Slums]: "street",
    [LocationType.Special]: "street",
  };

  it("maps every LocationType exactly as the plan specifies", () => {
    expect(TYPE_CATEGORY).toEqual(expected);
  });

  it("covers every LocationType (catches new types being added to the game)", () => {
    expect(Object.keys(TYPE_CATEGORY).sort()).toEqual(Object.values(LocationType).sort());
  });

  it("dedupes categories within a group (ECorp = Company+TechVendor → just commerce)", () => {
    expect(categoriesOf(Locations[LocationName.AevumECorp].types)).toEqual(["commerce"]);
  });

  it("keeps both categories when types span groups (CIA = Company+Special)", () => {
    expect(categoriesOf(Locations[LocationName.Sector12CIA].types)).toEqual(["commerce", "street"]);
  });

  it("derives the primary category from the first type", () => {
    expect(primaryCategoryOf(Locations[LocationName.Slums].types)).toBe("street");
    expect(primaryCategoryOf(Locations[LocationName.Sector12CIA].types)).toBe("commerce");
    expect(primaryCategoryOf(Locations[LocationName.TravelAgency].types)).toBe("commerce");
  });
});

describe("interchange rule (computed: types span category groups)", () => {
  it("flags exactly the locations whose types span groups", () => {
    // Independently re-derived here so the production helper is tested against
    // the rule, not against itself.
    for (const name of Object.values(LocationName)) {
      const types = Locations[name].types;
      const groups = new Set(types.map((t) => TYPE_CATEGORY[t]));
      expect({ name, interchange: isInterchange(types) }).toEqual({ name, interchange: groups.size > 1 });
    }
  });

  it("matches the known data: CIA/NSA and the three New Tokyo company-specials", () => {
    const interchanges = Object.values(LocationName).filter((name) => isInterchange(Locations[name].types));
    expect(interchanges.sort()).toEqual(
      [
        LocationName.Sector12CIA,
        LocationName.Sector12NSA,
        LocationName.NewTokyoDefComm,
        LocationName.NewTokyoNoodleBar,
        LocationName.NewTokyoVitaLife,
      ].sort(),
    );
  });

  it("does NOT flag single-group multi-type locations (ECorp) or The Slums", () => {
    expect(isInterchange(Locations[LocationName.AevumECorp].types)).toBe(false);
    expect(isInterchange(Locations[LocationName.Slums].types)).toBe(false);
    expect(isInterchange(Locations[LocationName.VolhavenOmniTekIncorporated].types)).toBe(false);
  });
});

describe.each(allCities)("layout coverage: %s", (city) => {
  const layout = cityMapLayouts[city];
  const stationNames = Object.keys(layout.stations) as LocationName[];

  it("has a layout with all three category lines", () => {
    expect(layout).toBeDefined();
    for (const category of ["commerce", "training", "street"] as const) {
      expect(typeof layout.lines[category]).toBe("string");
      expect(layout.lines[category]).toMatch(/^M /);
    }
  });

  it("shows every location of the city exactly once (minus hidden easter eggs)", () => {
    // Object keys are unique by construction, so set equality here IS
    // "appears exactly once".
    expect(stationNames.sort()).toEqual(expectedStations(city).sort());
  });

  it("references only real locations that belong to this city (catches data drift)", () => {
    for (const name of stationNames) {
      const location = Locations[name];
      expect(location).toBeDefined();
      // Generic locations have city === null and exist in every city.
      expect([null, city]).toContain(location.city);
    }
  });

  it("does not surface hidden easter-egg locations", () => {
    expect(HIDDEN_CITY_LOCATIONS).toEqual([LocationName.Void]);
    expect(stationNames).not.toContain(LocationName.Void);
  });

  it("keeps every station inside the viewBox with a node-radius margin", () => {
    // Interchange nodes are r=12 with a 3.5px stroke → 14px keeps the whole
    // circle inside the canvas.
    const margin = 14;
    for (const name of stationNames) {
      const { x, y } = stationOf(city, name);
      expect(x).toBeGreaterThanOrEqual(margin);
      expect(x).toBeLessThanOrEqual(CITY_MAP_WIDTH - margin);
      expect(y).toBeGreaterThanOrEqual(margin);
      expect(y).toBeLessThanOrEqual(CITY_MAP_HEIGHT - margin);
    }
  });

  it(`keeps stations at least ${MIN_STATION_DISTANCE}px apart (label collision floor)`, () => {
    // 24px = two regular nodes (r=8) side by side with a little air; below
    // that, circles touch and 11px labels are guaranteed to collide.
    expect(MIN_STATION_DISTANCE).toBe(24);
    const tooClose: string[] = [];
    for (let i = 0; i < stationNames.length; i++) {
      for (let j = i + 1; j < stationNames.length; j++) {
        const a = stationOf(city, stationNames[i]);
        const b = stationOf(city, stationNames[j]);
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < MIN_STATION_DISTANCE) {
          tooClose.push(`${stationNames[i]} ↔ ${stationNames[j]} (${distance.toFixed(1)}px)`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });
});

describe("Volhaven layout is verbatim from the design mock", () => {
  const layout = cityMapLayouts[CityName.Volhaven];

  it("uses the mock's three line paths", () => {
    expect(layout.lines.commerce).toBe("M 180 480 L 400 480 L 520 360 L 820 360 L 960 220");
    expect(layout.lines.training).toBe("M 300 140 L 620 140 L 760 280 L 760 500");
    expect(layout.lines.street).toBe("M 180 220 L 380 220 L 520 360 L 640 480 L 1060 480");
  });

  it("places the 13 stations at the mock coordinates", () => {
    const expected: Partial<Record<LocationName, [number, number]>> = {
      [LocationName.VolhavenZBInstituteOfTechnology]: [300, 140],
      [LocationName.VolhavenMilleniumFitnessGym]: [620, 140],
      [LocationName.TravelAgency]: [180, 220],
      [LocationName.Hospital]: [380, 220],
      [LocationName.WorldStockExchange]: [960, 220],
      [LocationName.VolhavenHeliosLabs]: [760, 280],
      [LocationName.VolhavenOmniTekIncorporated]: [520, 360],
      [LocationName.VolhavenNWO]: [820, 360],
      [LocationName.VolhavenCompuTek]: [180, 480],
      [LocationName.VolhavenLexoCorp]: [400, 480],
      [LocationName.VolhavenSysCoreSecurities]: [640, 480], // "ZB Defense" in the mock
      [LocationName.VolhavenOmniaCybersystems]: [760, 500],
      [LocationName.Slums]: [1060, 480],
    };
    expect(Object.keys(layout.stations)).toHaveLength(13);
    for (const [name, [x, y]] of Object.entries(expected)) {
      expect(layout.stations[name as LocationName]).toMatchObject({ x, y });
    }
  });
});

describe("best-in-city gym (★ marker data)", () => {
  it("matches the public expMult data", () => {
    expect(bestGymOf(CityName.Sector12)).toBe(LocationName.Sector12PowerhouseGym);
    expect(bestGymOf(CityName.Aevum)).toBe(LocationName.AevumSnapFitnessGym);
    expect(bestGymOf(CityName.Volhaven)).toBe(LocationName.VolhavenMilleniumFitnessGym);
  });

  it("is null for cities without a gym", () => {
    expect(bestGymOf(CityName.Chongqing)).toBeNull();
    expect(bestGymOf(CityName.NewTokyo)).toBeNull();
    expect(bestGymOf(CityName.Ishima)).toBeNull();
  });
});
