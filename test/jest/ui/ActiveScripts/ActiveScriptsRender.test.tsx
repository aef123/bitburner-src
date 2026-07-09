/**
 * Render tests for the redesigned Active Scripts page pieces (Task 10, 1F).
 *
 * Covers:
 *   - NetworkRamBar: renders one DOM segment per non-zero category (zero-RAM categories
 *     produce no element at all — the phantom-gap guard at the DOM level), plus legend
 *   - ScriptRow: formatted values (name, args, threads, RAM, income/s, exp/s) render;
 *     em-dash placeholders for zero income/exp; logs fires LogBoxEvents.emit with the
 *     RunningScript; kill fires killWorkerScriptByPid with the pid
 *   - ServerGroup: header shows hostname + used/total RAM; expanded group shows the
 *     column headers and its script rows
 */

import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import type { WorkerScript } from "../../../../src/Netscript/WorkerScript";
import type { BaseServer } from "../../../../src/Server/BaseServer";
import type { RunningScript } from "../../../../src/Script/RunningScript";

import * as killModule from "../../../../src/Netscript/killWorkerScript";
import { LogBoxEvents } from "../../../../src/ui/React/LogBoxManager";
import { Settings } from "../../../../src/Settings/Settings";
import { NetworkRamBar } from "../../../../src/ui/ActiveScripts/NetworkRamBar";
import { ScriptRow } from "../../../../src/ui/ActiveScripts/ScriptRow";
import { ServerGroup } from "../../../../src/ui/ActiveScripts/ServerGroup";
import { aggregateNetworkRam, type NetworkRamServer } from "../../../../src/ui/ActiveScripts/networkRam";
import { formatExp, formatMoney, formatRam, formatThreads } from "../../../../src/ui/formatNumber";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
});

function render(element: React.ReactElement): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(<ThemeProvider theme={testTheme}>{element}</ThemeProvider>, container);
  });
  return container;
}

