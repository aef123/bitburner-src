/**
 * Static geometry + category logic for the City Transit Map (3B).
 *
 * The Volhaven layout is verbatim from the design mock
 * (.superpowers/sdd/design-notes-3B-citymap.md); the other five cities are
 * hand-authored in the same visual language: a 1340×640 canvas, three
 * category-colored 5px rounded lines built from horizontal runs and 45°-ish
 * diagonals, stations spaced ≥70px along them.
 *
 * Correctness comes from test/jest/ui/Maps/cityMapLayouts.test.ts, which
 * checks every layout against the real Cities/Locations data (full coverage,
 * no stale names, category mapping, computed interchange rule, bounds and a
 * 24px station-distance floor), not from eyeballing.
 *
 * Category mapping (from the plan):
 *   Commerce (accentGold)  = Company / TechVendor / StockMarket / Casino / TravelAgency
 *   Training (accentGreen) = Gym / University / Hospital
 *   Street  (accentViolet) = Slums / Special
 * A location whose types span category GROUPS (e.g. CIA = Company+Special) is
 * an interchange; multiple types within one group (ECorp = Company+TechVendor)
 * stay a normal station.
 */
import { CityName, LocationName, LocationType } from "@enums";
import { Locations } from "../../Locations/Locations";
import { Cities } from "../../Locations/Cities";

export const CITY_MAP_WIDTH = 1340;
export const CITY_MAP_HEIGHT = 640;

/**
 * Label-collision floor enforced by tests: two regular nodes (r=8) side by
 * side with a little air. Authored layouts stay far above this (≥70px).
 */
export const MIN_STATION_DISTANCE = 24;

/**
 * Locations deliberately NOT shown on any city map. "The Void" is an easter
 * egg: it is reachable only by lingering in the Shadowed Walkway, and visiting
 * grants an achievement. The classic ASCII maps omit it too; a clickable
 * station would hand the achievement out for free.
 */
export const HIDDEN_CITY_LOCATIONS: readonly LocationName[] = [LocationName.Void];

export type TransitCategory = "commerce" | "training" | "street";

export const TRANSIT_CATEGORIES: readonly TransitCategory[] = ["commerce", "training", "street"];

