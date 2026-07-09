/**
 * Tests for the HUD sparkline (Task 4: docked HUD).
 *
 * Covers:
 *   - MoneyHistory ring buffer: fixed capacity, eviction order, reset
 *   - buildSparklinePoints: polyline point generation incl. flat-line and single-point cases
 *   - calculateMoneyRate: $/s calculation incl. zero-window guard
 *   - Sparkline component: renders an SVG polyline with a 1.5px stroke
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../../src/Settings/Settings";
import {
  MoneyHistory,
  buildSparklinePoints,
  calculateMoneyRate,
  Sparkline,
  type MoneySample,
} from "../../../../src/ui/Shell/Sparkline";

const testTheme = createTheme({ colors: Settings.theme });

function sample(money: number, timeMs: number): MoneySample {
  return { money, timeMs };
}

// ─── MoneyHistory ring buffer ─────────────────────────────────────────────

describe("MoneyHistory ring buffer", () => {
  it("has a default capacity of 60", () => {
    const history = new MoneyHistory();
    expect(history.capacity).toBe(60);
  });

  it("stores samples in insertion order (oldest first)", () => {
    const history = new MoneyHistory(5);
    history.push(sample(1, 100));
    history.push(sample(2, 200));
    history.push(sample(3, 300));
    expect(history.samples().map((s) => s.money)).toEqual([1, 2, 3]);
  });

  it("evicts the oldest sample once capacity is exceeded", () => {
    const history = new MoneyHistory(3);
    for (let i = 1; i <= 5; i++) history.push(sample(i, i * 100));
    const samples = history.samples();
    expect(samples).toHaveLength(3);
    expect(samples.map((s) => s.money)).toEqual([3, 4, 5]);
    expect(samples.map((s) => s.timeMs)).toEqual([300, 400, 500]);
  });

  it("never exceeds its capacity even with many pushes", () => {
    const history = new MoneyHistory(60);
    for (let i = 0; i < 500; i++) history.push(sample(i, i));
    expect(history.samples()).toHaveLength(60);
    expect(history.samples()[0].money).toBe(440);
    expect(history.samples()[59].money).toBe(499);
  });

  it("reset() empties the buffer", () => {
    const history = new MoneyHistory(3);
    history.push(sample(1, 100));
    history.push(sample(2, 200));
    history.reset();
    expect(history.samples()).toHaveLength(0);
  });
});

// ─── buildSparklinePoints ─────────────────────────────────────────────────

describe("buildSparklinePoints", () => {
  // Default geometry from the design mock: 88x30 viewBox, 2px vertical padding.
  const W = 88;
  const H = 30;

  it("returns an empty string for no values", () => {
    expect(buildSparklinePoints([], W, H)).toBe("");
  });

  it("draws a full-width flat midline for a single value", () => {
    // A single sample carries no slope information; render a flat line across the full width.
    expect(buildSparklinePoints([5], W, H)).toBe("0,15 88,15");
  });

  it("draws a flat midline when all values are equal", () => {
    // min === max would divide by zero; flat data renders at the vertical midpoint.
    expect(buildSparklinePoints([3, 3, 3], W, H)).toBe("0,15 44,15 88,15");
  });

  it("maps min to the bottom and max to the top with 2px padding", () => {
    // values [0, 10]: min y = H - pad = 28, max y = pad = 2.
    expect(buildSparklinePoints([0, 10], W, H)).toBe("0,28 88,2");
  });

  it("spaces points evenly across the width", () => {
    expect(buildSparklinePoints([0, 5, 10], W, H)).toBe("0,28 44,15 88,2");
  });

  it("generates one point per value", () => {
    const values = [1, 4, 2, 8, 5, 7];
    const points = buildSparklinePoints(values, W, H).split(" ");
    expect(points).toHaveLength(values.length);
  });
});

// ─── calculateMoneyRate ───────────────────────────────────────────────────

describe("calculateMoneyRate", () => {
  it("returns 0 for an empty buffer", () => {
    expect(calculateMoneyRate([])).toBe(0);
  });

  it("returns 0 for a single sample", () => {
    expect(calculateMoneyRate([sample(100, 1000)])).toBe(0);
  });

  it("computes (newest - oldest) / elapsed seconds", () => {
    const samples = [sample(0, 0), sample(50, 5000), sample(100, 10000)];
    expect(calculateMoneyRate(samples)).toBe(10);
  });

  it("returns a negative rate when money decreases", () => {
    const samples = [sample(100, 0), sample(0, 10000)];
    expect(calculateMoneyRate(samples)).toBe(-10);
  });

  it("guards against a zero-length time window", () => {
    const samples = [sample(0, 5000), sample(100, 5000)];
    expect(calculateMoneyRate(samples)).toBe(0);
  });

  it("guards against a negative time window", () => {
    const samples = [sample(0, 5000), sample(100, 4000)];
    expect(calculateMoneyRate(samples)).toBe(0);
  });
});

// ─── Sparkline component ──────────────────────────────────────────────────

describe("Sparkline component", () => {
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

  it("renders an SVG polyline with a 1.5px stroke and the computed points", () => {
    if (!container) throw new Error("No container");
    const values = [0, 5, 10];
    act(() => {
      ReactDOM.render(
        <ThemeProvider theme={testTheme}>
          <Sparkline values={values} />
        </ThemeProvider>,
        container,
      );
    });
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    expect(polyline?.getAttribute("stroke-width")).toBe("1.5");
    expect(polyline?.getAttribute("fill")).toBe("none");
    expect(polyline?.getAttribute("points")).toBe(buildSparklinePoints(values, 88, 30));
  });
});
