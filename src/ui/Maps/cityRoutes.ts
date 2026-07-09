/**
 * Subway ROUTE decomposition for the City Transit Map (3B). Takes each city's
 * MST network (cityAsciiPositions.ts) and partitions its edges into 1-4
 * aesthetic lines, the way a real transit map is drawn:
 *
 *   1. Line 1 is the longest path through the tree (the tree diameter, by
 *      Euclidean length along the MST edges).
 *   2. Remove Line 1's edges. Each remaining connected branch becomes the
 *      next line — attached to an earlier line at a shared junction station,
 *      exactly like a real-map interchange. Repeat until no edges remain.
 *   3. Tiny leftovers (single-edge branches) merge into an adjacent line
 *      instead of spawning yet another color, and the total is capped at
 *      MAX_ROUTES by merging the smallest lines into their neighbors.
 *
 * The routes PARTITION the MST edge set: every edge belongs to exactly one
 * line (no duplicates, no drops), so overlapping-line parallel offsets are
 * never needed — lines only meet at junction stations, which render as
 * interchanges. Line 1 is always a simple path (never a merge target for
 * branches; a 1-edge leftover may only extend it end-to-end).
 *
 * Colors are assigned by the renderer purely by route index (gold, green,
 * violet, pink — rotating). They carry NO meaning: no categories, no legend.
 *
 * Everything is deterministic: neighbor lists are sorted by station name,
 * distance ties break toward the lexicographically smaller name, and route
 * extraction always takes the longest available diameter (earlier component
 * wins ties). Two calls over the same geometry produce identical output —
 * verified by test/jest/ui/Maps/cityRoutes.test.ts.
 */
import { CityName, LocationName } from "@enums";
import { cityMapGeometry, type CityMapGeometry, type CityStation, type SubwayEdge } from "./cityAsciiPositions";

/** A real transit map rarely needs more colors than this; neither do we. */
export const MAX_ROUTES = 4;

export interface SubwayRoute {
  /** The MST edges this line traverses (disjoint from every other route). */
  edges: SubwayEdge[];
  /** Every station the line touches, sorted by name (deterministic). */
  stations: LocationName[];
}

interface Neighbor {
  to: LocationName;
  edge: SubwayEdge;
  weight: number;
}

type Adjacency = Map<LocationName, Neighbor[]>;

/** Internal route representation: `path` is the ordered station sequence while the route is still a simple path. */
interface DraftRoute {
  edges: SubwayEdge[];
  path: LocationName[] | null;
}

function stationOf(geometry: CityMapGeometry, name: LocationName): CityStation {
  const station = geometry.stations[name];
  if (!station) throw new Error(`No station for ${name}`);
  return station;
}

/** Adjacency over the remaining edges; neighbor lists sorted by name for determinism. */
function buildAdjacency(geometry: CityMapGeometry, edges: readonly SubwayEdge[]): Adjacency {
  const adjacency: Adjacency = new Map();
  const add = (from: LocationName, to: LocationName, edge: SubwayEdge): void => {
    const a = stationOf(geometry, from);
    const b = stationOf(geometry, to);
    const weight = Math.hypot(a.x - b.x, a.y - b.y);
    const list = adjacency.get(from) ?? [];
    list.push({ to, edge, weight });
    adjacency.set(from, list);
  };
  for (const edge of edges) {
    add(edge.from, edge.to, edge);
    add(edge.to, edge.from, edge);
  }
  for (const list of adjacency.values()) list.sort((a, b) => (a.to < b.to ? -1 : 1));
  return adjacency;
}

/**
 * Farthest station from `start` in its tree (Euclidean distance along edges),
 * with the parent map to reconstruct the path. Distance ties break toward the
 * lexicographically smaller station name.
 */
function farthestFrom(
  start: LocationName,
  adjacency: Adjacency,
): { node: LocationName; distance: number; parents: Map<LocationName, LocationName> } {
  const distance = new Map<LocationName, number>([[start, 0]]);
  const parents = new Map<LocationName, LocationName>();
  const stack: LocationName[] = [start];
  while (stack.length > 0) {
    const node = stack.pop() as LocationName;
    for (const { to, weight } of adjacency.get(node) ?? []) {
      if (distance.has(to)) continue;
      distance.set(to, (distance.get(node) as number) + weight);
      parents.set(to, node);
      stack.push(to);
    }
  }
  let best = start;
  for (const [node, d] of distance) {
    const bestD = distance.get(best) as number;
    if (d > bestD || (d === bestD && node < best)) best = node;
  }
  return { node: best, distance: distance.get(best) as number, parents };
}

/**
 * The longest path (diameter) through one tree component, via the classic
 * double-traversal: farthest node from anywhere is one diameter endpoint;
 * farthest from THAT is the other. Path is oriented so the smaller-named
 * endpoint comes first (determinism).
 */
function diameterPath(
  component: readonly LocationName[],
  adjacency: Adjacency,
): { nodes: LocationName[]; edges: SubwayEdge[]; length: number } {
  const start = component.reduce((min, node) => (node < min ? node : min));
  const a = farthestFrom(start, adjacency);
  const b = farthestFrom(a.node, adjacency);
  const nodes: LocationName[] = [];
  for (let cursor: LocationName | undefined = b.node; cursor !== undefined; cursor = b.parents.get(cursor)) {
    nodes.push(cursor);
  }
  if (nodes[nodes.length - 1] < nodes[0]) nodes.reverse();
  const edges: SubwayEdge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const neighbor = (adjacency.get(nodes[i - 1]) ?? []).find((n) => n.to === nodes[i]);
    if (!neighbor) throw new Error(`No edge between ${nodes[i - 1]} and ${nodes[i]}`);
    edges.push(neighbor.edge);
  }
  return { nodes, edges, length: b.distance };
}

