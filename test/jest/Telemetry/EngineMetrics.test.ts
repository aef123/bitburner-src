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
});
