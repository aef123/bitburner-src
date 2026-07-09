/**
 * Station geometry for the City Transit Map (3B), derived from the ORIGINAL
 * ASCII city art so the map is the same city players already know.
 *
 * Each City.asciiArt marks its locations with uppercase letters A-Z; the Nth
 * letter of the alphabet marks city.locations[N] (the exact convention
 * ASCIICity uses via its letterMap, src/Locations/ui/City.tsx). This module
 * parses every city's art at load: each letter's (col, row) becomes a station,
 * projected onto the 1340×640 canvas with CHAR_ASPECT = 0.5 — terminal glyphs
 * are about half as wide as they are tall, so without the correction the art
 * would render vertically stretched (same approach as worldMapData.ts).
 * Per-city grid dimensions vary, so cols/rows are computed from each art
 * string; the art is centered, and the x-axis may stretch up to MAX_STRETCH_X
 * beyond aspect-true so tall art still uses the wide canvas.
 *
 * Label collisions: art rows often hold several letters close together, so
 * every row with 2+ stations alternates its labels below/above the node
 * (sorted by x, odd indices go above) — the same stagger the hand-authored
 * layouts used, now applied mechanically.
 *
 * Subway lines: stations connect into ONE network per city via a minimum
 * spanning tree (Prim's, Euclidean distance, deterministic row-major
 * insertion order for ties). Each edge renders as an octilinear path —
 * a 45° diagonal from the start until one axis aligns, then a straight run —
 * so the network reads as a subway map. Connectivity (every station touched)
 * is guaranteed by construction and verified by tests.
 *
 * Correctness net: test/jest/ui/Maps/cityAsciiPositions.test.ts re-derives
 * the letter grid from Cities[city].asciiArt at test time and checks
 * coverage, the letter→location convention, projection monotonicity, bounds
 * and line connectivity against this module's output.
 */
import { CityName, LocationName } from "@enums";
import { Cities } from "../../Locations/Cities";
// Side-effect import: Locations.ts populates each City's locations list and
// asciiArt (Cities.ts alone constructs empty City objects).
import "../../Locations/Locations";

export const CITY_MAP_WIDTH = 1340;
export const CITY_MAP_HEIGHT = 640;

/**
 * Locations deliberately NOT shown on any city map. "The Void" is an easter
 * egg: it is reachable only by lingering in the Shadowed Walkway, and visiting
 * grants an achievement. The classic ASCII maps omit it too (it has no letter
 * in any city's art); a clickable station would hand the achievement out for
 * free.
 */
export const HIDDEN_CITY_LOCATIONS: readonly LocationName[] = [LocationName.Void];

/** Terminal glyphs are ~half as wide as tall; keeps each art's proportions on the canvas. */
const CHAR_ASPECT = 0.5;
/**
 * The city arts are tall (22-36 rows), so a strictly aspect-true projection
 * would use barely 40% of the 1340px canvas width. Transit maps distort
 * geography freely, so the x-axis may stretch up to this factor beyond
 * aspect-true (capped, never compressed) — relative left/right ordering and
 * the network topology are unchanged.
 */
const MAX_STRETCH_X = 1.4;
/** Horizontal margin: room for centered station labels near the canvas edge. */
const MARGIN_X = 90;
/** Vertical margin: keeps stations clear of the header overlay and the canvas edge. */
const MARGIN_Y = 70;

export interface CityStation {
  /** Station node center, in the 1340×640 viewBox. */
  x: number;
  y: number;
  /** Label above instead of below the node (staggers dense art rows). */
  labelAbove: boolean;
}

export interface SubwayEdge {
  from: LocationName;
  to: LocationName;
  /** Octilinear SVG path from the `from` station to the `to` station. */
  path: string;
}

export interface CityMapGeometry {
  stations: Partial<Record<LocationName, CityStation>>;
  /** Minimum-spanning-tree subway segments; one connected network per city. */
  edges: SubwayEdge[];
}

interface Point {
  x: number;
  y: number;
}