function makeNetworkServer(overrides: Partial<NetworkRamServer> = {}): NetworkRamServer {
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

function makeWorkerScript(overrides: Partial<RunningScript> = {}): WorkerScript {
  const scriptRef = {
    filename: "batcher.js",
    args: ["--target", "phantasy"],
    threads: 2048,
    ramUsage: 2,
    server: "home",
    pid: 42,
    onlineMoneyMade: 1000,
    onlineExpGained: 500,
    onlineRunningTime: 10,
    offlineMoneyMade: 0,
    offlineExpGained: 0,
    offlineRunningTime: 0,
    ...overrides,
  };
  return { pid: scriptRef.pid, name: scriptRef.filename, hostname: scriptRef.server, scriptRef } as WorkerScript;
}

describe("NetworkRamBar", () => {
  it("renders one segment element per non-zero category and none for zero-RAM categories", () => {
    // home + purchased + rooted, NO hacknet: exactly 4 segments (3 used + free).
    const totals = aggregateNetworkRam([
      makeNetworkServer({ hostname: "home", purchasedByPlayer: true, ramUsed: 112, maxRam: 128 }),
      makeNetworkServer({ hostname: "pserv-0", purchasedByPlayer: true, hasAdminRights: true, ramUsed: 90, maxRam: 100 }),
      makeNetworkServer({ hostname: "phantasy", hasAdminRights: true, ramUsed: 10, maxRam: 32 }),
    ]);
    const dom = render(<NetworkRamBar totals={totals} />);
    const segments = [...dom.querySelectorAll("[data-ram-segment]")];
    expect(segments.map((s) => s.getAttribute("data-ram-segment"))).toEqual(["home", "purchased", "rooted", "free"]);
  });

  it("renders no segments for an empty network", () => {
    const dom = render(<NetworkRamBar totals={aggregateNetworkRam([])} />);
    expect(dom.querySelectorAll("[data-ram-segment]").length).toBe(0);
  });

  it("renders the legend labels", () => {
    const dom = render(<NetworkRamBar totals={aggregateNetworkRam([])} />);
    for (const label of ["home", "purchased", "rooted network", "hacknet", "free"]) {
      expect(dom.textContent).toContain(label);
    }
  });
});

describe("ScriptRow", () => {
  it("renders formatted name, args, threads, RAM, income/s and exp/s", () => {
    const ws = makeWorkerScript();
    const dom = render(<ScriptRow workerScript={ws} />);
    const text = dom.textContent ?? "";
    expect(text).toContain("batcher.js");
    expect(text).toContain("--target phantasy");
    expect(text).toContain(formatThreads(2048));
    expect(text).toContain(formatRam(2 * 2048)); // ramUsage is GB/thread
    expect(text).toContain(formatMoney(1000 / 10)); // onlineMoneyMade / onlineRunningTime
    expect(text).toContain(formatExp(500 / 10)); // onlineExpGained / onlineRunningTime
  });

  it("renders em-dash placeholders for empty args and zero income/exp", () => {
    const ws = makeWorkerScript({ args: [], onlineMoneyMade: 0, onlineExpGained: 0 });
    const dom = render(<ScriptRow workerScript={ws} />);
    expect(dom.querySelector("[data-script-args]")?.textContent).toBe("—");
    expect(dom.querySelector("[data-script-income]")?.textContent).toBe("—");
    expect(dom.querySelector("[data-script-exp]")?.textContent).toBe("—");
  });

  it("fires LogBoxEvents.emit with the RunningScript when logs is clicked", () => {
    const ws = makeWorkerScript();
    const seen: unknown[] = [];
    const unsubscribe = LogBoxEvents.subscribe((rs) => seen.push(rs));
    try {
      const dom = render(<ScriptRow workerScript={ws} />);
      const logsButton = dom.querySelector("[data-script-logs]");
      expect(logsButton).not.toBeNull();
      act(() => {
        Simulate.click(logsButton as Element);
      });
      expect(seen).toEqual([ws.scriptRef]);
    } finally {
      unsubscribe();
    }
  });

  it("fires killWorkerScriptByPid with the pid when kill is clicked", () => {
    const spy = jest.spyOn(killModule, "killWorkerScriptByPid").mockReturnValue(false);
    const ws = makeWorkerScript();
    const dom = render(<ScriptRow workerScript={ws} />);
    const killButton = dom.querySelector("[data-script-kill]");
    expect(killButton).not.toBeNull();
    act(() => {
      Simulate.click(killButton as Element);
    });
    expect(spy).toHaveBeenCalledWith(42);
  });
});

describe("ServerGroup", () => {
  const server = {
    hostname: "home",
    isHacknetServer: false,
    purchasedByPlayer: true,
    hasAdminRights: true,
    ramUsed: 112.6,
    maxRam: 128,
  } as BaseServer;

  it("shows hostname, used/total RAM and script count in the header", () => {
    const dom = render(<ServerGroup server={server} scripts={[makeWorkerScript()]} startOpen={false} />);
    const text = dom.textContent ?? "";
    expect(text).toContain("home");
    expect(text).toContain(formatRam(112.6));
    expect(text).toContain(formatRam(128));
    expect(text).toContain("1 script");
  });

  it("shows column headers and script rows when expanded", () => {
    const dom = render(<ServerGroup server={server} scripts={[makeWorkerScript()]} startOpen={true} />);
    const text = dom.textContent ?? "";
    for (const header of ["SCRIPT", "ARGS", "THREADS", "RAM", "INCOME/S", "EXP/S"]) {
      expect(text).toContain(header);
    }
    expect(text).toContain("batcher.js");
  });

  it("hides script rows when collapsed", () => {
    const dom = render(<ServerGroup server={server} scripts={[makeWorkerScript()]} startOpen={false} />);
    expect(dom.textContent).not.toContain("batcher.js");
  });
});
