/**
 * W4 stale-ref guard: editorRef nulled on last-tab close.
 *
 * Separate file from ScriptEditorEmptyState.test.tsx so that the module-level `currentScript`
 * singleton in ScriptEditorRoot starts at null (fresh module init) and is not contaminated by
 * other tests that open files. This isolation is load-bearing: tests that open files leave
 * currentScript non-null, and a subsequent test starting with a non-null currentScript + empty
 * openScripts triggers onTabClick(-1) which causes a crash in a state-update re-render.
 *
 * What this test verifies (Fix 1 from wave-2 final review):
 *   W4 made the Editor conditionally mounted. Closing the last tab sets currentScript=null,
 *   unmounts the Editor child, and fires onUnmountEditor. Without the fix, onUnmountEditor did
 *   NOT null editorRef.current, so a subsequent openFileFromExplorer call would check
 *   (editorRef.current !== null) → true and call setModel/focus on the now-disposed Monaco
 *   instance. The fix: null editorRef.current unconditionally at the top of onUnmountEditor
 *   (before the early-return guard that skips position saving when currentScript is null).
 *
 * Test strategy:
 *   1. Open alpha.js (Editor mounts, editorRef populated).
 *   2. Close the only tab via the close button (onTabClose → openScripts empty →
 *      currentScript=null → rerender → Editor unmounts → onUnmountEditor → editorRef=null).
 *   3. Open beta.js from the explorer (Editor still unmounted at this point).
 *   4. Assert setModel was called exactly once more than before close (only from onMount's
 *      remount-recovery, NOT from openFileFromExplorer). Without the fix: two extra calls.
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
// stubEditorInstance is exported alongside Editor so this test can inspect setModel call counts.
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
    stubEditorInstance: stubEditor,
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

// Stub makeModel so OpenScript construction succeeds without real Monaco.
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
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  setupBasicTestingEnvironment();
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

function renderEditor(): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <ScriptEditorRoot files={new Map() as never} hostname={Player.currentServer} vim={false} />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

describe("W4 — editorRef nulled on last-tab close (stale-ref guard)", () => {
  it("does not call setModel on the disposed stub after closing the last tab then opening from explorer", () => {
    // Access the stub editor exported alongside the mock so we can inspect setModel call counts.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion
    const { stubEditorInstance } = jest.requireMock("../../../src/ScriptEditor/ui/Editor") as {
      stubEditorInstance: { setModel: jest.Mock };
    };

    const home = GetServerOrThrow(SpecialServers.Home);
    home.writeToScriptFile("alpha.js" as never, "export async function main() {}");
    home.writeToScriptFile("beta.js" as never, "export async function main() {}");

    // Phase 1: open alpha.js so the Editor mounts and editorRef.current is populated.
    // currentScript starts null (fresh module), so no stale-currentScript issue on render.
    const root = renderEditor();
    const alphaRow = root.querySelector('[data-explorer-file="home:/alpha.js"]');
    expect(alphaRow).not.toBeNull();
    act(() => {
      alphaRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(openScripts.length).toBe(1);
    expect(root.querySelector("[data-mock-editor]")).not.toBeNull();

    // Snapshot setModel call count. Extra calls on the stub after the tab closes are the bug.
    const setModelCallsAfterOpen = stubEditorInstance.setModel.mock.calls.length;

    // Phase 2: close the only open tab via the close-icon button.
    // DOM button order in the tab strip:
    //   0 = Tabs search-toggle button
    //   1 = Tab title/click button
    //   2 = Tab sync (update) button
    //   3 = Tab close button  ← the one we want
    // ActivityBar and StatusBar buttons follow after.
    //
    // onTabClose path: splice → openScripts empty → currentScript=null → rerender() →
    // Editor child unmounts (guarded by currentScript !== null in JSX) →
    // useEffect cleanup → onUnmount() → onUnmountEditor() → editorRef.current = null (the fix).
    const allButtons = Array.from(root.querySelectorAll("button"));
    const closeBtn = allButtons[3];
    expect(closeBtn).toBeDefined();
    act(() => {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // After close: openScripts empty, Editor unmounted, placeholder shown.
    expect(openScripts.length).toBe(0);
    expect(root.querySelector("[data-no-open-scripts]")).not.toBeNull();
    expect(root.querySelector("[data-mock-editor]")).toBeNull();

    // Phase 3: open beta.js while the Editor is unmounted (editorRef.current === null).
    // The guard in openFileFromExplorer (editorRef.current !== null) must prevent calling
    // setModel on the now-disposed stub instance.
    const betaRow = root.querySelector('[data-explorer-file="home:/beta.js"]');
    expect(betaRow).not.toBeNull();
    act(() => {
      betaRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // setModel count must increase by exactly 1 (onMount's remount-recovery for beta),
    // NOT by 2 (which would mean openFileFromExplorer also called it on the disposed editor).
    // Without the fix: count = setModelCallsAfterOpen + 2. With fix: + 1.
    expect(stubEditorInstance.setModel.mock.calls.length).toBe(setModelCallsAfterOpen + 1);

    // beta.js is tracked in openScripts and will display when the Editor remounts.
    expect(openScripts.length).toBe(1);
    expect(openScripts[0].path).toBe("beta.js");
  });
});
