import { GameCycleEvents } from "../engine";

export type Topic =
  | "hud"
  | "terminal"
  | "network"
  | "scripts"
  | "factions"
  | "gang"
  | "stocks"
  | "hacknet"
  | "sleeves"
  | "corporation"
  | "bladeburner"
  | "go"
  | "events";

/** Registry for topic serializers. GA-2 fills these in; GA-1 stubs everything as () => null. */
export const serializerRegistry: Record<Topic, () => unknown> = {
  hud: () => null,
  terminal: () => null,
  network: () => null,
  scripts: () => null,
  factions: () => null,
  gang: () => null,
  stocks: () => null,
  hacknet: () => null,
  sleeves: () => null,
  corporation: () => null,
  bladeburner: () => null,
  go: () => null,
  events: () => null,
};

type SubscriptionEntry = {
  send: (msg: object) => void;
  intervalMs: number;
  lastSentJson: string | null;
  seq: number;
  lastEmitTime: number;
};

const subscriptions = new Map<Topic, SubscriptionEntry>();
let gameCycleUnsubscribe: (() => void) | null = null;

/** Module-level sender wired up by Remote.ts when a connection opens. */
let _currentSend: ((msg: object) => void) | null = null;

export function setCurrentSend(fn: (msg: object) => void): void {
  _currentSend = fn;
}

export function getCurrentSend(): ((msg: object) => void) | null {
  return _currentSend;
}

function ensureGameCycleListener(): void {
  if (gameCycleUnsubscribe) return;
  gameCycleUnsubscribe = GameCycleEvents.subscribe(onGameCycle);
}

function releaseGameCycleListener(): void {
  if (subscriptions.size === 0 && gameCycleUnsubscribe) {
    gameCycleUnsubscribe();
    gameCycleUnsubscribe = null;
  }
}

const MIN_INTERVAL_MS = 500;

function onGameCycle(): void {
  const now = Date.now();
  for (const [topic, entry] of subscriptions) {
    if (now - entry.lastEmitTime < entry.intervalMs) continue;
    pushTopicIfChanged(topic, entry);
  }
}

function pushTopicIfChanged(topic: Topic, entry: SubscriptionEntry): void {
  const data = serializerRegistry[topic]();
  const json = JSON.stringify(data);
  if (json === entry.lastSentJson) return;
  entry.lastSentJson = json;
  entry.seq++;
  entry.lastEmitTime = Date.now();
  entry.send({ jsonrpc: "2.0", method: "event", params: { topic, seq: entry.seq, data } });
}

export function subscribeTopic(topic: Topic, intervalMs: number | undefined, send: (msg: object) => void): void {
  const effectiveInterval = Math.max(intervalMs ?? 1000, MIN_INTERVAL_MS);
  const entry: SubscriptionEntry = {
    send,
    intervalMs: effectiveInterval,
    lastSentJson: null,
    seq: 0,
    lastEmitTime: 0,
  };
  subscriptions.set(topic, entry);
  ensureGameCycleListener();
  // Push initial snapshot immediately (always fires since lastSentJson starts as null)
  pushTopicIfChanged(topic, entry);
}

export function unsubscribeTopic(topic: Topic): void {
  subscriptions.delete(topic);
  releaseGameCycleListener();
}

export function clearAllSubscriptions(): void {
  subscriptions.clear();
  if (gameCycleUnsubscribe) {
    gameCycleUnsubscribe();
    gameCycleUnsubscribe = null;
  }
}
