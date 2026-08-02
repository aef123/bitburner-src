import { Player, setPlayer } from "@player";
import {
  AugmentationName,
  CityName,
  CompanyName,
  CrimeType,
  FactionName,
  FactionWorkType,
  LocationName,
  UniversityClassType,
} from "@enums";
import { PlayerObject } from "../../../src/PersonObjects/Player/PlayerObject";
import { registerEngineMetrics, sleeveTaskLabels, unregisterEngineMetrics } from "../../../src/Telemetry/EngineMetrics";
import { recordIncome } from "../../../src/Telemetry/TelemetryMetrics";
import { PlayerOwnedAugmentation } from "../../../src/Augmentation/PlayerOwnedAugmentation";
import { Sleeve } from "../../../src/PersonObjects/Sleeve/Sleeve";
import type { SleeveWork } from "../../../src/PersonObjects/Sleeve/Work/Work";
import { SleeveBladeburnerWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveBladeburnerWork";
import { SleeveClassWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveClassWork";
import { SleeveCompanyWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveCompanyWork";
import { SleeveCrimeWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveCrimeWork";
import { SleeveFactionWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveFactionWork";
import { SleeveInfiltrateWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveInfiltrateWork";
import { SleeveRecoveryWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveRecoveryWork";
import { SleeveSupportWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveSupportWork";
import { SleeveSynchroWork } from "../../../src/PersonObjects/Sleeve/Work/SleeveSynchroWork";

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

  it("observes player augmentations split into installed and queued", () => {
    Player.augmentations = [
      new PlayerOwnedAugmentation(AugmentationName.Targeting1),
      new PlayerOwnedAugmentation(AugmentationName.Targeting2),
    ];
    Player.queuedAugmentations = [new PlayerOwnedAugmentation(AugmentationName.Targeting3)];
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);

    expect(collect("bitburner.player.augmentation_count")).toEqual([
      { value: 2, attributes: { bitnode: 1, state: "installed" } },
      { value: 1, attributes: { bitnode: 1, state: "queued" } },
    ]);

    Player.augmentations = [];
    Player.queuedAugmentations = [];
  });
});

describe("sleeve metrics", () => {
  beforeAll(() => setPlayer(new PlayerObject()));
  afterEach(() => {
    Player.sleeves = [];
    unregisterEngineMetrics();
  });

  /** Adds a sleeve to the player and returns it. New sleeves start on recovery work. */
  function addSleeve(): Sleeve {
    const sleeve = new Sleeve();
    Player.sleeves.push(sleeve);
    return sleeve;
  }

  it("observes a zero count and no per-sleeve series when the player has no sleeves", () => {
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);

    expect(collect("bitburner.sleeve.count")).toEqual([{ value: 0, attributes: { bitnode: 1 } }]);
    expect(collect("bitburner.sleeve.shock")).toEqual([]);
    expect(collect("bitburner.sleeve.skill")).toEqual([]);
    expect(collect("bitburner.sleeve.task")).toEqual([]);
  });

  it("observes shock, sync, memory and augmentation count keyed by sleeve index", () => {
    const first = addSleeve();
    first.shock = 42;
    first.sync = 80;
    first.memory = 3;
    first.augmentations.push(new PlayerOwnedAugmentation(AugmentationName.Targeting1));
    const second = addSleeve();
    second.shock = 7;
    second.sync = 15;
    second.memory = 1;

    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 5);

    expect(collect("bitburner.sleeve.count")).toEqual([{ value: 2, attributes: { bitnode: 5 } }]);
    expect(collect("bitburner.sleeve.shock")).toEqual([
      { value: 42, attributes: { bitnode: 5, sleeve: 0 } },
      { value: 7, attributes: { bitnode: 5, sleeve: 1 } },
    ]);
    expect(collect("bitburner.sleeve.sync")).toEqual([
      { value: 80, attributes: { bitnode: 5, sleeve: 0 } },
      { value: 15, attributes: { bitnode: 5, sleeve: 1 } },
    ]);
    expect(collect("bitburner.sleeve.memory")).toEqual([
      { value: 3, attributes: { bitnode: 5, sleeve: 0 } },
      { value: 1, attributes: { bitnode: 5, sleeve: 1 } },
    ]);
    expect(collect("bitburner.sleeve.augmentation_count")).toEqual([
      { value: 1, attributes: { bitnode: 5, sleeve: 0 } },
      { value: 0, attributes: { bitnode: 5, sleeve: 1 } },
    ]);
  });

  it("observes each sleeve skill tagged with the sleeve index and skill name", () => {
    const sleeve = addSleeve();
    sleeve.skills.hacking = 250;
    sleeve.skills.charisma = 12;
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);

    const skills = collect("bitburner.sleeve.skill");
    expect(skills).toContainEqual({ value: 250, attributes: { bitnode: 1, sleeve: 0, skill: "hacking" } });
    expect(skills).toContainEqual({ value: 12, attributes: { bitnode: 1, sleeve: 0, skill: "charisma" } });
    expect(skills.length).toBe(Object.keys(sleeve.skills).length);
  });

  it("observes sleeve hp", () => {
    const sleeve = addSleeve();
    sleeve.hp.current = 6;
    sleeve.hp.max = 11;
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);

    expect(collect("bitburner.sleeve.hp.current")).toEqual([{ value: 6, attributes: { bitnode: 1, sleeve: 0 } }]);
    expect(collect("bitburner.sleeve.hp.max")).toEqual([{ value: 11, attributes: { bitnode: 1, sleeve: 0 } }]);
  });

  it("observes the current task with its detail and city", () => {
    const sleeve = addSleeve();
    sleeve.city = CityName.Aevum;
    sleeve.startWork(new SleeveCrimeWork(CrimeType.homicide));
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);

    expect(collect("bitburner.sleeve.task")).toEqual([
      {
        value: 1,
        attributes: { bitnode: 1, sleeve: 0, task: "CRIME", detail: "Homicide", subdetail: "", city: "Aevum" },
      },
    ]);
  });

  it("reports an idle sleeve as IDLE instead of omitting the series", () => {
    const sleeve = addSleeve();
    sleeve.currentWork = null;
    const { meter, collect } = makeFakeMeter();
    registerEngineMetrics(meter as never, 1);

    expect(collect("bitburner.sleeve.task")).toEqual([
      {
        value: 1,
        attributes: { bitnode: 1, sleeve: 0, task: "IDLE", detail: "", subdetail: "", city: "Sector-12" },
      },
    ]);
  });
});

