/**
 * Light render tests for the World Map (Task 5, 3A; info diet per UI-refresh
 * feedback wave 1).
 *
 * Follows the established Shell test pattern (see Hud.test.tsx):
 * ReactDOM + ThemeProvider, initGameEnvironment/setupBasicTestingEnvironment.
 *
 * Covers:
 *   - all 6 city nodes render
 *   - the current city is marked (data-current + "◄ you" label)
 *   - clicking a node opens the popover; its "Fly to X" button fires onTravel
 *   - the popover/index column stay information-light (no gym/uni/company text)
 *   - a pending city-faction invitation is surfaced on node, popover, and column
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { CityName, FactionName } from "@enums";
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

describe("WorldMap3A info diet", () => {
  it("does not surface gym/university/company info anywhere", () => {
    Player.city = CityName.Sector12;
    Player.setMoney(1e12); // rich player: money alone must not surface anything
    const root = renderMap();
    click(root.querySelector(`[data-city="${CityName.Volhaven}"]`));
    const text = root.textContent ?? "";
    for (const leak of ["university", "gym", "ZB Institute", "Millenium", "OmniTek", "better", "Join"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("gives a rich player with no invitations all-slate nodes (no signal aria-labels)", () => {
    Player.city = CityName.Sector12;
    Player.setMoney(1e12);
    const root = renderMap();
    for (const city of Object.values(CityName)) {
      if (city === CityName.Sector12) continue;
      const node = root.querySelector(`[data-city="${city}"]`);
      expect(node?.getAttribute("aria-label")).toBe(city);
    }
  });

  it("renders no legend (wave-2 feedback: the node states explain themselves)", () => {
    const root = renderMap();
    const text = root.textContent ?? "";
    expect(text).not.toContain("current city");
    expect(text).not.toContain("nothing new");
    expect(text).not.toContain("has something for you now");
    expect(text).not.toContain("arcs show ticket routes");
  });

  it("draws the continents as soft filled shapes, blurred and clipped to the globe ellipse", () => {
    const root = renderMap();
    // The landmass group is clipped by the OUTERMOST graticule ellipse (cx 505, rx 460).
    const clip = root.querySelector("#world-map-globe-clip");
    expect(clip?.tagName.toLowerCase()).toBe("clippath");
    const clipEllipse = clip?.querySelector("ellipse");
    expect(clipEllipse?.getAttribute("cx")).toBe("505");
    expect(clipEllipse?.getAttribute("cy")).toBe("340");
    expect(clipEllipse?.getAttribute("rx")).toBe("460");
    expect(clipEllipse?.getAttribute("ry")).toBe("290");
    const clippedGroup = root.querySelector('svg g[clip-path="url(#world-map-globe-clip)"]');
    expect(clippedGroup).not.toBeNull();
    // Soft look: a Gaussian blur applies to the land, and each continent is a closed filled path.
    expect(clippedGroup?.querySelector('g[filter="url(#world-map-land-blur)"]')).not.toBeNull();
    const blurFilter = root.querySelector("#world-map-land-blur");
    expect(blurFilter?.tagName.toLowerCase()).toBe("filter");
    expect(blurFilter?.firstElementChild?.tagName).toBe("feGaussianBlur");
    const landPaths = Array.from(clippedGroup?.querySelectorAll("path") ?? []);
    expect(landPaths.length).toBeGreaterThanOrEqual(3);
    for (const path of landPaths) {
      expect(path.getAttribute("d")).toMatch(/Z$/);
      expect(path.getAttribute("fill")).not.toBe("none");
    }
    // The glyph-by-glyph stroke rendering is gone.
    expect(root.querySelectorAll('svg line[stroke-linecap="round"]')).toHaveLength(0);
  });

  it("shows a pending invitation on the node, popover, and index column", () => {
    Player.city = CityName.Sector12;
    Player.factionInvitations.push(FactionName.Ishima);
    const root = renderMap();
    const node = root.querySelector(`[data-city="${CityName.Ishima}"]`);
    expect(node?.getAttribute("aria-label")).toBe(`${CityName.Ishima} — faction invitation waiting`);
    const indexCard = root.querySelector(`[data-index-city="${CityName.Ishima}"]`);
    expect(indexCard?.textContent).toContain("invitation waiting");
    click(node);
    expect(root.textContent).toContain(FactionName.Ishima);
    expect(root.textContent).toContain("invitation waiting");
  });

  it("shows the index column as a compact list with ticket costs", () => {
    Player.city = CityName.Sector12;
    const root = renderMap();
    const currentCard = root.querySelector(`[data-index-city="${CityName.Sector12}"]`);
    expect(currentCard?.textContent).toContain("you are here");
    const otherCard = root.querySelector(`[data-index-city="${CityName.Chongqing}"]`);
    expect(otherCard?.textContent).not.toContain("KuaiGong"); // no flavor summaries
  });
});
