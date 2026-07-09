import { Player, setPlayer } from "@player";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { registerEngineMetrics, unregisterEngineMetrics } from "../../../src/Telemetry/EngineMetrics";
import { recordIncome } from "../../../src/Telemetry/TelemetryMetrics";

interface Observation {
  value: number;
  attributes: Record<string, unknown>;
}

/** A fake OTel Meter that captures observable callbacks and counter adds for assertions. */
function makeFakeMeter() {
  const callbacks: Array<(r: { observe: (value: number, attributes?: Record<string, unknown>) => void }) => void> = [];
  const gaugesByName = new Map<string, typeof callbacks>();
  const counterAdds: Observation[] = [];

  function makeObservable(name: string) {
    const list: typeof callbacks = [];
    gaugesByName.set(name, list);
    return {
      addCallback: (cb: (typeof callbacks)[number]) => list.push(cb),
    };
  }

  const meter = {
    createObservableGauge: (name: string) => makeObservable(name),
    createObservableCounter: (name: string) => makeObservable(name),
    createCounter: () => ({
      add: (value: number, attributes: Record<string, unknown> = {}) => counterAdds.push({ value, attributes }),
    }),
  };

  /** Invokes every callback registered for a gauge name and returns its observations. */
  function collect(name: string): Observation[] {
    const out: Observation[] = [];
    for (const cb of gaugesByName.get(name) ?? []) {
      cb({ observe: (value, attributes = {}) => out.push({ value, attributes }) });
    }
    return out;
  }

  return { meter, collect, counterAdds };
}

describe("EngineMetrics", () => {
  beforeAll(() => setPlayer(new PlayerObject()));
  afterEach(() => unregisterEngineMetrics());

  it("observes player money and per-skill gauges", () => {
    Player.money = 12345;
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 3);

    expect(collect("bitburner.player.money")).toEqual([{ value: 12345, attributes: { bitnode: 3 } }]);

    const skills = collect("bitburner.player.skill");
    const hacking = skills.find((o) => o.attributes.skill === "hacking");
    expect(hacking?.value).toBe(Player.skills.hacking);
    expect(skills.length).toBe(Object.keys(Player.skills).length);
  });

  it("wires recordIncome to the income counter with a source attribute", () => {
    const { meter, counterAdds } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);
    recordIncome("hacking", 500);
    expect(counterAdds).toContainEqual({ value: 500, attributes: { bitnode: 1, source: "hacking" } });
  });

  it("recordIncome is a no-op after unregister", () => {
    const { meter, counterAdds } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);
    unregisterEngineMetrics();
    recordIncome("hacking", 999);
    expect(counterAdds).toHaveLength(0);
  });

  it("observes no gang metrics when the player has no gang", () => {
    Player.gang = null;
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);
    expect(collect("bitburner.gang.respect")).toEqual([]);
    expect(collect("bitburner.gang.member.stat")).toEqual([]);
  });

  it("observes gang-level and per-member gang metrics when a gang exists", () => {
    const fakeGang = {
      facName: "Slum Snakes",
      respect: 1000,
      wanted: 50,
      respectGainRate: 5,
      wantedGainRate: 0.5,
      moneyGainRate: 200,
      getWantedPenalty: () => 0.95,
      getTerritory: () => 0.25,
      getPower: () => 42,
      members: [
        { name: "Alice", hack: 10, str: 20, def: 30, dex: 40, agi: 50, cha: 60, earnedRespect: 111 },
        { name: "Bob", hack: 1, str: 2, def: 3, dex: 4, agi: 5, cha: 6, earnedRespect: 7 },
      ],
    };
    Player.gang = fakeGang as never;
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 2);

    expect(collect("bitburner.gang.respect")).toEqual([
      { value: 1000, attributes: { bitnode: 2, faction: "Slum Snakes" } },
    ]);
    expect(collect("bitburner.gang.territory")[0].value).toBe(0.25);
    expect(collect("bitburner.gang.member_count")[0].value).toBe(2);

    const memberStats = collect("bitburner.gang.member.stat");
    expect(memberStats.length).toBe(2 * 6); // 2 members × 6 stats
    const aliceHacking = memberStats.find((o) => o.attributes.member === "Alice" && o.attributes.stat === "hacking");
    expect(aliceHacking?.value).toBe(10);

    const respect = collect("bitburner.gang.member.earned_respect");
    expect(respect.find((o) => o.attributes.member === "Bob")?.value).toBe(7);

    Player.gang = null;
  });
});
