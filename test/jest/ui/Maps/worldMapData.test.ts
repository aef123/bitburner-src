/**
 * Tests for the world map geometry module. City positions and coastline
 * strokes must come from the ORIGINAL ASCII world map, now living in the
 * shared module src/ui/React/worldMapArt.ts (consumed by BOTH the classic
 * text map and the vector map). These tests pin the shared art's shape and
 * city letter positions (anti-drift), assert CITY_ART_COORDS derives from it,
 * that projected positions stay in bounds, that the art's relative geography
 * survives normalization, and that the vectorized coastline covers every
 * non-space glyph except the city letters.
 */

import { CityName } from "@enums";
import {
  ART_COLS,
  ART_ROWS,
  artToSvg,
  CITY_ART_COORDS,
  COASTLINE_STROKES,
  getFlightArc,
  MAP_HEIGHT,
  MAP_WIDTH,
  worldMapCities,
} from "../../../../src/ui/Maps/worldMapData";
import { CITY_LETTER_TO_NAME, WORLD_MAP_ART } from "../../../../src/ui/React/worldMapArt";

const ALL_CITIES = Object.values(CityName);

/**
 * The verified (col, row) of each city letter in the original art. These are
 * the anti-drift anchors: if someone edits the shared art and a city letter
 * moves, this fails loudly instead of silently relocating a city.
 */
const EXPECTED_CITY_COORDS: Record<CityName, { col: number; row: number }> = {
  [CityName.Aevum]: { col: 25, row: 14 },
  [CityName.Chongqing]: { col: 51, row: 5 },
  [CityName.Ishima]: { col: 60, row: 16 },
  [CityName.NewTokyo]: { col: 61, row: 7 },
  [CityName.Sector12]: { col: 17, row: 6 },
  [CityName.Volhaven]: { col: 36, row: 3 },
};

describe("shared ASCII art module", () => {
  it("has the original art's shape: 22 rows, 69 columns at the widest", () => {
    expect(WORLD_MAP_ART).toHaveLength(ART_ROWS);
    expect(Math.max(...WORLD_MAP_ART.map((line) => line.length))).toBe(ART_COLS);
  });

  it("contains each city letter exactly once, at its verified position", () => {
    const found = {} as Record<CityName, { col: number; row: number }[]>;
    for (const city of ALL_CITIES) found[city] = [];
    WORLD_MAP_ART.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        const city = CITY_LETTER_TO_NAME[line[col]];
        if (city) found[city].push({ col, row });
      }
    });
    for (const city of ALL_CITIES) {
      expect(found[city]).toEqual([EXPECTED_CITY_COORDS[city]]);
    }
  });

  it("maps every city's first letter to it, and contains no other letters", () => {
    for (const city of ALL_CITIES) {
      expect(CITY_LETTER_TO_NAME[city[0]]).toBe(city);
    }
    for (const line of WORLD_MAP_ART) {
      for (const char of line) {
        if (/[a-zA-Z]/.test(char)) expect(CITY_LETTER_TO_NAME[char]).toBeDefined();
      }
    }
  });
});

describe("city positions from the original ASCII art", () => {
  it("CITY_ART_COORDS derives the verified letter positions from the shared art", () => {
    for (const city of ALL_CITIES) {
      expect(CITY_ART_COORDS[city]).toEqual(EXPECTED_CITY_COORDS[city]);
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

describe("vectorized coastline strokes", () => {
  it("emits one stroke per non-space, non-city-letter glyph (the art is dense: > 300)", () => {
    let glyphs = 0;
    for (const line of WORLD_MAP_ART) {
      for (const char of line) {
        if (char !== " " && !CITY_LETTER_TO_NAME[char]) glyphs++;
      }
    }
    expect(glyphs).toBeGreaterThan(300);
    expect(COASTLINE_STROKES).toHaveLength(glyphs);
  });

  it("keeps every stroke endpoint inside the canvas", () => {
    for (const s of COASTLINE_STROKES) {
      for (const v of [s.x1, s.x2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(MAP_WIDTH);
      }
      for (const v of [s.y1, s.y2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(MAP_HEIGHT);
      }
    }
  });

  it("places no stroke inside any city letter's cell", () => {
    // A stroke never leaves its own cell, so its midpoint identifies the cell.
    const halfCellW = (artToSvg(1, 0).x - artToSvg(0, 0).x) / 2;
    const halfCellH = (artToSvg(0, 1).y - artToSvg(0, 0).y) / 2;
    for (const city of ALL_CITIES) {
      const { col, row } = CITY_ART_COORDS[city];
      const center = artToSvg(col, row);
      for (const s of COASTLINE_STROKES) {
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        const inCell = Math.abs(mx - center.x) < halfCellW && Math.abs(my - center.y) < halfCellH;
        expect(inCell).toBe(false);
      }
    }
  });

  it("gives every stroke a visible, sub-opaque opacity", () => {
    for (const s of COASTLINE_STROKES) {
      expect(s.opacity).toBeGreaterThan(0.2);
      expect(s.opacity).toBeLessThan(1);
    }
  });

  it("orients glyphs: / rises, \\ falls, | is vertical, - is horizontal", () => {
    // Row 2 opens with "  /~~-\_/..." — art (2,2) is '/', (6,2) is '\'.
    const strokeAtCell = (col: number, row: number) => {
      const center = artToSvg(col, row);
      const halfCellW = (artToSvg(1, 0).x - artToSvg(0, 0).x) / 2;
      const halfCellH = (artToSvg(0, 1).y - artToSvg(0, 0).y) / 2;
      const stroke = COASTLINE_STROKES.find(
        (s) => Math.abs((s.x1 + s.x2) / 2 - center.x) < halfCellW && Math.abs((s.y1 + s.y2) / 2 - center.y) < halfCellH,
      );
      expect(stroke).toBeDefined();
      return stroke as (typeof COASTLINE_STROKES)[number];
    };
    expect(WORLD_MAP_ART[2][2]).toBe("/");
    const rising = strokeAtCell(2, 2);
    expect(Math.sign((rising.x2 - rising.x1) * (rising.y2 - rising.y1))).toBe(-1);
    expect(WORLD_MAP_ART[2][6]).toBe("\\");
    const falling = strokeAtCell(6, 2);
    expect(Math.sign((falling.x2 - falling.x1) * (falling.y2 - falling.y1))).toBe(1);
    expect(WORLD_MAP_ART[2][5]).toBe("-");
    const horizontal = strokeAtCell(5, 2);
    expect(horizontal.y1).toBe(horizontal.y2);
    expect(horizontal.x1).not.toBe(horizontal.x2);
    expect(WORLD_MAP_ART[7][11]).toBe("|");
    const vertical = strokeAtCell(11, 7);
    expect(vertical.x1).toBe(vertical.x2);
    expect(vertical.y1).not.toBe(vertical.y2);
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
