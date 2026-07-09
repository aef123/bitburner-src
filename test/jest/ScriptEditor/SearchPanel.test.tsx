/**
 * Render tests for the script-editor full-text search panel (Task 12, 2C part 2).
 *
 * Runs against real (test-environment) servers seeded with files, like the ExplorerPanel tests.
 * Covers: query → grouped results with line previews, the click → open-at-position callback
 * payload, the case-sensitivity toggle, and the explicit capped notice.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../src/Settings/Settings";
import { GetServerOrThrow } from "../../../src/Server/AllServers";
import type { ScriptFilePath } from "../../../src/Paths/ScriptFilePath";
import type { TextFilePath } from "../../../src/Paths/TextFilePath";
import { SearchPanel } from "../../../src/ScriptEditor/ui/SearchPanel";
import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  const home = GetServerOrThrow("home");
  home.writeToScriptFile("batcher.js" as ScriptFilePath, 'const target = "n00dles";\nawait ns.hack(target);\n');
  home.writeToScriptFile("shared/logger.js" as ScriptFilePath, "export function log(ns, msg) {}\n");
  home.writeToTextFile("notes.txt" as TextFilePath, "Target list\n");
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

interface RenderOptions {
  onOpenAt?: (hostname: string, path: string, line: number, column: number) => void;
}

function renderPanel(options: RenderOptions = {}): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <SearchPanel currentHostname="home" focusToken={0} onOpenAt={options.onOpenAt ?? (() => {})} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function typeQuery(root: HTMLElement, value: string): void {
  const input = root.querySelector<HTMLInputElement>("[data-search-input]");
  if (!input) throw new Error("No search input");
  act(() => {
    input.value = value;
    Simulate.change(input);
  });
}

function click(root: HTMLElement, selector: string): void {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`No element for ${selector}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("SearchPanel", () => {
  it("groups results by file with server badge and line previews", () => {
    const root = renderPanel();
    typeQuery(root, "target");
    expect(root.textContent).toContain("batcher.js");
    // Match rows show the line number and the line's text.
    expect(root.textContent).toContain('const target = "n00dles";');
    // Case-insensitive by default: notes.txt's "Target list" matches too.
    expect(root.textContent).toContain("notes.txt");
    // Non-matching files stay out.
    expect(root.textContent).not.toContain("logger.js");
  });

  it("opens the clicked match at its exact position (the callback payload)", () => {
    const onOpenAt = jest.fn();
    const root = renderPanel({ onOpenAt });
    typeQuery(root, "ns.hack");
    click(root, "[data-search-match='home:/batcher.js:2:7']");
    expect(onOpenAt).toHaveBeenCalledWith("home", "batcher.js", 2, 7);
  });

  it("respects the case-sensitivity toggle", () => {
    const root = renderPanel();
    typeQuery(root, "Target");
    expect(root.textContent).toContain("notes.txt");
    expect(root.textContent).toContain("batcher.js"); // insensitive default: "target" matches too
    click(root, "[data-search-case-toggle]");
    expect(root.textContent).toContain("notes.txt");
    expect(root.textContent).not.toContain("batcher.js");
  });

  it("shows an explicit capped notice instead of silently truncating", () => {
    const home = GetServerOrThrow("home");
    home.writeToTextFile("spam.txt" as TextFilePath, Array(600).fill("zqx").join(" ") + "\n");
    const root = renderPanel();
    typeQuery(root, "zqx");
    expect(root.textContent).toContain("capped");
    expect(root.textContent).toContain("500");
  });

  it("shows nothing scary for an empty query", () => {
    const root = renderPanel();
    expect(root.querySelectorAll("[data-search-match]")).toHaveLength(0);
  });
});
