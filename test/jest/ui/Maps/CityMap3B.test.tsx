/**
 * Light render tests for the City Transit Map (3B, ASCII-layout revision).
 *
 * Follows the established Maps test pattern (see WorldMap3A.test.tsx):
 * ReactDOM + ThemeProvider, initGameEnvironment/setupBasicTestingEnvironment.
 *
 * Covers:
 *   - a station button renders for every (non-hidden) location of the city
 *   - clicking a station fires the toLocation callback with the real Location
 *   - subway lines render in multiple AESTHETIC palette colors (gold/green/
 *     violet/pink rotation; still no category system)
 *   - junction stations render as interchanges; regular stops do not
 *   - no derived-analytics glyphs (★/⚑) and no category legend render
 *   - hovering The Slums shows the station card with crime content
 *   - hovering a gym shows NO cost/exp multiplier rows (philosophy)
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { CityName, LocationName } from "@enums";
import { Crimes } from "../../../../src/Crime/Crimes";
import { Cities } from "../../../../src/Locations/Cities";
import type { Location } from "../../../../src/Locations/Location";
import { Settings } from "../../../../src/Settings/Settings";
import { CityMap3B } from "../../../../src/ui/Maps/CityMap3B";
import { HIDDEN_CITY_LOCATIONS } from "../../../../src/ui/Maps/cityAsciiPositions";
import { cityRoutes } from "../../../../src/ui/Maps/cityRoutes";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
});

function renderMap(city: CityName, toLocation: (location: Location) => void = jest.fn()): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <CityMap3B city={Cities[city]} toLocation={toLocation} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function station(root: HTMLElement, name: LocationName): Element | null {
  return root.querySelector(`[data-station="${name}"]`);
}

describe("CityMap3B stations", () => {
  it.each(Object.values(CityName))("renders a station for every visible location of %s", (city) => {
    const root = renderMap(city);
    for (const name of Cities[city].locations) {
      if (HIDDEN_CITY_LOCATIONS.includes(name)) {
        expect(station(root, name)).toBeNull();
      } else {
        expect(station(root, name)).not.toBeNull();
      }
    }
  });

  it("navigates via toLocation when a station is clicked", () => {
    const toLocation = jest.fn();
    const root = renderMap(CityName.Volhaven, toLocation);
    act(() => {
      station(root, LocationName.VolhavenOmniTekIncorporated)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toLocation).toHaveBeenCalledTimes(1);
    expect(toLocation).toHaveBeenCalledWith(
      expect.objectContaining({ name: LocationName.VolhavenOmniTekIncorporated }),
    );
  });
});

describe("CityMap3B colored subway routes (aesthetic, not categorical)", () => {
  // Fixed rotation, Line 1 = gold. Colors carry no meaning.
  const palette = [
    Settings.theme.accentGold,
    Settings.theme.accentGreen,
    Settings.theme.accentViolet,
    Settings.theme.accentPink,
  ];

  it.each(Object.values(CityName))("draws every %s line segment in a palette color", (city) => {
    const root = renderMap(city);
    const strokes = new Set(Array.from(root.querySelectorAll("svg path")).map((path) => path.getAttribute("stroke")));
    expect(strokes.size).toBeGreaterThanOrEqual(1);
    for (const stroke of strokes) expect(palette).toContain(stroke);
  });

  it("uses multiple distinct line colors for a large city (Sector-12)", () => {
    const root = renderMap(CityName.Sector12);
    const strokes = new Set(Array.from(root.querySelectorAll("svg path")).map((path) => path.getAttribute("stroke")));
    expect(strokes.size).toBeGreaterThanOrEqual(2);
    // Line 1 (gold) always present.
    expect(strokes).toContain(Settings.theme.accentGold);
  });

  it("renders junction stations as interchanges and regular stops as plain stations (Sector-12)", () => {
    const routes = cityRoutes[CityName.Sector12];
    expect(routes.length).toBeGreaterThanOrEqual(2);
    const counts = new Map<LocationName, number>();
    for (const route of routes) {
      for (const name of route.stations) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const junctions = [...counts].filter(([, count]) => count >= 2).map(([name]) => name);
    const regulars = [...counts].filter(([, count]) => count === 1).map(([name]) => name);
    expect(junctions.length).toBeGreaterThanOrEqual(1);
    expect(regulars.length).toBeGreaterThanOrEqual(1);

    const root = renderMap(CityName.Sector12);
    for (const name of junctions) {
      expect(station(root, name)?.getAttribute("data-interchange")).toBe("true");
    }
    for (const name of regulars) {
      expect(station(root, name)?.hasAttribute("data-interchange")).toBe(false);
    }
  });

  it("renders no derived-analytics glyphs and no category legend", () => {
    const root = renderMap(CityName.Volhaven);
    expect(root.textContent).not.toContain("★");
    expect(root.textContent).not.toContain("⚑");
    expect(root.textContent).not.toContain("Commerce");
    expect(root.textContent).not.toContain("interchange");
  });
});

describe("CityMap3B station card", () => {
  it("shows the crime list when The Slums is hovered", () => {
    const root = renderMap(CityName.Volhaven);
    expect(root.querySelector("[data-station-card]")).toBeNull();
    act(() => {
      station(root, LocationName.Slums)?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const card = root.querySelector(`[data-station-card="${LocationName.Slums}"]`);
    expect(card).not.toBeNull();
    for (const crime of Object.values(Crimes)) {
      expect(card?.textContent).toContain(crime.type);
    }
    expect(card?.textContent).toContain(`Enter ${LocationName.Slums}`);
  });

  it("shows no cost/exp multiplier rows for a gym (the location screen shows what you get)", () => {
    const root = renderMap(CityName.Volhaven);
    act(() => {
      station(root, LocationName.VolhavenMilleniumFitnessGym)?.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true }),
      );
    });
    const card = root.querySelector(`[data-station-card="${LocationName.VolhavenMilleniumFitnessGym}"]`);
    expect(card).not.toBeNull();
    expect(card?.textContent).not.toContain("training exp");
    expect(card?.textContent).not.toContain("cost");
    expect(card?.textContent).toContain(`Enter ${LocationName.VolhavenMilleniumFitnessGym}`);
  });

  it("fires toLocation from the card's Enter button", () => {
    const toLocation = jest.fn();
    const root = renderMap(CityName.Volhaven, toLocation);
    act(() => {
      station(root, LocationName.Slums)?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const enter = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === `Enter ${LocationName.Slums}`,
    );
    expect(enter).toBeDefined();
    act(() => {
      enter?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toLocation).toHaveBeenCalledTimes(1);
    expect(toLocation).toHaveBeenCalledWith(expect.objectContaining({ name: LocationName.Slums }));
  });
});