describe("sleeveTaskLabels", () => {
  const cases: Array<[string, SleeveWork | null, { task: string; detail: string; subdetail: string }]> = [
    ["idle", null, { task: "IDLE", detail: "", subdetail: "" }],
    ["crime", new SleeveCrimeWork(CrimeType.homicide), { task: "CRIME", detail: "Homicide", subdetail: "" }],
    [
      "faction",
      new SleeveFactionWork({ factionWorkType: FactionWorkType.field, factionName: FactionName.Sector12 }),
      { task: "FACTION", detail: "Sector-12", subdetail: "field" },
    ],
    [
      "class",
      new SleeveClassWork({
        classType: UniversityClassType.computerScience,
        location: LocationName.Sector12RothmanUniversity,
      }),
      { task: "CLASS", detail: "Computer Science", subdetail: "Rothman University" },
    ],
    [
      "company",
      new SleeveCompanyWork(CompanyName.NoodleBar),
      { task: "COMPANY", detail: CompanyName.NoodleBar, subdetail: "" },
    ],
    // Defaults to the General/Field Analysis action.
    [
      "bladeburner",
      new SleeveBladeburnerWork(),
      { task: "BLADEBURNER", detail: "Field Analysis", subdetail: "General" },
    ],
    ["recovery", new SleeveRecoveryWork(), { task: "RECOVERY", detail: "", subdetail: "" }],
    ["synchro", new SleeveSynchroWork(), { task: "SYNCHRO", detail: "", subdetail: "" }],
    ["infiltrate", new SleeveInfiltrateWork(), { task: "INFILTRATE", detail: "", subdetail: "" }],
    ["support", new SleeveSupportWork(), { task: "SUPPORT", detail: "", subdetail: "" }],
  ];

  it.each(cases)("labels %s work", (_name, work, expected) => {
    expect(sleeveTaskLabels(work)).toEqual(expected);
  });
});
