/**
 * Registers the observable game metrics on a Meter and wires the income counter. This module
 * is only reached via the dynamic import() in Telemetry.ts, so it may statically import
 * @opentelemetry/* and game state. The observable callbacks run on the exporter's schedule,
 * decoupled from the 200ms tick.
 */
import type { Meter } from "@opentelemetry/api";
import { Player } from "@player";
import { GetAllServers } from "../Server/AllServers";
import { Factions } from "../Faction/Factions";
import { workerScripts } from "../Netscript/WorkerScripts";
import { setIncomeRecorder } from "./TelemetryMetrics";
import type { BaseServer } from "../Server/BaseServer";

function isOwned(server: BaseServer): boolean {
  return server.purchasedByPlayer || server.hostname === "home";
}

/** Creates all engine metric instruments on the given meter and wires the income recorder. */
export function registerEngineMetrics(meter: Meter, bitNode: number): void {
  const base = { bitnode: bitNode };

  meter.createObservableGauge("bitburner.player.money").addCallback((r) => r.observe(Player.money, base));

  const skill = meter.createObservableGauge("bitburner.player.skill");
  skill.addCallback((r) => {
    for (const [name, value] of Object.entries(Player.skills) as [string, number][]) {
      r.observe(value, { ...base, skill: name });
    }
  });

  meter.createObservableGauge("bitburner.player.karma").addCallback((r) => r.observe(Player.karma, base));
  meter.createObservableGauge("bitburner.player.hp.current").addCallback((r) => r.observe(Player.hp.current, base));
  meter.createObservableGauge("bitburner.player.hp.max").addCallback((r) => r.observe(Player.hp.max, base));
  meter.createObservableGauge("bitburner.scripts.running").addCallback((r) => r.observe(workerScripts.size, base));

  meter.createObservableGauge("bitburner.servers.ram_used").addCallback((r) => {
    let used = 0;
    for (const server of GetAllServers()) if (isOwned(server)) used += server.ramUsed;
    r.observe(used, base);
  });
  meter.createObservableGauge("bitburner.servers.ram_total").addCallback((r) => {
    let total = 0;
    for (const server of GetAllServers()) if (isOwned(server)) total += server.maxRam;
    r.observe(total, base);
  });

  meter.createObservableGauge("bitburner.faction.reputation").addCallback((r) => {
    for (const name of Player.factions) {
      const faction = Factions[name];
      if (faction) r.observe(faction.playerReputation, { ...base, faction: name });
    }
  });

  const income = meter.createCounter("bitburner.player.income");
  setIncomeRecorder((source, amount) => income.add(amount, { ...base, source }));
}

/** Detaches the income recorder. Observable instruments are torn down with the provider. */
export function unregisterEngineMetrics(): void {
  setIncomeRecorder(null);
}