/** 45°-diagonal-then-straight path between two station centers. */
function octilinearPath(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
  const midX = a.x + Math.sign(dx) * diagonal;
  const midY = a.y + Math.sign(dy) * diagonal;
  if (diagonal === 0 || (midX === b.x && midY === b.y)) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} L ${midX} ${midY} L ${b.x} ${b.y}`;
}

/**
 * Prim's minimum spanning tree over the stations (Euclidean distance).
 * `order` is the deterministic row-major parse order; strict `<` keeps the
 * first-found edge on ties, so output is stable across runs.
 */
function subwayEdges(stations: Partial<Record<LocationName, CityStation>>, order: readonly LocationName[]): SubwayEdge[] {
  const edges: SubwayEdge[] = [];
  if (order.length < 2) return edges;
  const inTree = new Set<LocationName>([order[0]]);
  const stationOf = (name: LocationName): CityStation => {
    const station = stations[name];
    if (!station) throw new Error(`No station parsed for ${name}`);
    return station;
  };
  while (inTree.size < order.length) {
    let best: { from: LocationName; to: LocationName; distance: number } | null = null;
    for (const from of order) {
      if (!inTree.has(from)) continue;
      const a = stationOf(from);
      for (const to of order) {
        if (inTree.has(to)) continue;
        const b = stationOf(to);
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (!best || distance < best.distance) best = { from, to, distance };
      }
    }
    if (!best) break; // unreachable: order has no duplicates and stations exist for all
    edges.push({ from: best.from, to: best.to, path: octilinearPath(stationOf(best.from), stationOf(best.to)) });
    inTree.add(best.to);
  }
  return edges;
}

/** Alternate labels below/above along every art row that holds 2+ stations. */
function staggerLabels(stations: Partial<Record<LocationName, CityStation>>): void {
  const byRow = new Map<number, CityStation[]>();
  for (const station of Object.values(stations)) {
    const row = byRow.get(station.y);
    if (row) row.push(station);
    else byRow.set(station.y, [station]);
  }
  for (const row of byRow.values()) {
    if (row.length < 2) continue;
    row.sort((a, b) => a.x - b.x);
    row.forEach((station, i) => {
      station.labelAbove = i % 2 === 1;
    });
  }
}

/** Parse one city's ASCII art into stations + subway edges. */
function parseCityArt(city: CityName): CityMapGeometry {
  const cityData = Cities[city];
  const lines = cityData.asciiArt.split("\n");
  const rows = lines.length;
  const cols = Math.max(...lines.map((line) => line.length));
  let cellHeight = (CITY_MAP_HEIGHT - 2 * MARGIN_Y) / rows;
  let cellWidth = cellHeight * CHAR_ASPECT;
  const maxCellWidth = (CITY_MAP_WIDTH - 2 * MARGIN_X) / cols;
  if (cellWidth > maxCellWidth) {
    // Width-constrained art: shrink both axes, aspect preserved.
    cellHeight *= maxCellWidth / cellWidth;
    cellWidth = maxCellWidth;
  } else {
    // Height-constrained art (all six cities today): allow a capped stretch.
    cellWidth = Math.min(maxCellWidth, cellWidth * MAX_STRETCH_X);
  }
  const originX = (CITY_MAP_WIDTH - cols * cellWidth) / 2;
  const originY = (CITY_MAP_HEIGHT - rows * cellHeight) / 2;

  const stations: Partial<Record<LocationName, CityStation>> = {};
  const order: LocationName[] = [];
  lines.forEach((line, row) => {
    for (const match of line.matchAll(/[A-Z]/g)) {
      // ASCIICity's letterMap convention: the Nth alphabet letter marks locations[N].
      const name = cityData.locations[match[0].charCodeAt(0) - "A".charCodeAt(0)] as LocationName | undefined;
      if (name === undefined || HIDDEN_CITY_LOCATIONS.includes(name) || stations[name]) continue;
      stations[name] = {
        x: Math.round(originX + ((match.index ?? 0) + 0.5) * cellWidth),
        y: Math.round(originY + (row + 0.5) * cellHeight),
        labelAbove: false,
      };
      order.push(name);
    }
  });
  staggerLabels(stations);
  return { stations, edges: subwayEdges(stations, order) };
}

export const cityMapGeometry: Record<CityName, CityMapGeometry> = Object.values(CityName).reduce(
  (acc, city) => {
    acc[city] = parseCityArt(city);
    return acc;
  },
  {} as Record<CityName, CityMapGeometry>,
);
