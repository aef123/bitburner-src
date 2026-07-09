/**
 * Tests for the terminal target panel (Task 9, 2A part 2).
 *
 * THE critical suite is honesty: the panel must never leak money/security values from the live
 * Server object. Without a snapshot those values must appear NOWHERE in the DOM even though the
 * live Server has them; with a snapshot the panel shows the frozen values + the data-source stamp,
 * and later live mutations must not change what is rendered.
 *
 * Also covers: always-known facts (admin/backdoor/RAM), the quick-action disabled matrix
 * (action running / no admin / backdoor installed / not a Server), quick actions submitting real
 * terminal commands, and non-Server current servers rendering without crashing.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { Settings } from "../../../src/Settings/Settings";
import { GetServerOrThrow } from "../../../src/Server/AllServers";
import { Server } from "../../../src/Server/Server";
import { Terminal } from "../../../src/Terminal";
import { clearServerSnapshots, recordServerSnapshot } from "../../../src/Terminal/serverSnapshots";
import { TargetPanel } from "../../../src/Terminal/ui/TargetPanel";
import { formatMoney, formatRam, formatSecurity } from "../../../src/ui/formatNumber";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  clearServerSnapshots();
  Terminal.action = null;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  Terminal.action = null;
  clearServerSnapshots();
  jest.restoreAllMocks();
});

function renderPanel(): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <TargetPanel />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

/** Connect the player to n00dles and give it distinctive, greppable live values. */
function connectToNoodles(): Server {
  const server = GetServerOrThrow("n00dles");
  if (!(server instanceof Server)) throw new Error("n00dles should be a normal server");
  Player.currentServer = server.hostname;
  server.moneyAvailable = 123456789;
  server.moneyMax = 987654321;
  server.hackDifficulty = 42.5;
  server.minDifficulty = 5;
  return server;
}

function setFakeAction(): void {
  Terminal.action = {
    cancel: () => {},
    finished: Promise.resolve(),
    getProgressText: () => "",
  };
}

function getActionButton(root: HTMLElement, command: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`[data-target-action='${command}']`);
  if (!button) throw new Error(`No quick-action button for ${command}`);
  return button;
}

describe("TargetPanel — connected server", () => {
  it("shows CONNECTED TO with the current server's hostname", () => {
    connectToNoodles();
    const root = renderPanel();
    expect(root.textContent).toContain("CONNECTED TO");
    expect(root.querySelector("[data-target-hostname]")?.textContent).toBe("n00dles");
  });

  it("shows the always-known facts: admin rights, backdoor status, RAM used/max", () => {
    const server = connectToNoodles();
    server.hasAdminRights = true;
    server.backdoorInstalled = false;
    server.ramUsed = 2;
    server.maxRam = 4;
    const root = renderPanel();
    expect(root.querySelector("[data-target-access]")?.textContent).toContain("root");
    expect(root.querySelector("[data-target-backdoor]")?.textContent?.toLowerCase()).toContain("none");
    expect(root.querySelector("[data-target-ram]")?.textContent).toContain(formatRam(2));
    expect(root.querySelector("[data-target-ram]")?.textContent).toContain(formatRam(4));
  });
});

describe("TargetPanel — honesty (no snapshot)", () => {
  it("renders NO money or security values anywhere even though the live Server has them", () => {
    const server = connectToNoodles();
    const root = renderPanel();
    // No dedicated elements for the hidden stats...
    expect(root.querySelector("[data-target-money]")).toBeNull();
    expect(root.querySelector("[data-target-security]")).toBeNull();
    expect(root.querySelector("[data-target-stamp]")).toBeNull();
    // ...and the formatted live values must not appear in any form.
    const text = root.textContent ?? "";
    expect(text).not.toContain(formatMoney(server.moneyAvailable, true));
    expect(text).not.toContain(formatMoney(server.moneyMax, true));
    expect(text).not.toContain(formatSecurity(server.hackDifficulty));
    expect(text).not.toContain("123456789");
    expect(text).not.toContain("42.5");
  });

  it("shows the UNDISCOVERED card naming the server and the analyze command", () => {
    connectToNoodles();
    const root = renderPanel();
    const card = root.querySelector("[data-target-undiscovered]");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("UNDISCOVERED");
    expect(card?.textContent).toContain("n00dles");
    expect(card?.textContent).toContain("analyze");
  });
});

