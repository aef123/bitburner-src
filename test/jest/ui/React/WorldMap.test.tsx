/**
 * Render tests for the CLASSIC ASCII world map, which now renders from the
 * shared art source (src/ui/React/worldMapArt.ts) also consumed by the vector
 * Travel Agency map. The contract: the page renders character-for-character
 * identically to the original hand-written JSX — 22 rows whose text equals the
 * shared art exactly — and all six city letters stay clickable (except the
 * current city, which is inert).
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { CityName } from "@enums";
import { Settings } from "../../../../src/Settings/Settings";
import { WorldMap } from "../../../../src/ui/React/WorldMap";
import { WORLD_MAP_ART } from "../../../../src/ui/React/worldMapArt";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeEach(() => {
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

function renderMap(
  currentCity: CityName = CityName.Sector12,
  onTravel: (city: CityName) => void = jest.fn(),
): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <WorldMap currentCity={currentCity} onTravel={onTravel} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function citySpan(root: HTMLElement, city: CityName): HTMLSpanElement | undefined {
  return Array.from(root.querySelectorAll("span")).find((span) => span.textContent === city[0]);
}

describe("classic ASCII WorldMap", () => {
  it("renders all 22 art rows character-for-character from the shared source", () => {
    const root = renderMap();
    const rows = Array.from(root.querySelectorAll("p"));
    expect(rows).toHaveLength(WORLD_MAP_ART.length);
    rows.forEach((row, i) => {
      expect(row.textContent).toBe(WORLD_MAP_ART[i]);
    });
  });

  it("renders a span for each of the six city letters", () => {
    const root = renderMap();
    for (const city of Object.values(CityName)) {
      expect(citySpan(root, city)).toBeDefined();
    }
  });

  it("travels to a city when its letter is clicked", () => {
    const onTravel = jest.fn();
    const root = renderMap(CityName.Sector12, onTravel);
    const volhaven = citySpan(root, CityName.Volhaven);
    expect(volhaven).toBeDefined();
    act(() => {
      volhaven?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onTravel).toHaveBeenCalledWith(CityName.Volhaven);
  });

  it("does not travel when the current city's letter is clicked", () => {
    const onTravel = jest.fn();
    const root = renderMap(CityName.Sector12, onTravel);
    const sector12 = citySpan(root, CityName.Sector12);
    expect(sector12).toBeDefined();
    act(() => {
      sector12?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onTravel).not.toHaveBeenCalled();
  });
});
