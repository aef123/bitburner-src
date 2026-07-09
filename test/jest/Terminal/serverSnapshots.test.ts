/**
 * Tests for the target-panel revelation snapshot store (Task 9, 2A part 2).
 *
 * Covers: record/get by hostname, timestamp capture, overwrite on re-record, value copying
 * (a snapshot must stay frozen when the live server mutates afterwards), and clearing.
 *
 * Honesty split (scan-analyze leak fix): scan-analyze records a PARTIAL snapshot containing only
 * what it printed — money/security must not exist on it in any form. Overwrite semantics: analyze
 * always overwrites; a partial never overwrites a full snapshot; a partial may replace a partial.
 */

import { Server } from "../../../src/Server/Server";
import {
  clearServerSnapshots,
  getServerSnapshot,
  recordPartialServerSnapshot,
  recordServerSnapshot,
} from "../../../src/Terminal/serverSnapshots";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  clearServerSnapshots();
});

afterEach(() => {
  clearServerSnapshots();
});

function makeServer(): Server {
  const server = new Server({ hostname: "snapshot-test-server" });
  server.moneyAvailable = 2500;
  server.moneyMax = 10000;
  server.hackDifficulty = 42;
  server.minDifficulty = 5;
  server.requiredHackingSkill = 300;
  server.numOpenPortsRequired = 3;
  server.openPortCount = 1;
  server.maxRam = 64;
  return server;
}

describe("serverSnapshots", () => {
  it("returns undefined for a hostname that was never recorded", () => {
    expect(getServerSnapshot("never-analyzed")).toBeUndefined();
  });

  it("records all snapshot fields keyed by hostname", () => {
    const server = makeServer();
    recordServerSnapshot(server, 12345);
    const snapshot = getServerSnapshot(server.hostname);
    expect(snapshot).toEqual({
      source: "analyze",
      moneyAvailable: 2500,
      moneyMax: 10000,
      hackDifficulty: 42,
      minDifficulty: 5,
      requiredHackingSkill: 300,
      numOpenPortsRequired: 3,
      openPortCount: 1,
      maxRam: 64,
      timestamp: 12345,
    });
  });

  it("defaults the timestamp to now", () => {
    const server = makeServer();
    const before = Date.now();
    recordServerSnapshot(server);
    const after = Date.now();
    const snapshot = getServerSnapshot(server.hostname);
    expect(snapshot?.timestamp).toBeGreaterThanOrEqual(before);
    expect(snapshot?.timestamp).toBeLessThanOrEqual(after);
  });

  it("overwrites the previous snapshot on re-record", () => {
    const server = makeServer();
    recordServerSnapshot(server, 100);
    server.moneyAvailable = 9999;
    recordServerSnapshot(server, 200);
    const snapshot = getServerSnapshot(server.hostname);
    if (snapshot?.source !== "analyze") throw new Error("expected a full snapshot");
    expect(snapshot.moneyAvailable).toBe(9999);
    expect(snapshot.timestamp).toBe(200);
  });

  it("stays frozen when the live server mutates after recording (that IS the feature)", () => {
    const server = makeServer();
    recordServerSnapshot(server, 100);
    server.moneyAvailable = 1;
    server.hackDifficulty = 99;
    const snapshot = getServerSnapshot(server.hostname);
    if (snapshot?.source !== "analyze") throw new Error("expected a full snapshot");
    expect(snapshot.moneyAvailable).toBe(2500);
    expect(snapshot.hackDifficulty).toBe(42);
  });

  describe("partial (scan-analyze) snapshots", () => {
    it("records ONLY the fields scan-analyze printed — money/security keys must not exist at all", () => {
      const server = makeServer();
      recordPartialServerSnapshot(server, 12345);
      const snapshot = getServerSnapshot(server.hostname);
      // Exact-shape match: any extra key (moneyAvailable, hackDifficulty, ...) fails this.
      expect(snapshot).toEqual({
        source: "scan-analyze",
        requiredHackingSkill: 300,
        numOpenPortsRequired: 3,
        openPortCount: 1,
        maxRam: 64,
        timestamp: 12345,
      });
    });

    it("never overwrites an existing full (analyze) snapshot — no downgrade", () => {
      const server = makeServer();
      recordServerSnapshot(server, 100);
      server.requiredHackingSkill = 999;
      recordPartialServerSnapshot(server, 200);
      const snapshot = getServerSnapshot(server.hostname);
      // The full snapshot survives untouched: source, values, AND timestamp.
      if (snapshot?.source !== "analyze") throw new Error("expected the full snapshot to survive");
      expect(snapshot.timestamp).toBe(100);
      expect(snapshot.requiredHackingSkill).toBe(300);
      expect(snapshot.moneyAvailable).toBe(2500);
    });

    it("replaces an older partial with a fresher partial", () => {
      const server = makeServer();
      recordPartialServerSnapshot(server, 100);
      server.maxRam = 128;
      recordPartialServerSnapshot(server, 200);
      const snapshot = getServerSnapshot(server.hostname);
      expect(snapshot?.source).toBe("scan-analyze");
      expect(snapshot?.maxRam).toBe(128);
      expect(snapshot?.timestamp).toBe(200);
    });

    it("is upgraded (fully overwritten) by a later analyze", () => {
      const server = makeServer();
      recordPartialServerSnapshot(server, 100);
      recordServerSnapshot(server, 200);
      const snapshot = getServerSnapshot(server.hostname);
      if (snapshot?.source !== "analyze") throw new Error("expected analyze to upgrade the partial");
      expect(snapshot.timestamp).toBe(200);
      expect(snapshot.moneyAvailable).toBe(2500);
      expect(snapshot.hackDifficulty).toBe(42);
    });
  });

  it("clearServerSnapshots empties the store", () => {
    const server = makeServer();
    recordServerSnapshot(server);
    clearServerSnapshots();
    expect(getServerSnapshot(server.hostname)).toBeUndefined();
  });
});
