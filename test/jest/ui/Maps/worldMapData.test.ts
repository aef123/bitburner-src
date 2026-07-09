/**
 * Tests for the world map geometry module. City positions and continents
 * must come from the ORIGINAL ASCII world map, now living in the shared
 * module src/ui/React/worldMapArt.ts (consumed by BOTH the classic text map
 * and the vector map). These tests pin the shared art's shape and city letter
 * positions (anti-drift), assert CITY_ART_COORDS derives from it, that
 * projected positions stay in bounds, that the art's relative geography
 * survives normalization, and that the soft continents cover the art's
 * glyphs: every non-tiny glyph cell is assigned to a continent, the band
 * polygons contain their own cells, every city sits on a continent, and the
 * generation is deterministic.
 */

import { CityName } from "@enums";
import {
  ART_COLS,
  ART_ROWS,
  artToSvg,
  buildContinents,
  CITY_ART_COORDS,
  CONTINENTS,
  getFlightArc,
  MAP_HEIGHT,
  MAP_WIDTH,
  type Point,
  worldMapCities,
} from "../../../../src/ui/Maps/worldMapData";
import { CITY_LETTER_TO_NAME, WORLD_MAP_ART } from "../../../../src/ui/React/worldMapArt";

const ALL_CITIES = Object.values(CityName);

/** Standard ray-casting point-in-polygon (vertices in order, closed implicitly). */
function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function insideAnyPolygon(p: Point, polygons: readonly (readonly Point[])[]): boolean {
  return polygons.some((polygon) => pointInPolygon(p, polygon));
}

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

describe("continents from the original ASCII art", () => {
  it("splits the art into at least three continents, one per anchor city, none tiny", () => {
    expect(CONTINENTS.length).toBeGreaterThanOrEqual(3);
    expect(CONTINENTS.map((c) => c.city).sort()).toEqual([...ALL_CITIES].sort());
    for (const continent of CONTINENTS) {
      expect(continent.cells.length).toBeGreaterThanOrEqual(6);
      expect(continent.polygons.length).toBeGreaterThanOrEqual(1);
      expect(continent.paths).toHaveLength(continent.polygons.length);
    }
  });

  it("assigns every non-space, non-city-letter glyph to a continent, minus a tiny ocean-ripple remainder", () => {
    const glyphs = new Set<string>();
    WORLD_MAP_ART.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        const char = line[col];
        if (char !== " " && !CITY_LETTER_TO_NAME[char]) glyphs.add(`${col},${row}`);
      }
    });
    expect(glyphs.size).toBeGreaterThan(300);
    const assigned = new Set<string>();
    for (const continent of CONTINENTS) {
      for (const cell of continent.cells) assigned.add(`${cell.col},${cell.row}`);
    }
    const unassigned = [...glyphs].filter((key) => !assigned.has(key));
    expect(unassigned.length).toBeLessThan(6);
    // No cell belongs to two continents; the only extra cells are the six city letters.
    expect(CONTINENTS.reduce((sum, c) => sum + c.cells.length, 0)).toBe(glyphs.size - unassigned.length + ALL_CITIES.length);
  });

  it("hugs the art: each continent's polygons contain at least 95% of its own projected cells", () => {
    for (const continent of CONTINENTS) {
      const inside = continent.cells.filter((cell) =>
        insideAnyPolygon(artToSvg(cell.col, cell.row), continent.polygons),
      );
      expect(inside.length / continent.cells.length).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("keeps every polygon vertex inside the canvas", () => {
    for (const continent of CONTINENTS) {
      for (const polygon of continent.polygons) {
        expect(polygon.length).toBeGreaterThanOrEqual(4);
        for (const p of polygon) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(MAP_WIDTH);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(MAP_HEIGHT);
        }
      }
    }
  });

  it("places every city node on a continent (the art puts every city on or next to land)", () => {
    for (const continent of CONTINENTS) {
      expect(insideAnyPolygon(worldMapCities[continent.city].center, continent.polygons)).toBe(true);
    }
  });

  it("emits smooth closed SVG paths (quadratic curves, Z-closed)", () => {
    for (const continent of CONTINENTS) {
      for (const path of continent.paths) {
        expect(path).toMatch(/^M [\d.-]+ [\d.-]+( Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+)+ Z$/);
      }
    }
  });

  it("is deterministic: rebuilding produces identical continents", () => {
    expect(JSON.stringify(buildContinents())).toBe(JSON.stringify(buildContinents()));
    expect(JSON.stringify(buildContinents())).toBe(JSON.stringify(CONTINENTS));
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
