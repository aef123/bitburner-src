/**
 * Tests for the Active Scripts network-RAM classification/aggregation module (Task 10, 1F).
 *
 * Covers:
 *   - classifyServer: home / hacknet / purchased / rooted / unrooted-foreign fixtures
 *     (hacknet servers are ALSO purchasedByPlayer — the hacknet check must win)
 *   - aggregateNetworkRam: per-category used totals, free = totalMax - totalUsed,
 *     unrooted foreign servers excluded entirely
 *   - buildRamBarSegments: mock order home→purchased→rooted→hacknet→free, zero-RAM
 *     categories produce NO segment (the phantom-2px-gap bug class from the old
 *     dashboard branch), empty network → no segments
 *   - totalMoneyRate / totalExpRate: sums over per-script online rates, including the
 *     0.01-seconds onlineRunningTime floor and a zero-time guard
 */

import {
  aggregateNetworkRam,
  buildRamBarSegments,
  classifyServer,
  totalExpRate,
  totalMoneyRate,
  type NetworkRamServer,
} from "../../../../src/ui/ActiveScripts/networkRam";

function makeServer(overrides: Partial<NetworkRamServer> = {}): NetworkRamServer {
  return {
    hostname: "n00dles",
    isHacknetServer: false,
    purchasedByPlayer: false,
    hasAdminRights: false,
    ramUsed: 0,
    maxRam: 0,
    ...overrides,
  };
}

const home = makeServer({ hostname: "home", purchasedByPlayer: true, hasAdminRights: true, ramUsed: 112, maxRam: 128 });
const pserv = makeServer({
  hostname: "pserv-0",
  purchasedByPlayer: true,
  hasAdminRights: true,
  ramUsed: 984,
  maxRam: 1024,
});
const hacknet = makeServer({
  hostname: "hacknet-server-0",
  isHacknetServer: true,
  purchasedByPlayer: true,
  hasAdminRights: true,
  ramUsed: 32,
  maxRam: 64,
});
const rooted = makeServer({ hostname: "phantasy", hasAdminRights: true, ramUsed: 388, maxRam: 946 });
const unrooted = makeServer({ hostname: "megacorp", ramUsed: 0, maxRam: 512 });

describe("classifyServer", () => {
  it("classifies home by hostname", () => {
    expect(classifyServer(home)).toBe("home");
  });

  it("classifies hacknet servers even though they are purchasedByPlayer", () => {
    expect(classifyServer(hacknet)).toBe("hacknet");
  });

  it("classifies player-purchased servers", () => {
    expect(classifyServer(pserv)).toBe("purchased");
  });

  it("classifies rooted foreign servers", () => {
    expect(classifyServer(rooted)).toBe("rooted");
  });

  it("excludes unrooted foreign servers (no admin rights → not part of the usable network)", () => {
    expect(classifyServer(unrooted)).toBeNull();
  });
});

describe("aggregateNetworkRam", () => {
  it("sums used RAM per category and computes free from the network total", () => {
    const totals = aggregateNetworkRam([home, pserv, hacknet, rooted, unrooted]);
    expect(totals.used.home).toBe(112);
    expect(totals.used.purchased).toBe(984);
    expect(totals.used.hacknet).toBe(32);
    expect(totals.used.rooted).toBe(388);
    expect(totals.totalUsed).toBe(112 + 984 + 32 + 388);
    // Unrooted foreign RAM (512 GB) must NOT be counted in the network total.
    expect(totals.totalMax).toBe(128 + 1024 + 64 + 946);
    expect(totals.free).toBe(totals.totalMax - totals.totalUsed);
  });

  it("returns all-zero totals for an empty server list", () => {
    const totals = aggregateNetworkRam([]);
    expect(totals.totalMax).toBe(0);
    expect(totals.totalUsed).toBe(0);
    expect(totals.free).toBe(0);
    expect(totals.used).toEqual({ home: 0, purchased: 0, rooted: 0, hacknet: 0 });
  });
});

