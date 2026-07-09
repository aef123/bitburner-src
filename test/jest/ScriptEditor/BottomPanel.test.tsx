/**
 * Render tests for the script-editor bottom panel (Task 12, 2C part 2).
 *
 * Monaco is NullMock'd, so the Problems tab is exercised through its presentational half
 * (ProblemsList) with fixture rows — the marker listening itself only attaches to a real editor.
 * The Logs tab is exercised against the real module-level workerScripts map with fake workers.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../src/Settings/Settings";
import { workerScripts } from "../../../src/Netscript/WorkerScripts";
import type { WorkerScript } from "../../../src/Netscript/WorkerScript";
import { LogBoxEvents } from "../../../src/ui/React/LogBoxManager";
import type { RunningScript } from "../../../src/Script/RunningScript";
import { BottomPanel, LogsList, ProblemsList, type BottomPanelTab } from "../../../src/ScriptEditor/ui/BottomPanel";
import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  workerScripts.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  workerScripts.clear();
});

function makeFakeWorker(pid: number, server: string, filename: string, args: (string | number)[] = []): WorkerScript {
  return { scriptRef: { pid, filename, args, server } as RunningScript } as WorkerScript;
}

interface RenderOptions {
  tab?: BottomPanelTab;
  onTabChange?: (tab: BottomPanelTab) => void;
  onClose?: () => void;
  onGotoProblem?: (line: number, column: number) => void;
  hostname?: string | null;
}

function renderPanel(options: RenderOptions = {}): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <BottomPanel
          tab={options.tab ?? "problems"}
          onTabChange={options.onTabChange ?? (() => {})}
          onClose={options.onClose ?? (() => {})}
          editor={null}
          currentScript={
            options.hostname === null ? null : { path: "bootstrap.js", hostname: options.hostname ?? "home" }
          }
          onGotoProblem={options.onGotoProblem ?? (() => {})}
        />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function click(root: HTMLElement, selector: string): void {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`No element for ${selector}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("BottomPanel — tab strip", () => {
  it("renders all three tabs and marks the active one", () => {
    const root = renderPanel({ tab: "logs" });
    expect(root.querySelector("[data-bottom-tab='problems']")).not.toBeNull();
    expect(root.querySelector("[data-bottom-tab='nsapi']")).not.toBeNull();
    const logs = root.querySelector("[data-bottom-tab='logs']");
    expect(logs?.getAttribute("data-bottom-tab-active")).toBe("true");
  });

  it("switches tabs through the controlled callback", () => {
    const onTabChange = jest.fn();
    const root = renderPanel({ tab: "problems", onTabChange });
    click(root, "[data-bottom-tab='logs']");
    expect(onTabChange).toHaveBeenCalledWith("logs");
    click(root, "[data-bottom-tab='nsapi']");
    expect(onTabChange).toHaveBeenCalledWith("nsapi");
  });

  it("closes through the close button", () => {
    const onClose = jest.fn();
    const root = renderPanel({ onClose });
    click(root, "[data-bottom-close]");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("BottomPanel — Problems tab", () => {
  it("shows the empty state without an editor (no markers can exist)", () => {
    const root = renderPanel({ tab: "problems" });
    expect(root.textContent).toContain("No problems");
  });

  it("ProblemsList rows call the goto callback with the marker position", () => {
    if (!container) throw new Error("No container");
    const onGoto = jest.fn();
    act(() => {
      ReactDOM.render(
        <ThemeProvider theme={testTheme}>
          <ProblemsList
            problems={[
              { severity: "error", message: "Cannot find name 'nss'.", line: 7, column: 9 },
              { severity: "warning", message: "Unused variable.", line: 12, column: 3 },
            ]}
            onGoto={onGoto}
          />
        </ThemeProvider>,
        container,
      );
    });
    expect(container.textContent).toContain("Cannot find name 'nss'.");
    expect(container.textContent).toContain("Ln 7, Col 9");
    click(container, "[data-problem-row='0']");
    expect(onGoto).toHaveBeenCalledWith(7, 9);
    click(container, "[data-problem-row='1']");
    expect(onGoto).toHaveBeenCalledWith(12, 3);
  });
});

describe("BottomPanel — Logs tab", () => {
  it("lists running scripts on the active file's server only", () => {
    workerScripts.set(7, makeFakeWorker(7, "home", "batcher.js", ["n00dles", 8]));
    workerScripts.set(9, makeFakeWorker(9, "pserv-1", "other.js"));
    const root = renderPanel({ tab: "logs" });
    expect(root.textContent).toContain("batcher.js");
    expect(root.textContent).toContain("n00dles 8");
    expect(root.textContent).not.toContain("other.js");
  });

  it("opens the existing floating log window on click (LogBoxEvents)", () => {
    const worker = makeFakeWorker(7, "home", "batcher.js");
    workerScripts.set(7, worker);
    const seen: RunningScript[] = [];
    const unsubscribe = LogBoxEvents.subscribe((script) => {
      seen.push(script);
    });
    try {
      const root = renderPanel({ tab: "logs" });
      click(root, "[data-log-row='7']");
      expect(seen).toEqual([worker.scriptRef]);
    } finally {
      unsubscribe();
    }
  });

  it("shows an honest empty state when nothing runs on the server", () => {
    const root = renderPanel({ tab: "logs" });
    expect(root.textContent).toContain("No scripts running on home");
  });
});

describe("BottomPanel — NS API tab", () => {
  it("hosts the relocated documentation search and docs link (capability parity with the old popover)", () => {
    const root = renderPanel({ tab: "nsapi" });
    expect(root.querySelector("input[placeholder='Search NS API']")).not.toBeNull();
    expect(root.textContent).toContain("NS API documentation");
  });
});

describe("LogsList (presentational)", () => {
  it("invokes the open callback with the clicked row", () => {
    if (!container) throw new Error("No container");
    const worker = makeFakeWorker(42, "home", "loop.js", ["--fast"]);
    const rows = [{ pid: 42, filename: "loop.js", args: "--fast", worker }];
    const onOpen = jest.fn();
    act(() => {
      ReactDOM.render(
        <ThemeProvider theme={testTheme}>
          <LogsList rows={rows} onOpen={onOpen} />
        </ThemeProvider>,
        container,
      );
    });
    click(container, "[data-log-row='42']");
    expect(onOpen).toHaveBeenCalledWith(rows[0]);
  });
});
