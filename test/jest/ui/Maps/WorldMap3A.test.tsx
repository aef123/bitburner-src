/**
 * Light render tests for the World Map (Task 5, 3A).
 *
 * Follows the established Shell test pattern (see Hud.test.tsx):
 * ReactDOM + ThemeProvider, initGameEnvironment/setupBasicTestingEnvironment.
 *
 * Covers:
 *   - all 6 city nodes render
 *   - the current city is marked (data-current + "◄ you" label)
 *   - clicking a node opens the popover; its "Fly to X" button fires onTravel
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { CityName } from "@enums";
import { Player } from "@player";
import { Settings } from "../../../../src/Settings/Settings";
import { WorldMap3A } from "../../../../src/ui/Maps/WorldMap3A";

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

function renderMap(onTravel: (city: CityName) => void = jest.fn()): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <WorldMap3A onTravel={onTravel} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function click(element: Element | null): void {
  expect(element).not.toBeNull();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("WorldMap3A nodes", () => {
  it("renders a node for all six cities", () => {
    const root = renderMap();
    for (const city of Object.values(CityName)) {
      expect(root.querySelector(`[data-city="${city}"]`)).not.toBeNull();
    }
  });

  it("marks the player's current city", () => {
    Player.city = CityName.Volhaven;
    const root = renderMap();
    const current = root.querySelector(`[data-city="${CityName.Volhaven}"]`);
    expect(current?.getAttribute("data-current")).toBe("true");
    expect(root.textContent).toContain("◄ you");
    // Only one current city.
    expect(root.querySelectorAll(`[data-current="true"]`)).toHaveLength(1);
  });
});

describe("WorldMap3A selection and travel", () => {
  it("opens a popover with a Fly button when a city node is clicked", () => {
    Player.city = CityName.Sector12;
    Player.setMoney(1e9);
    const onTravel = jest.fn();
    const root = renderMap(onTravel);

    expect(root.textContent).not.toContain("Fly to Volhaven");
    click(root.querySelector(`[data-city="${CityName.Volhaven}"]`));
    const fly = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "Fly to Volhaven");
    expect(fly).toBeDefined();

    click(fly ?? null);
    expect(onTravel).toHaveBeenCalledWith(CityName.Volhaven);
  });

  it("does not offer travel to the current city", () => {
    Player.city = CityName.Sector12;
    const root = renderMap();
    click(root.querySelector(`[data-city="${CityName.Sector12}"]`));
    expect(root.textContent).not.toContain("Fly to Sector-12");
  });
});