describe("buildRamBarSegments", () => {
  it("orders segments home → purchased → rooted → hacknet → free", () => {
    const totals = aggregateNetworkRam([home, pserv, hacknet, rooted]);
    const segments = buildRamBarSegments(totals);
    expect(segments.map((s) => s.key)).toEqual(["home", "purchased", "rooted", "hacknet", "free"]);
  });

  it("computes fractions of the network total that sum to 1", () => {
    const totals = aggregateNetworkRam([home, pserv, hacknet, rooted]);
    const segments = buildRamBarSegments(totals);
    const sum = segments.reduce((acc, s) => acc + s.fraction, 0);
    expect(sum).toBeCloseTo(1, 10);
    const homeSegment = segments.find((s) => s.key === "home");
    expect(homeSegment?.fraction).toBeCloseTo(112 / totals.totalMax, 10);
  });

  it("omits zero-RAM categories entirely — no phantom segment, no phantom gap", () => {
    // No hacknet servers at all: the hacknet segment must not exist (rendering an
    // empty segment still costs a 2px flex gap — the old dashboard bug).
    const totals = aggregateNetworkRam([home, pserv, rooted]);
    const segments = buildRamBarSegments(totals);
    expect(segments.map((s) => s.key)).toEqual(["home", "purchased", "rooted", "free"]);
  });

  it("omits the free segment when the network is fully used", () => {
    const fullHome = makeServer({ hostname: "home", purchasedByPlayer: true, ramUsed: 128, maxRam: 128 });
    const segments = buildRamBarSegments(aggregateNetworkRam([fullHome]));
    expect(segments.map((s) => s.key)).toEqual(["home"]);
  });

  it("returns no segments for an empty network (zero total RAM)", () => {
    expect(buildRamBarSegments(aggregateNetworkRam([]))).toEqual([]);
  });
});

describe("darknet server classification", () => {
  // DarknetServer inherits BaseServer but is NOT purchasedByPlayer and does NOT set
  // isHacknetServer — so the classifyServer chain falls through to the rooted/null branch.

  it("a cracked (hasAdminRights) darknet server classifies as rooted", () => {
    // Mirrors what GetAllServers(true) would pass in for an authenticated dnet node.
    const crackedDnet = makeServer({
      hostname: "dnet-abc123",
      purchasedByPlayer: false,
      isHacknetServer: false,
      hasAdminRights: true,
      ramUsed: 64,
      maxRam: 128,
    });
    expect(classifyServer(crackedDnet)).toBe("rooted");
  });

  it("an uncracked (no admin) darknet server is excluded from aggregation", () => {
    const uncrackedDnet = makeServer({
      hostname: "dnet-locked",
      purchasedByPlayer: false,
      isHacknetServer: false,
      hasAdminRights: false,
      ramUsed: 0,
      maxRam: 256,
    });
    expect(classifyServer(uncrackedDnet)).toBeNull();
  });

  it("aggregateNetworkRam counts cracked dnet RAM in rooted and excludes uncracked", () => {
    const crackedDnet = makeServer({
      hostname: "dnet-abc123",
      purchasedByPlayer: false,
      isHacknetServer: false,
      hasAdminRights: true,
      ramUsed: 64,
      maxRam: 128,
    });
    const uncrackedDnet = makeServer({
      hostname: "dnet-locked",
      purchasedByPlayer: false,
      isHacknetServer: false,
      hasAdminRights: false,
      ramUsed: 0,
      maxRam: 256,
    });
    // Only the cracked dnet node should appear in the rooted bucket.
    // The uncracked node's 256 GB must not inflate totalMax (same rule as unrooted foreign servers).
    const totals = aggregateNetworkRam([crackedDnet, uncrackedDnet]);
    expect(totals.used.rooted).toBe(64);
    expect(totals.totalMax).toBe(128);
    expect(totals.totalUsed).toBe(64);
    expect(totals.free).toBe(64);
  });
});

describe("totalMoneyRate / totalExpRate", () => {
  it("sums per-script online rates", () => {
    const scripts = [
      { onlineMoneyMade: 100, onlineExpGained: 50, onlineRunningTime: 10 },
      { onlineMoneyMade: 30, onlineExpGained: 20, onlineRunningTime: 2 },
    ];
    expect(totalMoneyRate(scripts)).toBeCloseTo(100 / 10 + 30 / 2, 10);
    expect(totalExpRate(scripts)).toBeCloseTo(50 / 10 + 20 / 2, 10);
  });

  it("handles the RunningScript 0.01-seconds onlineRunningTime floor", () => {
    // A freshly-launched script has onlineRunningTime = 0.01 (RunningScript.ts default).
    const scripts = [{ onlineMoneyMade: 1, onlineExpGained: 2, onlineRunningTime: 0.01 }];
    expect(totalMoneyRate(scripts)).toBeCloseTo(100, 10);
    expect(totalExpRate(scripts)).toBeCloseTo(200, 10);
  });

  it("guards against a non-positive running time instead of dividing by zero", () => {
    const scripts = [{ onlineMoneyMade: 5, onlineExpGained: 5, onlineRunningTime: 0 }];
    expect(totalMoneyRate(scripts)).toBe(0);
    expect(totalExpRate(scripts)).toBe(0);
  });

  it("returns 0 for no scripts", () => {
    expect(totalMoneyRate([])).toBe(0);
    expect(totalExpRate([])).toBe(0);
  });
});
