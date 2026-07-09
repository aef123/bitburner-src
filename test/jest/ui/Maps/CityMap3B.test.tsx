/**
 * Light render tests for the City Transit Map (Task 6, 3B).
 *
 * Follows the established Maps test pattern (see WorldMap3A.test.tsx):
 * ReactDOM + ThemeProvider, initGameEnvironment/setupBasicTestingEnvironment.
 *
 * Covers:
 *   - a station button renders for every (non-hidden) location of the city
 *   - clicking a station fires the toLocation callback with the real Location
 *   - hovering The Slums shows the station card with crime content
 *   - the best-in-city gym is starred; hidden easter eggs don't render
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
import { HIDDEN_CITY_LOCATIONS } from "../../../../src/ui/Maps/cityMapLayouts";

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

  it("stars the best-in-city gym", () => {
    const root = renderMap(CityName.Volhaven);
    expect(root.textContent).toContain(`${LocationName.VolhavenMilleniumFitnessGym} ★`);
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
