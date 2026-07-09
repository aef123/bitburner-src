/**
 * Sparkline + money history for the docked HUD (Task 4).
 *
 * The sparkline itself is a pure SVG polyline (1.5px stroke per design-notes-1A). The money
 * history is a fixed-capacity ring buffer sampled on GameCycleEvents (one sample per engine
 * cycle, ~200ms, so 60 samples ≈ a 12-second window).
 *
 * Buffer lifetime: the buffer is a lazily-initialized module-level singleton so it survives
 * Hud unmount/remount (page changes, HUD collapse/restore). There is no game-wide prestige
 * event to subscribe to, so the buffer is NOT cleared on prestige — after an augmentation
 * install / bitnode jump the rate briefly reflects the money drop, then self-heals within one
 * buffer window (~12s). That transient staleness is deliberate and documented here.
 */
import React from "react";
import { useTheme } from "@mui/material/styles";

import { Player } from "@player";
import { GameCycleEvents } from "../../engine";

// ─── Money history ring buffer ────────────────────────────────────────────

export interface MoneySample {
  /** Player money at sample time. */
  money: number;
  /** Wall-clock timestamp (ms) of the sample. */
  timeMs: number;
}

const DEFAULT_CAPACITY = 60;

/** Fixed-capacity ring buffer of money samples. Oldest samples are evicted first. */
export class MoneyHistory {
  readonly capacity: number;
  private buffer: MoneySample[] = [];
  private head = 0;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  push(sample: MoneySample): void {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(sample);
      return;
    }
    this.buffer[this.head] = sample;
    this.head = (this.head + 1) % this.capacity;
  }

  /** Samples in insertion order, oldest first. */
  samples(): MoneySample[] {
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }

  reset(): void {
    this.buffer = [];
    this.head = 0;
  }
}

let moneyHistorySingleton: MoneyHistory | undefined;

/**
 * The shared money history, lazily initialized on first use. Subscribes to GameCycleEvents once
 * and never unsubscribes (an O(1) push per cycle), so the buffer keeps filling while the HUD is
 * unmounted and the sparkline is warm on remount.
 */
export function getMoneyHistory(): MoneyHistory {
  if (!moneyHistorySingleton) {
    const history = new MoneyHistory();
    history.push({ money: Player.money, timeMs: Date.now() });
    GameCycleEvents.subscribe(() => history.push({ money: Player.money, timeMs: Date.now() }));
    moneyHistorySingleton = history;
  }
  return moneyHistorySingleton;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

/** Round to 2 decimals for compact SVG point output. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build an SVG polyline `points` string from a series of values.
 *
 * - Values map onto the box left→right; min value at the bottom, max at the top, with `pad`
 *   pixels of vertical padding so the 1.5px stroke isn't clipped.
 * - Flat data (all values equal) renders a midline — the min/max spread is zero, so there is
 *   no meaningful vertical mapping.
 * - A single value renders a full-width flat midline (one point carries no slope information).
 * - No values renders nothing.
 */
export function buildSparklinePoints(values: readonly number[], width: number, height: number, pad = 2): string {
  if (values.length === 0) return "";
  const mid = round2(height / 2);
  if (values.length === 1) return `0,${mid} ${width},${mid}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  const innerHeight = height - 2 * pad;
  const step = width / (values.length - 1);

  return values
    .map((value, index) => {
      const x = round2(index * step);
      const y = spread === 0 ? mid : round2(pad + (1 - (value - min) / spread) * innerHeight);
      return `${x},${y}`;
    })
    .join(" ");
}

/**
 * Average $/s across the buffer: (newest - oldest) / elapsed seconds.
 * Returns 0 when there are fewer than 2 samples or the time window is zero/negative.
 */
export function calculateMoneyRate(samples: readonly MoneySample[]): number {
  if (samples.length < 2) return 0;
  const oldest = samples[0];
  const newest = samples[samples.length - 1];
  const elapsedSeconds = (newest.timeMs - oldest.timeMs) / 1000;
  if (elapsedSeconds <= 0) return 0;
  return (newest.money - oldest.money) / elapsedSeconds;
}

// ─── Component ────────────────────────────────────────────────────────────

interface SparklineProps {
  values: readonly number[];
  /** Geometry defaults per the design mock's money sparkline. */
  width?: number;
  height?: number;
  /** Stroke color; defaults to the money gold accent. */
  stroke?: string;
}

/** Pure SVG polyline sparkline, 1.5px stroke per design-notes-1A. */
export function Sparkline({ values, width = 88, height = 30, stroke }: SparklineProps): React.ReactElement {
  const theme = useTheme();
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={buildSparklinePoints(values, width, height)}
        fill="none"
        stroke={stroke ?? (theme.colors.accentGold as string)}
        strokeWidth={1.5}
      />
    </svg>
  );
}
