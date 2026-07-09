/**
 * Render tests for the script-editor explorer panel (Task 11, 2C part 1).
 *
 * Covers: current server's files grouped by folder, click-to-open reusing the Root's open-file
 * callback, active-file highlight, dirty dot for open unsaved files, the honest OTHER SERVERS
 * filter (purchased/backdoored/admin only), and the OUTLINE section driven by the active file's
 * code. Monaco is NullMock'd in jsdom, so open scripts are plain fixtures pushed into the
 * module-level openScripts array.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Settings } from "../../../src/Settings/Settings";
import { GetServerOrThrow } from "../../../src/Server/AllServers";
import type { ScriptFilePath } from "../../../src/Paths/ScriptFilePath";
import type { TextFilePath } from "../../../src/Paths/TextFilePath";
import { openScripts } from "../../../src/ScriptEditor/EditorData";
import type { OpenScript } from "../../../src/ScriptEditor/ui/OpenScript";
import { ExplorerPanel } from "../../../src/ScriptEditor/ui/ExplorerPanel";
import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  openScripts.length = 0;
  const home = GetServerOrThrow("home");
  home.writeToScriptFile("bootstrap.js" as ScriptFilePath, "export async function main(ns) {}");
  home.writeToScriptFile("shared/logger.js" as ScriptFilePath, "export const LogLevel = 1;");
  home.writeToTextFile("notes.txt" as TextFilePath, "remember the milk");
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  openScripts.length = 0;
});

interface RenderOptions {
  path?: string;
  hostname?: string;
  code?: string;
  onOpenFile?: (hostname: string, path: string) => void;
  onReveal?: (line: number) => void;
}

function renderPanel(options: RenderOptions = {}): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <ExplorerPanel
          currentScript={{
            path: options.path ?? "bootstrap.js",
            hostname: options.hostname ?? "home",
            code: options.code ?? "export async function main(ns) {}",
          }}
          onOpenFile={options.onOpenFile ?? (() => {})}
          onReveal={options.onReveal ?? (() => {})}
        />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

function clickRow(root: HTMLElement, selector: string): void {
  const row = root.querySelector(selector);
  if (!row) throw new Error(`No element for ${selector}`);
  act(() => {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("ExplorerPanel — current server files", () => {
  it("shows the FILES header for the active script's server", () => {
    const root = renderPanel();
    expect(root.textContent).toContain("FILES · HOME");
  });

  it("lists scripts and text files grouped by folder", () => {
    const root = renderPanel();
    expect(root.querySelector("[data-explorer-file='home:/bootstrap.js']")).not.toBeNull();
    expect(root.querySelector("[data-explorer-file='home:/notes.txt']")).not.toBeNull();
    // Folder header + file inside it.
    expect(root.querySelector("[data-explorer-folder='shared/']")).not.toBeNull();
    expect(root.querySelector("[data-explorer-file='home:/shared/logger.js']")).not.toBeNull();
  });

  it("opens a file through the provided open-file callback (the Root's existing machinery)", () => {
    const onOpenFile = jest.fn();
    const root = renderPanel({ onOpenFile });
    clickRow(root, "[data-explorer-file='home:/shared/logger.js']");
    expect(onOpenFile).toHaveBeenCalledWith("home", "shared/logger.js");
  });

  it("highlights the active file", () => {
    const root = renderPanel();
    const active = root.querySelector("[data-explorer-file='home:/bootstrap.js']");
    expect(active?.hasAttribute("data-explorer-active")).toBe(true);
    const inactive = root.querySelector("[data-explorer-file='home:/notes.txt']");
    expect(inactive?.hasAttribute("data-explorer-active")).toBe(false);
  });

  it("shows a dirty dot on open files with unsaved changes", () => {
    openScripts.push({
      path: "shared/logger.js",
      hostname: "home",
      code: "export const LogLevel = 999; // edited, unsaved",
    } as unknown as OpenScript);
    const root = renderPanel();
    const dirty = root.querySelector("[data-explorer-file='home:/shared/logger.js'] [data-dirty-dot]");
    expect(dirty).not.toBeNull();
    // The saved-and-open current script gets no dot.
    openScripts.push({
      path: "bootstrap.js",
      hostname: "home",
      code: "export async function main(ns) {}",
    } as unknown as OpenScript);
    const root2 = renderPanel();
    expect(root2.querySelector("[data-explorer-file='home:/bootstrap.js'] [data-dirty-dot]")).toBeNull();
  });
});

describe("ExplorerPanel — OTHER SERVERS (honest filter)", () => {
  it("hides servers without file access even when they have files", () => {
    const noodles = GetServerOrThrow("n00dles");
    noodles.hasAdminRights = false;
    noodles.writeToScriptFile("early-hack.js" as ScriptFilePath, "// hack");
    const root = renderPanel();
    expect(root.querySelector("[data-explorer-server='n00dles']")).toBeNull();
  });

  it("lists rooted servers with their file counts, collapsed by default", () => {
    const noodles = GetServerOrThrow("n00dles");
    noodles.hasAdminRights = true;
    noodles.writeToScriptFile("early-hack.js" as ScriptFilePath, "// hack");
    noodles.writeToTextFile("loot.txt" as TextFilePath, "loot");
    const root = renderPanel();
    const row = root.querySelector("[data-explorer-server='n00dles']");
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("2 files");
    // Collapsed: no files from n00dles rendered yet.
    expect(root.querySelector("[data-explorer-file='n00dles:/early-hack.js']")).toBeNull();
  });

  it("expands a server on click and opens its files through the same callback", () => {
    const noodles = GetServerOrThrow("n00dles");
    noodles.hasAdminRights = true;
    noodles.writeToScriptFile("early-hack.js" as ScriptFilePath, "// hack");
    const onOpenFile = jest.fn();
    const root = renderPanel({ onOpenFile });
    clickRow(root, "[data-explorer-server='n00dles']");
    clickRow(root, "[data-explorer-file='n00dles:/early-hack.js']");
    expect(onOpenFile).toHaveBeenCalledWith("n00dles", "early-hack.js");
  });
});

describe("ExplorerPanel — OUTLINE section", () => {
  it("shows the outline of the active file and reveals the clicked symbol's line", () => {
    const onReveal = jest.fn();
    const code = 'const TARGET = "n00dles";\n\nexport async function main(ns) {}\n';
    const root = renderPanel({ code, onReveal });
    expect(root.textContent).toContain("OUTLINE");
    const symbol = root.querySelector("[data-outline-symbol='main']");
    expect(symbol).not.toBeNull();
    clickRow(root, "[data-outline-symbol='main']");
    expect(onReveal).toHaveBeenCalledWith(3);
    clickRow(root, "[data-outline-symbol='TARGET']");
    expect(onReveal).toHaveBeenCalledWith(1);
  });
});
