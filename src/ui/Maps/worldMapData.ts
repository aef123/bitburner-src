/**
 * Geometry for the World Map (3A), derived from the ORIGINAL ASCII world map
 * (shared source: src/ui/React/worldMapArt.ts) so the redesigned map reads as
 * the same world players already know.
 *
 * The art is 22 rows tall and 69 columns wide at its widest. Each city's
 * single letter (V/C/S/N/A/I) sits at a fixed (col, row) in those lines;
 * CITY_ART_COORDS is scanned from the shared art and artToSvg projects art
 * cells onto the 1010×680 canvas. Monospace glyphs are about half as wide as
 * they are tall, so columns are scaled by CHAR_ASPECT = 0.5 — without it the
 * map would look vertically stretched relative to the terminal art.
 *
 * CONTINENTS turn the art into soft filled landmasses (see buildContinents):
 * every coastline glyph is assigned to the continent of the nearest city by a
 * breadth-first flood over the glyph grid, then each continent becomes one or
 * more closed band polygons that hug its glyphs row by row. The shapes follow
 * the original map by construction; WorldMap3A renders them as barely-visible
 * blurred fills clipped to the globe ellipse.
 */
import { CityName } from "@enums";

import { CITY_LETTER_TO_NAME, WORLD_MAP_ART } from "../React/worldMapArt";

export const MAP_WIDTH = 1010;
export const MAP_HEIGHT = 680;

export interface Point {
  x: number;
  y: number;
}

/** Latitude ellipses of the graticule (opacity is applied to the theme's accentCyan). */
export const GRATICULE_ELLIPSES = [
  { cx: 505, cy: 340, rx: 460, ry: 290, opacity: 0.07 },
  { cx: 505, cy: 340, rx: 330, ry: 290, opacity: 0.05 },
  { cx: 505, cy: 340, rx: 160, ry: 290, opacity: 0.05 },
] as const;

/** Equator + tropic lines of the graticule. */
export const GRATICULE_LINES = [
  { x1: 45, y1: 340, x2: 965, y2: 340, opacity: 0.07 },
  { x1: 65, y1: 200, x2: 945, y2: 200, opacity: 0.05 },
  { x1: 65, y1: 480, x2: 945, y2: 480, opacity: 0.05 },
] as const;

/** The ASCII art grid of src/ui/React/WorldMap.tsx: 22 rows, longest row 69 chars. */
export const ART_COLS = 69;
export const ART_ROWS = 22;
/** Terminal glyphs are ~half as wide as tall; keeps the art's proportions on the canvas. */
const CHAR_ASPECT = 0.5;
/** Margin keeps nodes and labels clear of the header overlay and the canvas edge. */
const ART_MARGIN = 60;
const ART_SCALE = Math.min(
  (MAP_WIDTH - 2 * ART_MARGIN) / (ART_COLS * CHAR_ASPECT),
  (MAP_HEIGHT - 2 * ART_MARGIN) / ART_ROWS,
);
const ART_ORIGIN_X = (MAP_WIDTH - ART_COLS * CHAR_ASPECT * ART_SCALE) / 2;
const ART_ORIGIN_Y = (MAP_HEIGHT - ART_ROWS * ART_SCALE) / 2;

/** Canvas position of the center of the art cell at (col, row). Fractional cells allowed. */
export function artToSvg(col: number, row: number): Point {
  return {
    x: Math.round(ART_ORIGIN_X + (col + 0.5) * CHAR_ASPECT * ART_SCALE),
    y: Math.round(ART_ORIGIN_Y + (row + 0.5) * ART_SCALE),
  };
}

/**
 * (col, row) of each city letter in the original ASCII art — the positions
 * players know, scanned from the shared art source (rows are 0-based line
 * indices, cols are 0-based character positions). Expected values, guarded by
 * tests: Sector-12 (17,6), Aevum (25,14), Volhaven (36,3), Chongqing (51,5),
 * New Tokyo (61,7), Ishima (60,16).
 */
export const CITY_ART_COORDS: Record<CityName, { col: number; row: number }> = (() => {
  const coords = {} as Record<CityName, { col: number; row: number }>;
  WORLD_MAP_ART.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const city = CITY_LETTER_TO_NAME[line[col]];
      if (city) coords[city] = { col, row };
    }
  });
  return coords;
})();

export interface WorldMapCityDatum {
  /** Center of the city node, projected from the art letter's cell. */
  center: Point;
}