/** Connected components of the adjacency, each sorted by name, ordered by smallest member. */
function connectedComponents(adjacency: Adjacency): LocationName[][] {
  const seen = new Set<LocationName>();
  const components: LocationName[][] = [];
  const allNodes = [...adjacency.keys()].sort();
  for (const root of allNodes) {
    if (seen.has(root)) continue;
    const component: LocationName[] = [];
    const stack = [root];
    seen.add(root);
    while (stack.length > 0) {
      const node = stack.pop() as LocationName;
      component.push(node);
      for (const { to } of adjacency.get(node) ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        stack.push(to);
      }
    }
    component.sort();
    components.push(component);
  }
  return components;
}

function routeStations(route: DraftRoute): Set<LocationName> {
  const stations = new Set<LocationName>();
  for (const edge of route.edges) stations.add(edge.from).add(edge.to);
  return stations;
}

/**
 * Merge `source` into `target`, preserving `target.path` only when the merge
 * genuinely extends a simple path end-to-end (both are paths meeting at a
 * single shared station that is an endpoint of each).
 */
function mergeRoutes(target: DraftRoute, source: DraftRoute, shared: LocationName[]): void {
  const extendsPath =
    target.path !== null &&
    source.path !== null &&
    shared.length === 1 &&
    (target.path[0] === shared[0] || target.path[target.path.length - 1] === shared[0]) &&
    (source.path[0] === shared[0] || source.path[source.path.length - 1] === shared[0]);
  if (extendsPath && target.path && source.path) {
    const targetPath = target.path[target.path.length - 1] === shared[0] ? target.path : [...target.path].reverse();
    const sourcePath = source.path[0] === shared[0] ? source.path : [...source.path].reverse();
    target.path = [...targetPath, ...sourcePath.slice(1)];
  } else {
    target.path = null;
  }
  target.edges = [...target.edges, ...source.edges];
}

/**
 * Decompose one city's MST into 1-4 subway routes. Pure and deterministic:
 * same geometry in, identical routes out. The returned routes' edge arrays
 * partition `geometry.edges` exactly.
 */
export function decomposeRoutes(geometry: CityMapGeometry): SubwayRoute[] {
  const routes: DraftRoute[] = [];
  let remaining = [...geometry.edges];

  // Phase 1: peel off diameter paths, longest first. Line 1 = tree diameter;
  // each later line is the longest branch left, joined at an interchange.
  while (remaining.length > 0) {
    const adjacency = buildAdjacency(geometry, remaining);
    let best: ReturnType<typeof diameterPath> | null = null;
    for (const component of connectedComponents(adjacency)) {
      const candidate = diameterPath(component, adjacency);
      if (!best || candidate.length > best.length) best = candidate;
    }
    if (!best) break; // unreachable: remaining is non-empty
    routes.push({ edges: best.edges, path: best.nodes });
    const chosen = new Set(best.edges);
    remaining = remaining.filter((edge) => !chosen.has(edge));
  }

  // Phase 2: fold tiny branches into neighbors and cap the line count.
  const overCap = (): boolean => routes.length > MAX_ROUTES;
  const hasTinyBranch = (): boolean => routes.length > 2 && routes.some((r, i) => i > 0 && r.edges.length === 1);
  while (overCap() || hasTinyBranch()) {
    const candidates = routes
      .map((route, index) => ({ route, index }))
      .filter(({ route, index }) => index > 0 && (overCap() || route.edges.length === 1))
      .sort((a, b) => a.route.edges.length - b.route.edges.length || a.index - b.index);
    let merged = false;
    for (const { route: source, index } of candidates) {
      const sourceStations = routeStations(source);
      // Preferred targets: any other non-Line-1 route sharing a station
      // (largest first, so small lines fold into big ones).
      const targets = routes
        .map((route, targetIndex) => ({ route, targetIndex }))
        .filter(
          ({ route, targetIndex }) =>
            targetIndex > 0 && targetIndex !== index && [...routeStations(route)].some((s) => sourceStations.has(s)),
        )
        .sort((a, b) => b.route.edges.length - a.route.edges.length || a.targetIndex - b.targetIndex);
      let target = targets[0]?.route ?? null;
      if (!target) {
        // Last resort: extend Line 1 end-to-end (kept a simple path); never
        // attach a branch to it.
        const line1 = routes[0];
        const shared = [...sourceStations].filter((s) => routeStations(line1).has(s));
        const line1Path = line1.path;
        if (
          line1Path !== null &&
          source.path !== null &&
          shared.length === 1 &&
          (line1Path[0] === shared[0] || line1Path[line1Path.length - 1] === shared[0]) &&
          (source.path[0] === shared[0] || source.path[source.path.length - 1] === shared[0])
        ) {
          target = line1;
        }
      }
      if (!target) continue;
      const targetStations = routeStations(target);
      const shared = [...sourceStations].filter((s) => targetStations.has(s));
      mergeRoutes(target, source, shared);
      routes.splice(index, 1);
      merged = true;
      break;
    }
    if (!merged) break; // nothing mergeable; live with the count
  }

  // Routes with pre-computed station lists so consumers stay allocation-free.
  return routes.map((route) => ({ edges: route.edges, stations: [...routeStations(route)].sort() }));
}

/** Precomputed routes for every city, derived once at load like cityMapGeometry. */
export const cityRoutes: Record<CityName, SubwayRoute[]> = Object.values(CityName).reduce(
  (acc, city) => {
    acc[city] = decomposeRoutes(cityMapGeometry[city]);
    return acc;
  },
  {} as Record<CityName, SubwayRoute[]>,
);
