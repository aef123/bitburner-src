import { GameCycleEvents } from "../engine";
import { TerminalEvents, TerminalClearEvents } from "../Terminal/TerminalEvents";
import {
  serializeHud,
  serializeNetwork,
  serializeRunningScripts,
  serializeTerminal,
  serializeFactions,
  serializeGang,
  serializeStocks,
} from "./StateSerializers";
import { FactionInvitationEvents } from "../Faction/ui/FactionInvitationManager";
import { SaveEvents } from "../SaveObject";
import { Player } from "@player";
import { isCreateProgramWork } from "../Work/CreateProgramWork";
import type { PlayerBaseWork } from "../Work/Work";

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

/** Registry for topic serializers. GA-2 fills hud/network/scripts/terminal; later tasks fill the rest. */
export const serializerRegistry: Record<Topic, () => unknown> = {
  hud: serializeHud,
  terminal: () => serializeTerminal(),
  network: serializeNetwork,
  scripts: serializeRunningScripts,
  factions: serializeFactions,
  gang: serializeGang,
  stocks: serializeStocks,
  hacknet: () => null,
  sleeves: () => null,
  corporation: () => null,
  bladeburner: () => null,
  go: () => null,
  events: () => null,
};

const VALID_TOPICS = new Set<string>(Object.keys(serializerRegistry));

/** Topics that push on their own game events (emitter-driven) rather than the polling loop. */
const EVENT_TOPICS = new Set<Topic>(["terminal", "events"]);

export function isValidTopic(topic: string): topic is Topic {
  return VALID_TOPICS.has(topic);
}

interface GameEventDto {
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

type SubscriptionEntry = {
  send: (msg: object) => void;
  intervalMs: number;
  lastSentJson: string | null;
  seq: number;
  lastEmitTime: number;
  /** Teardown for any emitter subscriptions (event topics). */
  teardownExtra: (() => void) | null;
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

function hasPolledTopics(): boolean {
  for (const topic of subscriptions.keys()) {
    if (!EVENT_TOPICS.has(topic)) return true;
  }
  return false;
}

function ensureGameCycleListener(): void {
  if (gameCycleUnsubscribe) return;
  gameCycleUnsubscribe = GameCycleEvents.subscribe(onGameCycle);
}

function releaseGameCycleListener(): void {
  if (!hasPolledTopics() && gameCycleUnsubscribe) {
    gameCycleUnsubscribe();
    gameCycleUnsubscribe = null;
  }
}

const MIN_INTERVAL_MS = 500;

function onGameCycle(): void {
  const now = Date.now();
  for (const [topic, entry] of subscriptions) {
    if (EVENT_TOPICS.has(topic)) continue; // event topics push on their own emitters
    if (now - entry.lastEmitTime < entry.intervalMs) continue;
    pushTopicIfChanged(topic, entry);
  }
}

/** Push a single game event notification directly on the events topic (no deduplication). */
function pushEventsNotification(entry: SubscriptionEntry, data: GameEventDto): void {
  entry.seq++;
  entry.lastEmitTime = Date.now();
  entry.send({ jsonrpc: "2.0", method: "event", params: { topic: "events", seq: entry.seq, data } });
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
  // Re-subscribing to an active topic replaces the prior subscription (and tears down its emitters).
  unsubscribeTopic(topic);

  const effectiveInterval = Math.max(intervalMs ?? 1000, MIN_INTERVAL_MS);
  const entry: SubscriptionEntry = {
    send,
    intervalMs: effectiveInterval,
    lastSentJson: null,
    seq: 0,
    lastEmitTime: 0,
    teardownExtra: null,
  };
  subscriptions.set(topic, entry);

  if (topic === "terminal") {
    // Event-driven: push on any terminal output change or clear.
    const onTerminalEvent = () => pushTopicIfChanged(topic, entry);
    const unsubOutput = TerminalEvents.subscribe(onTerminalEvent);
    const unsubClear = TerminalClearEvents.subscribe(onTerminalEvent);
    entry.teardownExtra = () => {
      unsubOutput();
      unsubClear();
    };
  } else if (topic === "events") {
    // Faction invite events — only "New" type; "ClearAll" is internal UI state.
    const unsubFactionInvite = FactionInvitationEvents.subscribe((event) => {
      if (event.type !== "New") return;
      pushEventsNotification(entry, {
        category: "factionInvite",
        message: `Received faction invitation from ${event.factionName}.`,
        data: { faction: event.factionName },
      });
    });

    // Save events — fires after every successful saveGame() call.
    const unsubSave = SaveEvents.subscribe(() => {
      pushEventsNotification(entry, { category: "save", message: "Game saved." });
    });

    // Work completion: edge-detect Player.currentWork → null transition on the game cycle.
    // Capture the current work at subscription time so the first cycle is never a false positive.
    let lastWork: PlayerBaseWork | null = Player.currentWork;
    const unsubWork = GameCycleEvents.subscribe(() => {
      const currentWork = Player.currentWork;
      if (lastWork !== null && currentWork === null) {
        const category = isCreateProgramWork(lastWork) ? "programComplete" : "workComplete";
        pushEventsNotification(entry, {
          category,
          message: `${category === "programComplete" ? "Program" : "Work"} completed: ${lastWork.type}`,
        });
      }
      lastWork = currentWork;
    });

    entry.teardownExtra = () => {
      unsubFactionInvite();
      unsubSave();
      unsubWork();
    };
  } else if (!EVENT_TOPICS.has(topic)) {
    ensureGameCycleListener();
  }

  // Push initial snapshot immediately (always fires since lastSentJson starts as null).
  pushTopicIfChanged(topic, entry);
}

export function unsubscribeTopic(topic: Topic): void {
  const entry = subscriptions.get(topic);
  if (!entry) return;
  if (entry.teardownExtra) entry.teardownExtra();
  subscriptions.delete(topic);
  releaseGameCycleListener();
}

export function clearAllSubscriptions(): void {
  for (const entry of subscriptions.values()) {
    if (entry.teardownExtra) entry.teardownExtra();
  }
  subscriptions.clear();
  if (gameCycleUnsubscribe) {
    gameCycleUnsubscribe();
    gameCycleUnsubscribe = null;
  }
  // Drop the connection sender so no stale references survive a closed connection.
  _currentSend = null;
}