export const worldMapCities: Record<CityName, WorldMapCityDatum> = Object.values(CityName).reduce((acc, city) => {
  const { col, row } = CITY_ART_COORDS[city];
  acc[city] = { center: artToSvg(col, row) };
  return acc;
}, {} as Record<CityName, WorldMapCityDatum>);

/** One glyph cell of the ASCII art, in art-grid coordinates. */
export interface ArtCell {
  col: number;
  row: number;
}

/** A landmass derived from the art, anchored by the city whose letter sits on it. */
export interface Continent {
  city: CityName;
  /** The art cells assigned to this continent (its city's own cell included). */
  cells: readonly ArtCell[];
  /**
   * Closed band polygons in canvas coordinates, one per contiguous run of art
   * rows: each row contributes [minCol − ½ … maxCol + ½], so the outline hugs
   * the art's glyphs instead of bulging like a convex hull would.
   */
  polygons: readonly (readonly Point[])[];
  /** The polygons smoothed into closed SVG paths (quadratic curves through edge midpoints). */
  paths: readonly string[];
}

/** Fixed seed order makes the flood fill fully deterministic. */
const CONTINENT_SEED_ORDER: readonly CityName[] = [
  CityName.Sector12,
  CityName.Aevum,
  CityName.Volhaven,
  CityName.Chongqing,
  CityName.NewTokyo,
  CityName.Ishima,
];
/** Glyphs within this Chebyshev distance belong to the same landmass while flooding. */
const CLUSTER_TOLERANCE = 2;
/**
 * The first hop away from a city letter uses a wider reach: the letters sit in
 * a pocket of open water in the art (Chongqing's nearest coastline glyph is 4
 * cells away), so a plain tolerance-2 flood would leave some cities landless.
 */
const SEED_REACH = 4;
/** Row-blocks with fewer cells than this render as slivers; they get no polygon. */
const MIN_BLOCK_CELLS = 3;

/** Quadratic-midpoint smoothing: a closed path through the midpoints of the polygon's edges. */
function smoothClosedPath(points: readonly Point[]): string {
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = mid(points[0], points[1]);
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i <= points.length; i++) {
    const p = points[i % points.length];
    const m = mid(p, points[(i + 1) % points.length]);
    d += ` Q ${p.x} ${p.y} ${m.x} ${m.y}`;
  }
  return `${d} Z`;
}

/**
 * Band polygons for one continent: rows are grouped into contiguous blocks and
 * each block becomes a closed polygon — down the right edge (maxCol + ½ per
 * row), back up the left edge (minCol − ½), with the first/last rows extended
 * half a cell so the shape covers those cells fully. Following the per-row
 * extents keeps the elongated coastlines of the art (a convex hull would fill
 * the oceans between them).
 */
function bandPolygons(cells: readonly ArtCell[]): Point[][] {
  const bands = new Map<number, { min: number; max: number; count: number }>();
  for (const { col, row } of cells) {
    const band = bands.get(row);
    if (band) {
      band.min = Math.min(band.min, col);
      band.max = Math.max(band.max, col);
      band.count++;
    } else {
      bands.set(row, { min: col, max: col, count: 1 });
    }
  }
  const sortedBands = [...bands.entries()]
    .map(([row, band]) => ({ row, ...band }))
    .sort((a, b) => a.row - b.row);
  const blocks: (typeof sortedBands)[] = [];
  for (const band of sortedBands) {
    const block = blocks[blocks.length - 1];
    if (block && band.row === block[block.length - 1].row + 1) block.push(band);
    else blocks.push([band]);
  }
  const polygons: Point[][] = [];
  for (const block of blocks) {
    if (block.reduce((sum, band) => sum + band.count, 0) < MIN_BLOCK_CELLS) continue;
    const top = block[0];
    const bottom = block[block.length - 1];
    const right: Point[] = [artToSvg(top.max + 0.5, top.row - 0.5)];
    for (const band of block) right.push(artToSvg(band.max + 0.5, band.row));
    right.push(artToSvg(bottom.max + 0.5, bottom.row + 0.5));
    const left: Point[] = [artToSvg(bottom.min - 0.5, bottom.row + 0.5)];
    for (const band of [...block].reverse()) left.push(artToSvg(band.min - 0.5, band.row));
    left.push(artToSvg(top.min - 0.5, top.row - 0.5));
    const outline = [...right, ...left];
    // artToSvg rounds to integers, so consecutive vertices can collapse; drop the duplicates.
    polygons.push(outline.filter((p, i) => i === 0 || p.x !== outline[i - 1].x || p.y !== outline[i - 1].y));
  }
  return polygons;
}

