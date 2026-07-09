/**
 * Tests for the subway route decomposition (cityRoutes.ts). The routes must
 * PARTITION each city's MST exactly (no dropped or duplicated edges), touch
 * every station, stay within the 1-4 line budget, be fully deterministic,
 * and keep Line 1 a simple path — the "longest path through the tree"
 * promise that anchors the whole real-transit-map aesthetic.
 */
import { CityName, LocationName } from "@enums";
import { cityMapGeometry } from "../../../../src/ui/Maps/cityAsciiPositions";
import { cityRoutes, decomposeRoutes, MAX_ROUTES } from "../../../../src/ui/Maps/cityRoutes";

const allCities = Object.values(CityName);

/** Undirected edge key: stable regardless of from/to orientation. */
function edgeKey(edge: { from: LocationName; to: LocationName }): string {
  return [edge.from, edge.to].sort().join("|");
}

describe.each(allCities)("subway route decomposition: %s", (city) => {
  const geometry = cityMapGeometry[city];
  const routes = cityRoutes[city];
  const stationNames = Object.keys(geometry.stations) as LocationName[];

  it("partitions the MST edge set exactly (no drops, no duplicates)", () => {
    const routeEdges = routes.flatMap((route) => route.edges);
    // Same count AND same key set: together these prove an exact partition.
    expect(routeEdges).toHaveLength(geometry.edges.length);
    expect(routeEdges.map(edgeKey).sort()).toEqual(geometry.edges.map(edgeKey).sort());
  });

  it("puts every station on at least one route", () => {
    const covered = new Set(routes.flatMap((route) => route.stations));
    for (const name of stationNames) expect(covered.has(name)).toBe(true);
  });

  it(`keeps the line count in [1, ${MAX_ROUTES}]`, () => {
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes.length).toBeLessThanOrEqual(MAX_ROUTES);
  });

  it("lists on each route exactly the stations its edges touch", () => {
    for (const route of routes) {
      const touched = new Set(route.edges.flatMap((edge) => [edge.from, edge.to]));
      expect([...route.stations].sort()).toEqual([...touched].sort());
    }
  });

  it("is deterministic: two decompositions are identical", () => {
    expect(decomposeRoutes(geometry)).toEqual(decomposeRoutes(geometry));
    expect(decomposeRoutes(geometry)).toEqual(routes);
  });

  it("keeps Line 1 a simple path (no branches)", () => {
    const line1 = routes[0];
    expect(line1.edges.length).toBeGreaterThanOrEqual(1);
    // Degree check: a simple path has exactly two degree-1 endpoints and
    // every other station at degree 2.
    const degree = new Map<LocationName, number>();
    for (const edge of line1.edges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    const degrees = [...degree.values()];
    expect(Math.max(...degrees)).toBeLessThanOrEqual(2);
    expect(degrees.filter((d) => d === 1)).toHaveLength(2);
    // Connectivity: |stations| = |edges| + 1 plus the degree bound above
    // rules out disjoint cycles/segments.
    expect(degree.size).toBe(line1.edges.length + 1);
  });

  it("connects every line to the rest of the network at shared interchange stations", () => {
    // The routes partition a connected tree, so the "shares a station" graph
    // over routes must be connected: every line is reachable from Line 1
    // through interchanges. BFS over route indices.
    const reached = new Set<number>([0]);
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < routes.length; i++) {
        if (reached.has(i)) continue;
        const stations = new Set(routes[i].stations);
        for (const j of reached) {
          if (routes[j].stations.some((name) => stations.has(name))) {
            reached.add(i);
            grew = true;
            break;
          }
        }
      }
    }
    expect(reached.size).toBe(routes.length);
  });
});
