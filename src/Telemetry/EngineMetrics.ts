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
import type { Gang } from "../Gang/Gang";
import type { GangMember } from "../Gang/GangMember";

function isOwned(server: BaseServer): boolean {
  return server.purchasedByPlayer || server.hostname === "home";
}

/** Per-member stat fields, mapped to the same names the player-skill metric uses. */
const GANG_MEMBER_STATS: Array<[string, (member: GangMember) => number]> = [
  ["hacking", (m) => m.hack],
  ["strength", (m) => m.str],
  ["defense", (m) => m.def],
  ["dexterity", (m) => m.dex],
  ["agility", (m) => m.agi],
  ["charisma", (m) => m.cha],
];

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

  registerGangMetrics(meter, base);

  const income = meter.createCounter("bitburner.player.income");
  setIncomeRecorder((source, amount) => income.add(amount, { ...base, source }));
}

/**
 * Registers gang metrics. All are observable and guard on `Player.gang`, so they simply
 * observe nothing when the player has no gang. Every series is tagged with the gang's faction.
 */
function registerGangMetrics(meter: Meter, base: Record<string, string | number>): void {
  // Gang-level gauges: name -> reader.
  const gangGauges: Array<[string, (gang: Gang) => number]> = [
    ["bitburner.gang.respect", (g) => g.respect],
    ["bitburner.gang.wanted_level", (g) => g.wanted],
    ["bitburner.gang.wanted_penalty", (g) => g.getWantedPenalty()],
    ["bitburner.gang.territory", (g) => g.getTerritory()],
    ["bitburner.gang.power", (g) => g.getPower()],
    ["bitburner.gang.respect_gain_rate", (g) => g.respectGainRate],
    ["bitburner.gang.wanted_gain_rate", (g) => g.wantedGainRate],
    ["bitburner.gang.money_gain_rate", (g) => g.moneyGainRate],
    ["bitburner.gang.member_count", (g) => g.members.length],
    ["bitburner.gang.faction_reputation", (g) => Factions[g.facName]?.playerReputation ?? 0],
  ];
  for (const [name, read] of gangGauges) {
    meter.createObservableGauge(name).addCallback((r) => {
      const gang = Player.gang;
      if (gang) r.observe(read(gang), { ...base, faction: gang.facName });
    });
  }

  // Per-member stats (bounded cardinality: member count is small, stats are fixed).
  meter.createObservableGauge("bitburner.gang.member.stat").addCallback((r) => {
    const gang = Player.gang;
    if (!gang) return;
    for (const member of gang.members) {
      for (const [stat, read] of GANG_MEMBER_STATS) {
        r.observe(read(member), { ...base, faction: gang.facName, member: member.name, stat });
      }
    }
  });

  meter.createObservableGauge("bitburner.gang.member.earned_respect").addCallback((r) => {
    const gang = Player.gang;
    if (!gang) return;
    for (const member of gang.members) {
      r.observe(member.earnedRespect, { ...base, faction: gang.facName, member: member.name });
    }
  });
}

/** Detaches the income recorder. Observable instruments are torn down with the provider. */
export function unregisterEngineMetrics(): void {
  setIncomeRecorder(null);
}
