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
 * COASTLINE_STROKES vectorize the art itself: every non-space, non-city-letter
 * glyph becomes one short line segment through the same projection, oriented
 * by what the glyph looks like in a terminal (/ rises, \ falls, | vertical,
 * -/_/~ horizontal, ,'.";  short ticks). The continents therefore match the
 * original map by construction.
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

/** One vectorized art glyph: a line segment in canvas coordinates. */
export interface CoastStroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Stroke opacity: full-cell glyphs read stronger than the small tick glyphs. */
  opacity: number;
}

/**
 * Per-glyph segment, in art-cell units relative to the glyph's cell center:
 * [dCol1, dRow1, dCol2, dRow2, opacity]. ±0.5 reaches the cell edge, so the
 * full-cell glyphs (/ \ | - _ ~) chain up with their neighbors exactly like
 * the characters do in the terminal art. Diagonals run corner-to-corner, which
 * (with CHAR_ASPECT) reproduces the steep slope a / or \ has in a 1:2 cell.
 */
type GlyphSegment = readonly [dCol1: number, dRow1: number, dCol2: number, dRow2: number, opacity: number];
const FULL_OPACITY = 0.65;
const SOFT_OPACITY = 0.55;
const TICK_OPACITY = 0.4;
const GLYPH_SEGMENTS: Record<string, GlyphSegment> = {
  "/": [-0.5, 0.5, 0.5, -0.5, FULL_OPACITY], // rising diagonal (SW→NE)
  "\\": [-0.5, -0.5, 0.5, 0.5, FULL_OPACITY], // falling diagonal (NW→SE)
  "|": [0, -0.5, 0, 0.5, FULL_OPACITY], // vertical
  "-": [-0.5, 0, 0.5, 0, FULL_OPACITY], // horizontal, mid-cell
  _: [-0.5, 0.45, 0.5, 0.45, FULL_OPACITY], // horizontal, on the baseline
  "~": [-0.5, 0, 0.5, 0, SOFT_OPACITY], // gentle horizontal
  ",": [0.08, 0.15, -0.08, 0.45, TICK_OPACITY], // short low tick
  "'": [0.08, -0.45, -0.08, -0.15, TICK_OPACITY], // short high tick
  ".": [-0.12, 0.4, 0.12, 0.4, TICK_OPACITY], // small baseline dash
  '"': [0, -0.45, 0, -0.15, TICK_OPACITY], // short high tick
  ";": [0.08, -0.05, -0.08, 0.4, TICK_OPACITY], // tick through the lower half
  ")": [0.1, -0.4, 0.1, 0.4, SOFT_OPACITY], // near-vertical
};
/** Fallback for any glyph without a mapping: a small mid-cell tick. */
const DEFAULT_SEGMENT: GlyphSegment = [-0.12, 0, 0.12, 0, TICK_OPACITY];

/**
 * The vectorized ASCII art: one stroke per non-space, non-city-letter glyph,
 * projected through artToSvg. City letters are skipped — the city NODES mark
 * those cells.
 */
export const COASTLINE_STROKES: readonly CoastStroke[] = (() => {
  const strokes: CoastStroke[] = [];
  WORLD_MAP_ART.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char === " " || CITY_LETTER_TO_NAME[char]) continue;
      const [dCol1, dRow1, dCol2, dRow2, opacity] = GLYPH_SEGMENTS[char] ?? DEFAULT_SEGMENT;
      const a = artToSvg(col + dCol1, row + dRow1);
      const b = artToSvg(col + dCol2, row + dRow2);
      strokes.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, opacity });
    }
  });
  return strokes;
})();

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
