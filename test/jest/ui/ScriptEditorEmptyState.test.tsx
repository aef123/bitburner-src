/**
 * W4: Editor shell chrome always visible / empty-state placeholder.
 *
 * Verifies:
 *   1. Rendering the editor page with zero open scripts shows the explorer panel and the
 *      placeholder ("No file open") — not a crash and not a blank screen.
 *   2. Opening a file from the explorer while in the empty state adds a tab (the placeholder
 *      unmounts).
 *
 * Monaco is mocked to an empty module (NullMock.js, per jest.config.js). The <Editor> component
 * is mocked with a stub that provides a minimal editor interface for onMount, avoiding all real
 * Monaco initialization. makeModel is mocked so OpenScript construction succeeds with stub models.
 *
 * The module-level `currentScript` var in ScriptEditorRoot and the `openScripts` array in
 * EditorData persist across renders (they are module singletons). We reset openScripts in
 * beforeEach. currentScript resets to null between test files (module re-init), but persists
 * within a file — each test that opens a file will leave currentScript set, which is why
 * openScripts.length = 0 in afterEach matters (next render will still show placeholder since
 * editorRef.current.setModel won't be called on null model).
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { Player } from "@player";
import { Settings } from "../../../src/Settings/Settings";
import { ScriptEditorRoot } from "../../../src/ScriptEditor/ui/ScriptEditorRoot";
import { openScripts } from "../../../src/ScriptEditor/EditorData";
import { GetServerOrThrow } from "../../../src/Server/AllServers";
import { SpecialServers } from "../../../src/Server/data/SpecialServers";

import { initGameEnvironment, setupBasicTestingEnvironment } from "../Utilities";

// Stub the <Editor> surface so Monaco never runs in jsdom.
// The stub provides a minimal editor interface so onMount in ScriptEditorRoot can run without
// crashing on undefined monaco methods. We use useEffect (like the real Editor) so onMount
// fires after render — matching the real component's lifecycle.
jest.mock("../../../src/ScriptEditor/ui/Editor", () => {
  // jest.mock factory cannot close over top-level imports; require inside.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mockReact = require("react") as typeof import("react");
  const stubEditor = {
    addAction: jest.fn(),
    setModel: jest.fn(),
    setPosition: jest.fn(),
    revealLineInCenter: jest.fn(),
    focus: jest.fn(),
    getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
    getContainerDomNode: jest.fn(() => ({ getElementsByClassName: () => [] })),
    getModel: jest.fn(() => null),
    onDidChangeCursorPosition: jest.fn(() => ({ dispose: () => {} })),
    onDidChangeModel: jest.fn(() => ({ dispose: () => {} })),
    onDidBlurEditorWidget: jest.fn(() => ({ dispose: () => {} })),
  };
  return {
    Editor: ({
      onMount,
      onUnmount,
    }: {
      onMount: (editor: typeof stubEditor) => void;
      onUnmount: () => void;
    }) => {
      mockReact.useEffect(() => {
        onMount(stubEditor);
        return () => onUnmount();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return mockReact.createElement("div", { "data-mock-editor": true });
    },
  };
});

// Stub makeModel so openFileFromExplorer can create OpenScript instances without real monaco.
jest.mock("../../../src/ScriptEditor/ui/utils", () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = jest.requireActual("../../../src/ScriptEditor/ui/utils");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ...actual,
    makeModel: (_hostname: string, _filename: string, _code: string) =>
      ({
        uri: { toString: () => `memory://${_hostname}/${_filename}` },
        isDisposed: () => false,
        dispose: () => {},
        getValue: () => _code,
        setValue: () => {},
        getLanguageId: () => "javascript",
      } as never),
  };
});

const testTheme = createTheme({ colors: Settings.theme });

let container: HTMLDivElement | null = null;

beforeAll(() => {
  initGameEnvironment();
  window.scrollTo = jest.fn();
  // jsdom does not implement scrollIntoView (the active tab scrolls itself into view on mount).
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
  // Clear the openScripts singleton so each test starts with a blank editor.
  openScripts.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    act(() => {
      // container is non-null (checked above); ReactDOM.unmountComponentAtNode accepts Element
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    container = null;
  }
  openScripts.length = 0;
});

function renderEditor(files: Map<string, string> = new Map()): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <ScriptEditorRoot
          files={files as never}
          hostname={Player.currentServer}
          vim={false}
        />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

describe("W4 — editor empty state (no open files)", () => {
  it("renders the explorer panel with the current server's files, no crash", () => {
    // Write a script to home so the explorer has something to show.
    const home = GetServerOrThrow(SpecialServers.Home);
    home.writeToScriptFile("test.js" as never, "export async function main() {}");

    const root = renderEditor();

    // Explorer panel is present.
    expect(root.querySelector("[data-explorer-panel]")).not.toBeNull();

    // The explorer lists the file we wrote.
    expect(root.querySelector('[data-explorer-file="home:/test.js"]')).not.toBeNull();

    // Placeholder is shown ("No file open").
    expect(root.querySelector("[data-no-open-scripts]")).not.toBeNull();
    expect(root.querySelector("[data-no-open-scripts]")?.textContent).toContain("No file open");
  });

  it("shows placeholder text with explorer hint", () => {
    const root = renderEditor();
    const placeholder = root.querySelector("[data-no-open-scripts]");
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain("Select a file in the explorer");
    expect(placeholder?.textContent).toContain("Ctrl+P");
  });

  it("status bar is present with placeholder RAM and cursor segments", () => {
    const root = renderEditor();
    // Status bar is always rendered.
    expect(root.querySelector("[data-status-bar]")).not.toBeNull();
    // RAM segment shows the "—" placeholder.
    expect(root.querySelector("[data-status-ram]")?.textContent).toContain("—");
    // Cursor segment shows "—" when no file open.
    expect(root.querySelector("[data-status-cursor]")?.textContent).toBe("—");
    // Save / Beautify / Run are disabled.
    const saveBtn = root.querySelector("[data-status-save]");
    const beautifyBtn = root.querySelector("[data-status-beautify]");
    const runBtn = root.querySelector("[data-status-run]");
    expect(saveBtn instanceof HTMLButtonElement && saveBtn.disabled).toBe(true);
    expect(beautifyBtn instanceof HTMLButtonElement && beautifyBtn.disabled).toBe(true);
    expect(runBtn instanceof HTMLButtonElement && runBtn.disabled).toBe(true);
  });
});

describe("W4 — opening a file from the explorer in the empty state", () => {
  it("adds a tab and removes the placeholder", () => {
    // Write a file to home so the explorer can open it.
    const home = GetServerOrThrow(SpecialServers.Home);
    home.writeToScriptFile("hello.js" as never, "export async function main() {}");

    const root = renderEditor();

    // Confirm empty state: placeholder visible, mock editor not mounted.
    expect(root.querySelector("[data-no-open-scripts]")).not.toBeNull();
    expect(root.querySelector("[data-mock-editor]")).toBeNull();

    // Click the file row in the explorer to open it.
    const fileRow = root.querySelector('[data-explorer-file="home:/hello.js"]');
    expect(fileRow).not.toBeNull();

    act(() => {
      fileRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // openFileFromExplorer pushed to openScripts and set currentScript → re-render.
    expect(openScripts.length).toBe(1);
    expect(openScripts[0].path).toBe("hello.js");
    expect(openScripts[0].hostname).toBe("home");

    // After re-render: placeholder gone, mock editor surface present.
    expect(root.querySelector("[data-no-open-scripts]")).toBeNull();
    expect(root.querySelector("[data-mock-editor]")).not.toBeNull();
  });
});
