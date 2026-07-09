/**
 * Tests for the world map geometry module. City positions must come from the
 * ORIGINAL ASCII world map (src/ui/React/WorldMap.tsx): these tests re-derive
 * each city letter's (col, row) from that source file and assert the module's
 * hardcoded CITY_ART_COORDS match, that projected positions stay in bounds,
 * and that the art's relative geography survives normalization.
 */

import * as fs from "fs";
import * as path from "path";

import { CityName } from "@enums";
import {
  ART_COLS,
  ART_ROWS,
  artToSvg,
  CITY_ART_COORDS,
  getFlightArc,
  LANDMASS_OUTLINES,
  MAP_HEIGHT,
  MAP_WIDTH,
  worldMapCities,
} from "../../../../src/ui/Maps/worldMapData";

const ALL_CITIES = Object.values(CityName);

/**
 * Letter each city's <City/> element renders as (first character of its display
 * name), keyed by the CityName enum identifier used in the JSX. The art itself
 * contains no alphabetic characters, so these letters are unambiguous.
 */
const LETTER_BY_IDENTIFIER: Record<string, string> = {
  Volhaven: "V",
  Chongqing: "C",
  Sector12: "S",
  NewTokyo: "N",
  Aevum: "A",
  Ishima: "I",
};
const CITY_BY_LETTER: Record<string, CityName> = {
  V: CityName.Volhaven,
  C: CityName.Chongqing,
  S: CityName.Sector12,
  N: CityName.NewTokyo,
  A: CityName.Aevum,
  I: CityName.Ishima,
};

/** Parse the original ASCII art and return each city's (col, row), 0-based. */
function artCoordsFromSource(): Record<CityName, { col: number; row: number }> {
  const source = fs.readFileSync(path.join(__dirname, "../../../../src/ui/React/WorldMap.tsx"), "utf8");
  const lines = source.split(/\r?\n/).filter((line) => line.includes("whiteSpace: 'pre'"));
  expect(lines).toHaveLength(ART_ROWS);
  const coords = {} as Record<CityName, { col: number; row: number }>;
  lines.forEach((line, row) => {
    const match = /<Typography[^>]*>(.*)<\/Typography>/.exec(line);
    expect(match).not.toBeNull();
    if (!match) return;
    // Each embedded <City .../> renders as exactly one character: the city's letter.
    const rendered = match[1].replace(
      /<City [^/]*city=\{CityName\.(\w+)\} \/>/g,
      (_, name: string) => LETTER_BY_IDENTIFIER[name],
    );
    for (let col = 0; col < rendered.length; col++) {
      const city = CITY_BY_LETTER[rendered[col]];
      if (city) coords[city] = { col, row };
    }
  });
  return coords;
}

describe("city positions from the original ASCII art", () => {
  it("CITY_ART_COORDS matches the letter positions in src/ui/React/WorldMap.tsx", () => {
    const fromSource = artCoordsFromSource();
    for (const city of ALL_CITIES) {
      expect(CITY_ART_COORDS[city]).toEqual(fromSource[city]);
    }
  });

  it("has a node center for all six cities, inside the canvas with margin", () => {
    for (const city of ALL_CITIES) {
      const { x, y } = worldMapCities[city].center;
      expect(x).toBeGreaterThan(40);
      expect(x).toBeLessThan(MAP_WIDTH - 40);
      expect(y).toBeGreaterThan(40);
      expect(y).toBeLessThan(MAP_HEIGHT - 40);
    }
  });

  it("preserves the art's west-to-east ordering: Sector-12, Aevum, Volhaven, Chongqing, Ishima, New Tokyo", () => {
    const x = (city: CityName) => worldMapCities[city].center.x;
    expect(x(CityName.Sector12)).toBeLessThan(x(CityName.Aevum));
    expect(x(CityName.Aevum)).toBeLessThan(x(CityName.Volhaven));
    expect(x(CityName.Volhaven)).toBeLessThan(x(CityName.Chongqing));
    expect(x(CityName.Chongqing)).toBeLessThan(x(CityName.Ishima));
    expect(x(CityName.Ishima)).toBeLessThan(x(CityName.NewTokyo));
  });

  it("preserves the art's north-to-south ordering: Volhaven, Chongqing, Sector-12, New Tokyo, Aevum, Ishima", () => {
    const y = (city: CityName) => worldMapCities[city].center.y;
    expect(y(CityName.Volhaven)).toBeLessThan(y(CityName.Chongqing));
    expect(y(CityName.Chongqing)).toBeLessThan(y(CityName.Sector12));
    expect(y(CityName.Sector12)).toBeLessThan(y(CityName.NewTokyo));
    expect(y(CityName.NewTokyo)).toBeLessThan(y(CityName.Aevum));
    expect(y(CityName.Aevum)).toBeLessThan(y(CityName.Ishima));
  });

  it("projects the full art grid inside the canvas", () => {
    for (const [col, row] of [
      [0, 0],
      [ART_COLS - 1, 0],
      [0, ART_ROWS - 1],
      [ART_COLS - 1, ART_ROWS - 1],
    ]) {
      const { x, y } = artToSvg(col, row);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(MAP_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });
});

describe("landmass outlines", () => {
  it("provides a handful of closed coastline paths", () => {
    expect(LANDMASS_OUTLINES.length).toBeGreaterThanOrEqual(3);
    expect(LANDMASS_OUTLINES.length).toBeLessThanOrEqual(5);
    for (const d of LANDMASS_OUTLINES) {
      expect(d).toMatch(/^M /);
      expect(d).toMatch(/ Z$/);
    }
  });

  it("keeps every outline coordinate inside the canvas", () => {
    for (const d of LANDMASS_OUTLINES) {
      const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
      expect(numbers.length).toBeGreaterThan(0);
      for (let i = 0; i < numbers.length; i += 2) {
        expect(Number(numbers[i])).toBeGreaterThanOrEqual(0);
        expect(Number(numbers[i])).toBeLessThanOrEqual(MAP_WIDTH);
        expect(Number(numbers[i + 1])).toBeGreaterThanOrEqual(0);
        expect(Number(numbers[i + 1])).toBeLessThanOrEqual(MAP_HEIGHT);
      }
    }
  });
});

describe("flight arcs", () => {
  it("connects the two cities' node centers", () => {
    const arc = getFlightArc(CityName.Sector12, CityName.NewTokyo);
    const from = worldMapCities[CityName.Sector12].center;
    const to = worldMapCities[CityName.NewTokyo].center;
    expect(arc.path.startsWith(`M ${from.x} ${from.y} `)).toBe(true);
    expect(arc.path.endsWith(` ${to.x} ${to.y}`)).toBe(true);
  });

  it("generates an arc for every ordered city pair", () => {
    for (const from of ALL_CITIES) {
      for (const to of ALL_CITIES) {
        if (from === to) continue;
        const arc = getFlightArc(from, to);
        expect(arc.path).toMatch(/^M .* Q .*$/);
        expect(arc.waypoint.x).toBeGreaterThanOrEqual(0);
        expect(arc.waypoint.x).toBeLessThanOrEqual(MAP_WIDTH);
      }
    }
  });

  it("throws for a city-to-itself route", () => {
    expect(() => getFlightArc(CityName.Aevum, CityName.Aevum)).toThrow();
  });
});
