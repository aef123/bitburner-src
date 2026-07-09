/**
 * Render tests for the restyled editor tab (Task 11, 2C part 1): the mock's cyan dirty dot must
 * appear exactly when the file is unsaved, replacing the old "*" marker.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import type { DraggableProvided } from "react-beautiful-dnd";

import { Settings } from "../../../src/Settings/Settings";
import { Tab } from "../../../src/ScriptEditor/ui/Tab";

const testTheme = createTheme({ colors: Settings.theme });

const fakeProvided = {
  innerRef: () => {},
  draggableProps: { style: {} },
  dragHandleProps: {},
} as unknown as DraggableProvided;

let container: HTMLDivElement | null = null;

beforeAll(() => {
  // jsdom does not implement scrollIntoView (the active tab scrolls itself into view on mount).
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
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

function renderTab(isUnsaved: boolean, isActive = false): HTMLDivElement {
  if (!container) throw new Error("No container");
  act(() => {
    ReactDOM.render(
      <ThemeProvider theme={testTheme}>
        <Tab
          provided={fakeProvided}
          tabId="home:/bootstrap.js"
          isActive={isActive}
          isExternal={false}
          isUnsaved={() => isUnsaved}
          onClick={() => {}}
          onClose={() => {}}
          onUpdate={() => {}}
        />
      </ThemeProvider>,
      container,
    );
  });
  return container;
}

describe("Tab dirty dot", () => {
  it("shows the dirty dot when the file has unsaved changes", () => {
    const root = renderTab(true);
    const dot = root.querySelector("[data-dirty-dot]");
    expect(dot).not.toBeNull();
    expect(dot?.textContent).toContain("●");
  });

  it("shows no dirty dot when the file is saved", () => {
    const root = renderTab(false);
    expect(root.querySelector("[data-dirty-dot]")).toBeNull();
  });

  it("still shows the file id and keeps the close/sync controls", () => {
    const root = renderTab(false, true);
    expect(root.textContent).toContain("home:/bootstrap.js");
    // Sync (overwrite-from-server) and close buttons are existing capability — must survive restyle.
    expect(root.querySelectorAll("button").length).toBeGreaterThanOrEqual(3);
  });
});