describe("TargetPanel — snapshot rendering", () => {
  it("shows the frozen snapshot values and the data-source stamp", () => {
    const server = connectToNoodles();
    recordServerSnapshot(server, new Date(2026, 0, 1, 14, 2).getTime());
    const root = renderPanel();
    expect(root.querySelector("[data-target-undiscovered]")).toBeNull();
    expect(root.querySelector("[data-target-money]")?.textContent).toContain(formatMoney(123456789, true));
    expect(root.querySelector("[data-target-money]")?.textContent).toContain(formatMoney(987654321, true));
    expect(root.querySelector("[data-target-security]")?.textContent).toContain(formatSecurity(42.5));
    expect(root.querySelector("[data-target-security]")?.textContent).toContain(formatSecurity(5));
    const stamp = root.querySelector("[data-target-stamp]")?.textContent ?? "";
    expect(stamp).toContain("as of");
    expect(stamp).toContain("analyze");
    expect(stamp).toContain("14:02");
    expect(stamp).toContain("run again to refresh");
  });

  it("keeps rendering the frozen values when the live server mutates after the snapshot", () => {
    const server = connectToNoodles();
    recordServerSnapshot(server);
    server.moneyAvailable = 1;
    server.hackDifficulty = 99.9;
    const root = renderPanel();
    expect(root.querySelector("[data-target-money]")?.textContent).toContain(formatMoney(123456789, true));
    expect(root.querySelector("[data-target-security]")?.textContent).toContain(formatSecurity(42.5));
    const text = root.textContent ?? "";
    expect(text).not.toContain(formatMoney(1, true));
    expect(text).not.toContain(formatSecurity(99.9));
  });
});

describe("TargetPanel — quick actions", () => {
  it("submits the real terminal command through the shared echo-then-execute path", () => {
    const exec = jest.spyOn(Terminal, "executeCommands").mockResolvedValue();
    const server = connectToNoodles();
    server.hasAdminRights = true;
    const root = renderPanel();
    const historyBefore = Terminal.outputHistory.length;
    act(() => {
      getActionButton(root, "hack").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(exec).toHaveBeenCalledWith("hack");
    // The echo (CommandBlockStart) must precede execution so output groups under its own block.
    expect(Terminal.outputHistory.length).toBe(historyBefore + 1);
  });

  it("disables all quick actions while a terminal action is running", () => {
    const server = connectToNoodles();
    server.hasAdminRights = true;
    setFakeAction();
    const root = renderPanel();
    for (const command of ["hack", "weaken", "grow", "backdoor"]) {
      expect(getActionButton(root, command).disabled).toBe(true);
    }
  });

  it("disables all quick actions without admin rights", () => {
    const server = connectToNoodles();
    server.hasAdminRights = false;
    const root = renderPanel();
    for (const command of ["hack", "weaken", "grow", "backdoor"]) {
      expect(getActionButton(root, command).disabled).toBe(true);
    }
  });

  it("disables only backdoor when the backdoor is already installed", () => {
    const server = connectToNoodles();
    server.hasAdminRights = true;
    server.backdoorInstalled = true;
    const root = renderPanel();
    expect(getActionButton(root, "backdoor").disabled).toBe(true);
    expect(getActionButton(root, "hack").disabled).toBe(false);
    expect(getActionButton(root, "weaken").disabled).toBe(false);
    expect(getActionButton(root, "grow").disabled).toBe(false);
  });

  it("disables quick actions on the player's own machines (home)", () => {
    // home: admin rights but purchasedByPlayer — hack/backdoor refuse own machines (hack.ts, backdoor.ts).
    const root = renderPanel(); // setup leaves the player connected to home
    for (const command of ["hack", "weaken", "grow", "backdoor"]) {
      expect(getActionButton(root, command).disabled).toBe(true);
    }
  });
});

describe("TargetPanel — non-Server current server", () => {
  it("renders a hacknet server without crashing, without stats, and without an analyze prompt", () => {
    setupBasicTestingEnvironment({ purchasePServer: false, purchaseHacknetServer: true });
    Player.currentServer = "hacknet-server-0";
    const root = renderPanel();
    expect(root.querySelector("[data-target-hostname]")?.textContent).toBe("hacknet-server-0");
    // Always-known facts still render (RAM exists on every server).
    expect(root.querySelector("[data-target-ram]")).not.toBeNull();
    // No money/security stats exist on a hacknet server, so no snapshot UI and no analyze prompt.
    expect(root.querySelector("[data-target-money]")).toBeNull();
    expect(root.querySelector("[data-target-security]")).toBeNull();
    expect(root.querySelector("[data-target-undiscovered]")).toBeNull();
    // Quick actions add nothing on a non-Server: all disabled.
    for (const command of ["hack", "weaken", "grow", "backdoor"]) {
      expect(getActionButton(root, command).disabled).toBe(true);
    }
  });
});
