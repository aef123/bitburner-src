/**
 * Tests for the city map geometry module. Station positions must come from
 * the ORIGINAL ASCII city art: these tests re-derive each letter's (col, row)
 * from Cities[city].asciiArt at test time using the exact ASCIICity letterMap
 * convention (src/Locations/ui/City.tsx — the Nth uppercase letter A-Z marks
 * city.locations[N]) and assert the module's parsed stations match: full
 * coverage minus hidden easter eggs, in-bounds positions, and the art's
 * relative geometry surviving normalization. Subway edges must form ONE
 * connected octilinear network touching every station.
 */
import { CityName, LocationName } from "@enums";
import { Cities } from "../../../../src/Locations/Cities";
import { Locations } from "../../../../src/Locations/Locations";
import {
  CITY_MAP_HEIGHT,
  CITY_MAP_WIDTH,
  cityMapGeometry,
  HIDDEN_CITY_LOCATIONS,
} from "../../../../src/ui/Maps/cityAsciiPositions";

const allCities = Object.values(CityName);

/** The locations a city map must show: everything the city has, minus hidden easter eggs. */
function expectedStations(city: CityName): LocationName[] {
  return Cities[city].locations.filter((name) => !HIDDEN_CITY_LOCATIONS.includes(name));
}

/**
 * Independently re-derive each location's letter cell from the city's ASCII
 * art, exactly as ASCIICity's letterMap does: every uppercase A-Z character
 * is a location marker, and letter N of the alphabet marks locations[N].
 */
function artLetterCoords(city: CityName): Map<LocationName, { col: number; row: number }> {
  const coords = new Map<LocationName, { col: number; row: number }>();
  const lines = Cities[city].asciiArt.split("\n");
  lines.forEach((line, row) => {
    for (const match of line.matchAll(/[A-Z]/g)) {
      const col = match.index ?? 0;
      const index = match[0].charCodeAt(0) - "A".charCodeAt(0);
      const name = Cities[city].locations[index] as LocationName | undefined;
      // Every letter in the art must map to a real location of the city…
      if (name === undefined) {
        throw new Error(`${city}: art letter ${match[0]} at (${col}, ${row}) maps to no location (index ${index})`);
      }
      // …and no letter may appear twice.
      expect(coords.has(name)).toBe(false);
      coords.set(name, { col, row });
    }
  });
  return coords;
}

/** Station accessor that throws instead of returning undefined. */
function stationOf(city: CityName, name: LocationName): { x: number; y: number; labelAbove: boolean } {
  const station = cityMapGeometry[city].stations[name];
  if (!station) throw new Error(`No station for ${name} in ${city}`);
  return station;
}