/** LocationType → transit line category, exactly as the plan specifies. */
export const TYPE_CATEGORY: Record<LocationType, TransitCategory> = {
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

/** Unique categories of a location, in first-seen (types) order. */
export function categoriesOf(types: LocationType[]): TransitCategory[] {
  const result: TransitCategory[] = [];
  for (const type of types) {
    const category = TYPE_CATEGORY[type];
    if (!result.includes(category)) result.push(category);
  }
  return result;
}

/** The category of a location's first type — drives station stroke and CTA color. */
export function primaryCategoryOf(types: LocationType[]): TransitCategory {
  return categoriesOf(types)[0];
}

/** Interchange = the location's types span more than one category group. */
export function isInterchange(types: LocationType[]): boolean {
  return categoriesOf(types).length > 1;
}

/** Best-in-city gym by public expMult data (the ★ marker); null when the city has no gym. */
export function bestGymOf(city: CityName): LocationName | null {
  let best: LocationName | null = null;
  let bestExp = 0;
  for (const name of Cities[city].locations) {
    const location = Locations[name];
    if (!location.types.includes(LocationType.Gym)) continue;
    if (location.expMult > bestExp) {
      best = name;
      bestExp = location.expMult;
    }
  }
  return best;
}

export interface StationLayout {
  /** Station node center, in the 1340×640 viewBox. */
  x: number;
  y: number;
  /**
   * Absolute label top-left (used verbatim for the mock city). When absent the
   * label renders centered below the node (or above, with labelAbove).
   */
  label?: { x: number; y: number };
  /** Default-positioned labels only: place above the node (staggers dense rows). */
  labelAbove?: boolean;
}

export interface CityMapLayout {
  /** SVG path per category line (5px rounded stroke, mock visual language). */
  lines: Record<TransitCategory, string>;
  stations: Partial<Record<LocationName, StationLayout>>;
}

export const cityMapLayouts: Record<CityName, CityMapLayout> = {
  /**
   * Volhaven — verbatim from the design mock (design-notes-3B-citymap.md).
   * The mock's "ZB Defense" station is SysCore Securities (the only Volhaven
   * location without a mock station of its own name).
   */
  [CityName.Volhaven]: {
    lines: {
      commerce: "M 180 480 L 400 480 L 520 360 L 820 360 L 960 220",
      training: "M 300 140 L 620 140 L 760 280 L 760 500",
      street: "M 180 220 L 380 220 L 520 360 L 640 480 L 1060 480",
    },
    stations: {
      [LocationName.VolhavenZBInstituteOfTechnology]: { x: 300, y: 140, label: { x: 262, y: 104 } },
      [LocationName.VolhavenMilleniumFitnessGym]: { x: 620, y: 140, label: { x: 572, y: 104 } },
      [LocationName.TravelAgency]: { x: 180, y: 220, label: { x: 130, y: 184 } },
      [LocationName.Hospital]: { x: 380, y: 220, label: { x: 344, y: 184 } },
      [LocationName.WorldStockExchange]: { x: 960, y: 220, label: { x: 912, y: 184 } },
      [LocationName.VolhavenHeliosLabs]: { x: 760, y: 280, label: { x: 786, y: 262 } },
      [LocationName.VolhavenOmniTekIncorporated]: { x: 520, y: 360, label: { x: 452, y: 322 } },
      [LocationName.VolhavenNWO]: { x: 820, y: 360, label: { x: 846, y: 340 } },
      [LocationName.VolhavenCompuTek]: { x: 180, y: 480, label: { x: 132, y: 444 } },
      [LocationName.VolhavenLexoCorp]: { x: 400, y: 480, label: { x: 364, y: 444 } },
      [LocationName.VolhavenSysCoreSecurities]: { x: 640, y: 480, label: { x: 606, y: 508 } },
      [LocationName.VolhavenOmniaCybersystems]: { x: 760, y: 500, label: { x: 716, y: 530 } },
      [LocationName.Slums]: { x: 1060, y: 480, label: { x: 1004, y: 512 } },
    },
  },

  /**
   * Sector-12 — largest network. The street line crosses the commerce line at
   * the CIA (top run) and the NSA (on the commerce diagonal), the city's two
   * real interchanges.
   */
  [CityName.Sector12]: {
    lines: {
      commerce: "M 120 160 L 660 160 L 840 340 L 840 560 L 1240 560",
      training: "M 140 400 L 380 400 L 520 540",
      street: "M 360 160 L 360 300 L 800 300 L 940 440",
    },
    stations: {
      [LocationName.Sector12FoodNStuff]: { x: 120, y: 160 },
      [LocationName.Sector12JoesGuns]: { x: 240, y: 160 },
      [LocationName.Sector12CIA]: { x: 360, y: 160, labelAbove: true },
      [LocationName.Sector12AlphaEnterprises]: { x: 480, y: 160 },
      [LocationName.Sector12CarmichaelSecurity]: { x: 600, y: 160, labelAbove: true },
      [LocationName.Sector12DeltaOne]: { x: 720, y: 220 },
      [LocationName.Sector12NSA]: { x: 800, y: 300 },
      [LocationName.Sector12MegaCorp]: { x: 840, y: 410, label: { x: 862, y: 404 } },
      [LocationName.Sector12BladeIndustries]: { x: 840, y: 490, label: { x: 862, y: 484 } },
      [LocationName.Sector12UniversalEnergy]: { x: 840, y: 560 },
      [LocationName.Sector12IcarusMicrosystems]: { x: 940, y: 560, labelAbove: true },
      [LocationName.Sector12FourSigma]: { x: 1040, y: 560 },
      [LocationName.TravelAgency]: { x: 1140, y: 560, labelAbove: true },
      [LocationName.WorldStockExchange]: { x: 1240, y: 560 },
      [LocationName.Sector12CityHall]: { x: 360, y: 300 },
      [LocationName.Slums]: { x: 940, y: 440 },
      [LocationName.Sector12IronGym]: { x: 140, y: 400 },
      [LocationName.Sector12RothmanUniversity]: { x: 260, y: 400, labelAbove: true },
      [LocationName.Sector12PowerhouseGym]: { x: 380, y: 400 },
      [LocationName.Hospital]: { x: 520, y: 540 },
    },
  },

  /** Aevum — long commerce loop (13 gold stations), short training and street stubs. */
  [CityName.Aevum]: {
    lines: {
      commerce: "M 100 140 L 700 140 L 880 320 L 880 560 L 1240 560",
      training: "M 160 340 L 400 340 L 540 480",
      street: "M 980 240 L 1100 360 L 1240 360",
    },
    stations: {
      [LocationName.AevumECorp]: { x: 100, y: 140 },
      [LocationName.AevumBachmanAndAssociates]: { x: 220, y: 140, labelAbove: true },
      [LocationName.AevumClarkeIncorporated]: { x: 340, y: 140 },
      [LocationName.AevumFulcrumTechnologies]: { x: 460, y: 140, labelAbove: true },
      [LocationName.AevumGalacticCybersystems]: { x: 580, y: 140 },
      [LocationName.AevumAeroCorp]: { x: 700, y: 140, labelAbove: true },
      [LocationName.AevumNetLinkTechnologies]: { x: 790, y: 230 },
      [LocationName.AevumWatchdogSecurity]: { x: 880, y: 360, label: { x: 902, y: 354 } },
      [LocationName.AevumRhoConstruction]: { x: 880, y: 460, label: { x: 902, y: 454 } },
      [LocationName.AevumPolice]: { x: 880, y: 560 },
      [LocationName.TravelAgency]: { x: 1000, y: 560, labelAbove: true },
      [LocationName.AevumCasino]: { x: 1120, y: 560 },
      [LocationName.WorldStockExchange]: { x: 1240, y: 560, labelAbove: true },
      [LocationName.AevumCrushFitnessGym]: { x: 160, y: 340 },
      [LocationName.AevumSummitUniversity]: { x: 280, y: 340, labelAbove: true },
      [LocationName.AevumSnapFitnessGym]: { x: 400, y: 340 },
      [LocationName.Hospital]: { x: 540, y: 480 },
      [LocationName.Slums]: { x: 1100, y: 360 },
    },
  },

  /** Chongqing — sparse; the street line carries its two Special spots and the Slums. */
  [CityName.Chongqing]: {
    lines: {
      commerce: "M 200 200 L 560 200 L 720 360 L 1040 360",
      training: "M 260 480 L 560 480",
      street: "M 700 120 L 920 120 L 1060 260 L 1060 460",
    },
    stations: {
      [LocationName.TravelAgency]: { x: 200, y: 200 },
      [LocationName.ChongqingKuaiGongInternational]: { x: 400, y: 200 },
      [LocationName.ChongqingSolarisSpaceSystems]: { x: 640, y: 280 },
      [LocationName.WorldStockExchange]: { x: 880, y: 360 },
      [LocationName.Hospital]: { x: 410, y: 480 },
      [LocationName.ChongqingChurchOfTheMachineGod]: { x: 700, y: 120 },
      [LocationName.ChongqingShadowedWalkway]: { x: 990, y: 190 },
      [LocationName.Slums]: { x: 1060, y: 400, label: { x: 1082, y: 394 } },
    },
  },

  /**
   * New Tokyo — the street line square-waves across the commerce line three
   * times: DefComm, Noodle Bar and VitaLife are all real Company+Special
   * interchanges.
   */
  [CityName.NewTokyo]: {
    lines: {
      commerce: "M 160 320 L 1180 320",
      training: "M 140 560 L 480 560",
      street: "M 300 140 L 300 460 L 620 460 L 620 140 L 940 140 L 940 460",
    },
    stations: {
      [LocationName.TravelAgency]: { x: 160, y: 320 },
      [LocationName.NewTokyoDefComm]: { x: 300, y: 320, labelAbove: true },
      [LocationName.NewTokyoGlobalPharmaceuticals]: { x: 460, y: 320 },
      [LocationName.NewTokyoNoodleBar]: { x: 620, y: 320, labelAbove: true },
      [LocationName.NewTokyoVitaLife]: { x: 940, y: 320, labelAbove: true },
      [LocationName.WorldStockExchange]: { x: 1100, y: 320 },
      [LocationName.NewTokyoArcade]: { x: 460, y: 460 },
      [LocationName.Slums]: { x: 780, y: 140 },
      [LocationName.Hospital]: { x: 300, y: 560 },
    },
  },

  /** Ishima — commerce hook plus a short street run ending at the 0x6C1 glitch. */
  [CityName.Ishima]: {
    lines: {
      commerce: "M 180 180 L 620 180 L 780 340 L 1100 340",
      training: "M 900 480 L 1160 480",
      street: "M 260 460 L 620 460 L 740 580",
    },
    stations: {
      [LocationName.TravelAgency]: { x: 180, y: 180 },
      [LocationName.IshimaStormTechnologies]: { x: 400, y: 180 },
      [LocationName.IshimaNovaMedical]: { x: 620, y: 180 },
      [LocationName.IshimaOmegaSoftware]: { x: 700, y: 260 },
      [LocationName.WorldStockExchange]: { x: 940, y: 340 },
      [LocationName.Hospital]: { x: 1030, y: 480 },
      [LocationName.Slums]: { x: 400, y: 460 },
      [LocationName.IshimaGlitch]: { x: 740, y: 580, labelAbove: true },
    },
  },
};
