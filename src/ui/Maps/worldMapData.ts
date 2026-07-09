/**
 * Geometry for the World Map (3A), derived from the ORIGINAL ASCII world map
 * (src/ui/React/WorldMap.tsx) so the redesigned map reads as the same world
 * players already know.
 *
 * The art is 22 rows tall and 69 columns wide at its widest. Each city's
 * single letter (V/C/S/N/A/I) sits at a fixed (col, row) in those lines;
 * CITY_ART_COORDS records them verbatim and artToSvg projects art cells onto
 * the 1010×680 canvas. Monospace glyphs are about half as wide as they are
 * tall, so columns are scaled by CHAR_ASPECT = 0.5 — without it the map would
 * look vertically stretched relative to the terminal art.
 *
 * LANDMASS_OUTLINES are hand-traced from the art's coastline characters
 * (/\~-,'|_.) in the same art coordinates: the big western continent with its
 * southern tail (Sector-12 north, Aevum on the tail), the northern mass
 * holding Volhaven, a central-southern mass below it, the large eastern mass
 * (Chongqing, New Tokyo), and the south-eastern island group around Ishima.
 */
import { CityName } from "@enums";

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
/** Margin keeps nodes and labels clear of the header/legend overlays and the canvas edge. */
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
 * players know. Verbatim from the 22 Typography lines of src/ui/React/WorldMap.tsx
 * (rows are 0-based line indices, cols are 0-based character positions after
 * rendering each <City/> as its single letter).
 */
export const CITY_ART_COORDS: Record<CityName, { col: number; row: number }> = {
  [CityName.Aevum]: { col: 25, row: 14 },
  [CityName.Chongqing]: { col: 51, row: 5 },
  [CityName.Ishima]: { col: 60, row: 16 },
  [CityName.NewTokyo]: { col: 61, row: 7 },
  [CityName.Sector12]: { col: 17, row: 6 },
  [CityName.Volhaven]: { col: 36, row: 3 },
};

export interface WorldMapCityDatum {
  /** Center of the city node, projected from the art letter's cell. */
  center: Point;
}

export const worldMapCities: Record<CityName, WorldMapCityDatum> = Object.values(CityName).reduce(
  (acc, city) => {
    const { col, row } = CITY_ART_COORDS[city];
    acc[city] = { center: artToSvg(col, row) };
    return acc;
  },
  {} as Record<CityName, WorldMapCityDatum>,
);

/**
 * Coastline outlines, hand-traced from the ASCII art's /\~-,'|_. characters as
 * closed polygons in art (col, row) coordinates. Deliberately jagged — the
 * straight segments echo the character-art coastline.
 */
type ArtPoint = readonly [col: number, row: number];
const LANDMASS_ART_OUTLINES: readonly (readonly ArtPoint[])[] = [
  // Western continent: wide north (Sector-12), isthmus, long southern tail (Aevum).
  [
    [1.5, 3], [2, 2], [6, 1.8], [10, 2.2], [13, 1.8], [15.5, 2.2], // north coast, row 2
    [16, 3], [17.5, 4], [18.5, 5], [20.5, 5.8], [21.5, 6.6], // east coast toward row 6 "/'~"
    [19.5, 7.4], [18, 8.2], [16.5, 8.6], [19, 9.2], [21.5, 9.6], [22.5, 10.4], [24.5, 11.2], // isthmus east
    [26.5, 12.2], [28.5, 13.2], [28.5, 14.4], [27.5, 15.4], [26, 16.4], [25.5, 17.2], // tail east
    [24.5, 18.4], [23.5, 19.4], [23, 20.4], [23.5, 21.2], // tail tip, rows 18-21
    [21, 20.6], [20, 19.4], [20.5, 18.2], [20, 17.2], [20.5, 16.2], [21.5, 15.2], [20.5, 14.2], // tail west
    [19.5, 13.2], [19.5, 12.2], [18, 11.2], [16, 10.4], [14, 9.2], [12.5, 8.4], // isthmus west
    [11.5, 7.4], [10.5, 6.4], [9.5, 5.4], [7, 5], [4, 5.6], [1, 5.2], [0, 4.6], [1, 4], // west lobe, ".-~" cape
  ],
  // Northern mass holding Volhaven (rows 0-5, cols 17-40).
  [
    [17.5, 2.4], [19, 4.2], [20.5, 4.8], [22.5, 5.4], [25, 5.5], [27, 5], // west + south-west coast
    [29, 4.4], [31, 4.8], [33, 5.4], [35, 5.4], [34.5, 4.4], [36.5, 4.6], [38.5, 4.2], // fjords below Volhaven
    [39.5, 3.4], [40, 2.6], [36, 1.6], [31, 0.6], [27, 0.4], [23, 0.8], [20, 1.2], [18, 1.6], // east + north coast
  ],
  // Central-southern mass below Volhaven (rows 6-17, cols 29-48).
  [
    [33, 6.4], [36, 6.2], [39.5, 6.4], [42.5, 6.2], [45.5, 6.6], // north coast, row 6
    [47, 7.4], [44, 8], [46, 8.4], [48, 9.2], [45.5, 10.2], [44.5, 11.2], [43.5, 12.2], // east coast
    [44.5, 13.4], [45.5, 14.2], [44.5, 15.2], [41.5, 16.2], [39.5, 17.2], // south-east coast to tip
    [38.5, 16.4], [38.5, 15.4], [37.5, 14.4], [37.5, 13.4], [36, 12.4], [33.5, 11.4], // west coast
    [32, 10.4], [30.5, 9.4], [31.5, 8.4], [32.5, 7.4],
  ],
  // Eastern mass (Chongqing inland, New Tokyo on the eastern peninsula).
  [
    [36.5, 2.4], [38, 1.4], [41, 1.8], [44.5, 1.2], [47.5, 1.8], [51, 1.2], [54, 1.6], // north coast, row 1
    [57, 1.2], [60, 1.6], [63, 1.2], [66, 1.8], [68.5, 2.4],
    [67, 3.2], [64.5, 3.8], [65, 4.4], [63, 5], [62, 5.6], [62.5, 6.4], [62.5, 7.4], [61.5, 8.4], // east coast
    [59.5, 8.8], [57.5, 9.4], [58, 10.4], [56.5, 11.2], [54, 11.4], [52.5, 10.6], // southern peninsulas
    [50.5, 10.2], [51.5, 9.4], [53.5, 8.6],
    [55.5, 7.6], [54, 6.6], [51, 6], [47.5, 5.8], [44, 5.4], [42.5, 4.6], [42, 3.4], [40.5, 2.8], // south-west coast
  ],
  // South-eastern island group around Ishima (rows 12-18, cols 54-69).
  [
    [55, 13.6], [57, 12.8], [60, 12.4], [62.5, 12.8], [64.5, 12.4], [66.5, 13.2], // north shore
    [67.5, 14.2], [68.5, 15.2], [67, 16], [65, 16.6], [63, 17.4], [60.5, 17.8], // east + south shore
    [58, 17.2], [56.5, 16.4], [56, 15.4], [56.5, 14.4],
  ],
];

/** Closed SVG path strings for the coastline outlines, in canvas coordinates. */
export const LANDMASS_OUTLINES: readonly string[] = LANDMASS_ART_OUTLINES.map((points) => {
  const segments = points.map(([col, row], i) => {
    const p = artToSvg(col, row);
    return `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`;
  });
  return `${segments.join(" ")} Z`;
});

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