describe.each(allCities)("station positions from the original ASCII art: %s", (city) => {
  const geometry = cityMapGeometry[city];
  const stationNames = Object.keys(geometry.stations) as LocationName[];

  it("shows every location of the city exactly once (minus hidden easter eggs)", () => {
    // Object keys are unique by construction, so set equality here IS
    // "appears exactly once".
    expect(stationNames.sort()).toEqual(expectedStations(city).sort());
  });

  it("has exactly one art letter per visible location (letterMap convention)", () => {
    const coords = artLetterCoords(city);
    expect([...coords.keys()].sort()).toEqual(expectedStations(city).sort());
  });

  it("references only real locations that belong to this city (catches data drift)", () => {
    for (const name of stationNames) {
      const location = Locations[name];
      expect(location).toBeDefined();
      // Generic locations have city === null and exist in every city.
      expect([null, city]).toContain(location.city);
    }
  });

  it("does not surface hidden easter-egg locations", () => {
    expect(HIDDEN_CITY_LOCATIONS).toEqual([LocationName.Void]);
    expect(stationNames).not.toContain(LocationName.Void);
  });

  it("preserves the art's relative geometry (anti-drift against the letter grid)", () => {
    const coords = artLetterCoords(city);
    for (const a of stationNames) {
      for (const b of stationNames) {
        if (a === b) continue;
        const artA = coords.get(a);
        const artB = coords.get(b);
        if (!artA || !artB) throw new Error(`Missing art letter for ${a} or ${b} in ${city}`);
        const stationA = stationOf(city, a);
        const stationB = stationOf(city, b);
        // Same art column ⇒ same x; west-of ⇒ left-of. Same for rows/y.
        expect(Math.sign(stationA.x - stationB.x)).toBe(Math.sign(artA.col - artB.col));
        expect(Math.sign(stationA.y - stationB.y)).toBe(Math.sign(artA.row - artB.row));
      }
    }
  });

  it("keeps every station inside the viewBox with a node-radius margin", () => {
    // Nodes are r=8 with a 3px stroke → 12px keeps the whole circle inside.
    const margin = 12;
    for (const name of stationNames) {
      const { x, y } = stationOf(city, name);
      expect(x).toBeGreaterThanOrEqual(margin);
      expect(x).toBeLessThanOrEqual(CITY_MAP_WIDTH - margin);
      expect(y).toBeGreaterThanOrEqual(margin);
      expect(y).toBeLessThanOrEqual(CITY_MAP_HEIGHT - margin);
    }
  });

  it("staggers labels on dense art rows (alternating below/above by x)", () => {
    const byRow = new Map<number, LocationName[]>();
    for (const name of stationNames) {
      const { y } = stationOf(city, name);
      byRow.set(y, [...(byRow.get(y) ?? []), name]);
    }
    for (const row of byRow.values()) {
      row.sort((a, b) => stationOf(city, a).x - stationOf(city, b).x);
      row.forEach((name, i) => {
        expect(stationOf(city, name).labelAbove).toBe(row.length >= 2 && i % 2 === 1);
      });
    }
  });
});

describe.each(allCities)("subway line network: %s", (city) => {
  const geometry = cityMapGeometry[city];
  const stationNames = Object.keys(geometry.stations) as LocationName[];

  it("is a spanning tree: N-1 edges between real stations", () => {
    expect(geometry.edges).toHaveLength(stationNames.length - 1);
    for (const edge of geometry.edges) {
      expect(stationNames).toContain(edge.from);
      expect(stationNames).toContain(edge.to);
      expect(edge.from).not.toBe(edge.to);
    }
  });

  it("touches every station and forms ONE connected network", () => {
    // Union-find over the edges: everything must end up in a single component.
    const parent = new Map<LocationName, LocationName>(stationNames.map((name) => [name, name]));
    const find = (name: LocationName): LocationName => {
      let root = name;
      while (parent.get(root) !== root) root = parent.get(root) as LocationName;
      return root;
    };
    const touched = new Set<LocationName>();
    for (const edge of geometry.edges) {
      touched.add(edge.from).add(edge.to);
      parent.set(find(edge.from), find(edge.to));
    }
    expect([...touched].sort()).toEqual([...stationNames].sort());
    const components = new Set(stationNames.map(find));
    expect(components.size).toBe(1);
  });

  it("routes each edge from station center to station center", () => {
    for (const edge of geometry.edges) {
      const from = stationOf(city, edge.from);
      const to = stationOf(city, edge.to);
      expect(edge.path.startsWith(`M ${from.x} ${from.y} `)).toBe(true);
      expect(edge.path.endsWith(` ${to.x} ${to.y}`)).toBe(true);
    }
  });

  it("uses only straight or 45° segments (subway visual language)", () => {
    for (const edge of geometry.edges) {
      const numbers = (edge.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(numbers.length % 2).toBe(0);
      expect(numbers.length).toBeGreaterThanOrEqual(4);
      for (let i = 2; i < numbers.length; i += 2) {
        const dx = numbers[i] - numbers[i - 2];
        const dy = numbers[i + 1] - numbers[i - 1];
        expect(dx !== 0 || dy !== 0).toBe(true);
        // Horizontal, vertical, or exact 45° diagonal.
        expect(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)).toBe(true);
      }
    }
  });
});