/**
 * Assign every coastline glyph to the continent of the nearest city, by a
 * layered breadth-first flood over the glyph grid (Chebyshev adjacency
 * CLUSTER_TOLERANCE, first hop SEED_REACH). The flood splits the art's two
 * big connected landmass outlines into city-anchored continents at natural
 * midpoints, so the per-row bands never span an ocean. A couple of isolated
 * ocean-ripple glyphs (fewer than 6 cells) are reachable from no city and are
 * deliberately left out. Fully deterministic: fixed seed order, row-major
 * neighbor scans.
 */
export function buildContinents(): Continent[] {
  const keyOf = (col: number, row: number): string => `${col},${row}`;
  const land = new Map<string, ArtCell>();
  WORLD_MAP_ART.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char !== " " && !CITY_LETTER_TO_NAME[char]) land.set(keyOf(col, row), { col, row });
    }
  });
  const assigned = new Map<string, CityName>();
  const claimAround = (city: CityName, center: ArtCell, reach: number, out: ArtCell[]): void => {
    for (let dRow = -reach; dRow <= reach; dRow++) {
      for (let dCol = -reach; dCol <= reach; dCol++) {
        const key = keyOf(center.col + dCol, center.row + dRow);
        const cell = land.get(key);
        if (cell && !assigned.has(key)) {
          assigned.set(key, city);
          out.push(cell);
        }
      }
    }
  };
  let frontier = CONTINENT_SEED_ORDER.map((city) => {
    const claimed: ArtCell[] = [];
    claimAround(city, CITY_ART_COORDS[city], SEED_REACH, claimed);
    return { city, claimed };
  });
  while (frontier.some((f) => f.claimed.length > 0)) {
    frontier = frontier.map(({ city, claimed }) => {
      const next: ArtCell[] = [];
      for (const cell of claimed) claimAround(city, cell, CLUSTER_TOLERANCE, next);
      return { city, claimed: next };
    });
  }
  return CONTINENT_SEED_ORDER.map((city) => {
    // The city's own cell is part of its continent: cities stand on land.
    const cells: ArtCell[] = [CITY_ART_COORDS[city]];
    for (const [key, owner] of assigned) {
      if (owner === city) cells.push(land.get(key) as ArtCell);
    }
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    const polygons = bandPolygons(cells);
    return { city, cells, polygons, paths: polygons.map(smoothClosedPath) };
  });
}

/** The soft landmasses of the world map, generated once from the shared art. */
export const CONTINENTS: readonly Continent[] = buildContinents();

interface Arc {
  start: Point;
  control: Point;
  end: Point;
}

/**
 * Control point for a flight arc: bow the curve upward from the midpoint,
 * perpendicular to the route, mimicking a great-circle look.
 */
function generatedControl(a: Point, b: Point): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector, sign chosen so the arc bows toward the top of the map.
  let px = dy / dist;
  let py = -dx / dist;
  if (py > 0 || (py === 0 && px < 0)) {
    px = -px;
    py = -py;
  }
  const k = Math.min(dist * 0.35, 120);
  return { x: mid.x + px * k, y: mid.y + py * k };
}

export interface FlightArc {
  /** SVG path ("M … Q …") for the dashed arc. */
  path: string;
  /** Point at t=0.5 on the curve — where the waypoint dot goes on highlighted arcs. */
  waypoint: Point;
}

/** Quadratic bezier point at t = 0.5. */
function quadraticMidpoint(a: Point, c: Point, b: Point): Point {
  return { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 };
}

function toFlightArc(arc: Arc): FlightArc {
  return {
    path: `M ${arc.start.x} ${arc.start.y} Q ${arc.control.x} ${arc.control.y} ${arc.end.x} ${arc.end.y}`,
    waypoint: quadraticMidpoint(arc.start, arc.control, arc.end),
  };
}

/** Flight arc between two cities' node centers. */
export function getFlightArc(from: CityName, to: CityName): FlightArc {
  if (from === to) throw new Error(`No flight arc from ${from} to itself`);
  const a = worldMapCities[from].center;
  const b = worldMapCities[to].center;
  return toFlightArc({ start: a, control: generatedControl(a, b), end: b });
}
