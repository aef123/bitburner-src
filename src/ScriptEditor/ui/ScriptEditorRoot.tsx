import type { ContentFilePath } from "../../Paths/ContentFile";

import React, { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor";

import { Player } from "@player";

import type * as acorn from "acorn";
import * as walk from "acorn-walk";
import { extendAcornWalkForTypeScriptNodes } from "../../ThirdParty/acorn-typescript-walk";
import { extend as extendAcornWalkForJsxNodes } from "acorn-jsx-walk";

import { Editor } from "./Editor";

import { Router } from "../../ui/GameRoot";
import { Page } from "../../ui/Router";
import { dialogBoxCreate } from "../../ui/React/DialogBox";
import { checkInfiniteLoop } from "../../Script/RamCalculations";

import { Settings } from "../../Settings/Settings";
import { iTutorialNextStep, ITutorial, iTutorialSteps } from "../../InteractiveTutorial";
import { debounce } from "lodash";
import { GetServer } from "../../Server/AllServers";

import { PromptEvent } from "../../ui/React/PromptManager";

import { useRerender } from "../../ui/React/hooks";

import { isUnsavedFile, getServerCode, makeModel, saveScript } from "./utils";
import { OpenScript } from "./OpenScript";
import { Tabs } from "./Tabs";
import { ActivityBar, type SidePanelKind } from "./ActivityBar";
import { ExplorerPanel } from "./ExplorerPanel";
import { SearchPanel } from "./SearchPanel";
import { QuickOpen } from "./QuickOpen";
import { BottomPanel, type BottomPanelTab } from "./BottomPanel";
import { StatusBar2C } from "./StatusBar2C";
import { NoOpenScripts } from "./NoOpenScripts";
import { ScriptEditorContextProvider, useScriptEditorContext } from "./ScriptEditorContext";
import { OptionsModal, type OptionsModalProps } from "./OptionsModal";
import { makeTheme } from "./themes";
import { useVimEditor } from "./useVimEditor";
import { Modal } from "../../ui/React/Modal";
import { useBoolean } from "../../ui/React/hooks";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import { useCallback } from "react";
import { type AST, getFileType, getModuleScript, parseAST } from "../../utils/ScriptTransformer";
import { RamCalculationErrorCode } from "../../Script/RamCalculationErrorCodes";
import { hasScriptExtension, isLegacyScript, type ScriptFilePath } from "../../Paths/ScriptFilePath";
import type { BaseServer } from "../../Server/BaseServer";
import {
  convertKeyboardEventToKeyCombination,
  CurrentKeyBindings,
  determineKeyBindingTypes,
  ScriptEditorAction,
} from "../../utils/KeyBindingUtils";
import { createRunningScriptInstance, startWorkerScript } from "../../NetscriptWorker";
import type { PositiveInteger } from "../../types";
import { openScripts } from "../EditorData";

// Extend acorn-walk to support TypeScript nodes.
extendAcornWalkForTypeScriptNodes(walk.base);

// Extend acorn-walk to support JSX nodes.
extendAcornWalkForJsxNodes(walk.base);

type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;

interface IProps {
  // Map of filename -> code
  files: Map<ContentFilePath, string>;
  hostname: string;
  vim: boolean;
}

let currentScript: OpenScript | null = null;

function Root(props: IProps): React.ReactElement {
  const rerender = useRerender();
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);

  // This is the workaround for a bug in monaco-editor: https://github.com/microsoft/monaco-editor/issues/4455
  const removeOutlineOfEditor = useCallback(() => {
    if (!editorRef.current) {
      return;
    }
    const containerDomNode = editorRef.current.getContainerDomNode();
    const elements = containerDomNode.getElementsByClassName("monaco-editor");
    if (elements.length === 0) {
      return;
    }
    const editorElement = elements[0];
    (editorElement as HTMLElement).style.outline = "none";
  }, [editorRef]);

  /**
   * The TypeScript compiler needs time to perform type-checking, so in some edge cases, the editor shows the 2792 error
   * ("Cannot find module") even after we created the required models. For example, let's say "ts.ts" script imports
   * "sum" function from "sum.js". The flow is like this:
   * - The player opens "ts.ts". The editor opens with a model for "ts.ts".
   * - TSC starts performing type-checking. This action is asynchronous.
   * - makeModelsForImports is called to dynamically create models for imported modules. We create a model for "sum.js".
   * After this model is created, it's synced to both language workers (check "onDidCreateModel" code in
   * src\ScriptEditor\ScriptEditor.ts).
   * - Before the model of "sum.js" is synced properly, TSC finishes typechecking. At this point, it cannot find
   * relevant data of "sum.js", so it thinks that "sum.js" is not loaded.
   * - The editor shows an error marker at the import code of "sum.js".
   *
   * The error markers will disappear when the player edits the code (the model is updated when the code is changed), so
   * this is not a big problem. Nonetheless, we will still work around this problem to minimize the chance of showing
   * wrong error markers. In order to do that, we check error markers after a short delay (2 seconds); if there is a
   * false-positive error marker, we will reload the model. Reloading the model will force the type-checking to run
   * again.
   */
  const reloadModelOfCurrentScript = debounce(() => {
    if (!currentScript || !editorRef.current) {
      return;
    }
    const markers = monaco.editor.getModelMarkers({
      resource: currentScript.model.uri,
    });
    let needToReloadModel = false;
    for (const marker of markers) {
      // 2792: "Cannot find module" error
      if (marker.code !== "2792") {
        continue;
      }
      needToReloadModel = true;
      break;
    }
    if (needToReloadModel) {
      const currentModel = editorRef.current.getModel();
      // Save the current cursor position. The position resets when the model is changed.
      const currentPosition = editorRef.current.getPosition();
      // Reload the model.
      currentModel?.setValue(currentModel.getValue());
      // Restore the saved position.
      if (currentPosition) {
        editorRef.current.setPosition(currentPosition);
      }
    }
  }, 2000);

  function makeModelsForImports(ast: AST, server: BaseServer): void {
    if (!currentScript) {
      return;
    }
    // Skipping processing if the current file is not a script or it's a legacy script.
    if (!hasScriptExtension(currentScript.path) || isLegacyScript(currentScript.path)) {
      return;
    }
    // Dynamically load imported scripts.
    walk.simple(
      ast as acorn.Node, // Pretend that ast is an acorn node
      {
        ImportDeclaration: (node: acorn.ImportDeclaration) => {
          if (typeof node.source.value !== "string" || !currentScript) {
            return;
          }
          const importedScript = getModuleScript(
            node.source.value,
            currentScript.path as ScriptFilePath,
            server.scripts,
          );
          /**
           * We use openScripts to store all opened files when the player opens them in the editor. When they edit code,
           * the changed code is in openScripts, regardless of whether they save it. When the player switches from the
           * editor tab to another tab, all models are disposed, so the next time they open the editor, this function
           * will load imported scripts. However, if the player did not save their code, loaded scripts would not
           * contain changed code. Therefore, for each loaded script, we need to check if it is in openScripts. If it
           * is, we use the script content in openScripts.
           */
          let code = importedScript.code;
          for (const openScript of openScripts) {
            if (openScript.hostname !== importedScript.server || openScript.path !== importedScript.filename) {
              continue;
            }
            code = openScript.code;
          }
          makeModel(importedScript.server, importedScript.filename, code);
        },
      },
    );
    // Reload the model to force the type-checking to run again.
    reloadModelOfCurrentScript();
  }

  const { options, saveOptions, ramEntries, showRAMError, updateRAM, startUpdatingRAM, finishUpdatingRAM } =
    useScriptEditorContext();

  // Side panel (activity-bar toggles: Explorer or Search, or neither). Runtime-only UI state.
  const [sidePanel, setSidePanel] = useState<SidePanelKind | null>("explorer");
  // Quick-open overlay (Ctrl+P registered on the editor in onMount).
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  // Bottom panel (Problems / NS API / Logs). Closed by default; opened via the status bar's
  // problems segment or the activity bar's ◈ button.
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>("problems");
  // Each bump of this token refocuses the search panel's query input (Ctrl+Shift+F).
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [ramInfoOpen, { on: openRAMInfo, off: closeRAMInfo }] = useBoolean(false);
  const [optionsOpen, { on: openOptions, off: closeOptions }] = useBoolean(false);

  const toggleSidePanel = (panel: SidePanelKind): void => {
    setSidePanel((previous) => (previous === panel ? null : panel));
  };

  /** Open (or toggle away) the bottom panel on a specific tab. */
  const toggleBottomPanel = (tab: BottomPanelTab): void => {
    if (bottomOpen && bottomTab === tab) {
      setBottomOpen(false);
      return;
    }
    setBottomTab(tab);
    setBottomOpen(true);
  };

  // Moved from the removed Toolbar: options round-trip (saveOptions + delayed editor update to
  // avoid the vim/regular mode switch resetting settings) and custom-theme rebuild.
  const onOptionChange: OptionsModalProps["onOptionChange"] = (option, value) => {
    const newOptions = { ...options, [option]: value };
    saveOptions(newOptions);
    // delaying editor options update to avoid an issue
    // where switching between vim and regular modes causes some settings to be reset
    setTimeout(() => {
      editorRef.current?.updateOptions(newOptions);
    }, 100);
  };

  const onThemeChange = () => {
    monaco.editor.defineTheme("customTheme", makeTheme(Settings.EditorTheme));
  };

  let decorations: monaco.editor.IEditorDecorationsCollection | undefined;

  const beautify = useCallback(async (): Promise<void> => {
    const action = editorRef.current?.getAction("editor.action.formatDocument");
    if (action == null) {
      return;
    }
    return action.run().catch((error) => console.error(error));
  }, []);

  const save = useCallback(async () => {
    if (currentScript === null) {
      console.error("currentScript is null when it shouldn't be. Unable to save script");
      return;
    }

    const preSave = options.beautifyOnSave ? beautify : () => Promise.resolve();

    // this is duplicate code with saving later.
    if (ITutorial.isRunning && ITutorial.currStep === iTutorialSteps.TerminalEditScript) {
      //Make sure filename + code properly follow tutorial
      if (currentScript.path !== "n00dles.js") {
        dialogBoxCreate("Don't change the script name for now.");
        return;
      }
      const cleanCode = currentScript.code.replace(/\s/g, "");
      const expectedCleanCode = `/**@param{NS}ns*/exportasyncfunctionmain(ns){while(true){awaitns.hack("n00dles");}}`;
      if (!cleanCode.includes(expectedCleanCode)) {
        dialogBoxCreate("Please copy and paste the code from the tutorial!");
        return;
      }

      //Save the script
      await preSave();
      saveScript(currentScript);
      Router.toPage(Page.Terminal);

      iTutorialNextStep();

      return;
    }
    await preSave();
    saveScript(currentScript);
    rerender();
  }, [rerender, options.beautifyOnSave, beautify]);

  const run = useCallback(async () => {
    if (currentScript === null) {
      return;
    }
    // Check if "currentScript" is a script. It may be a text file.
    if (!hasScriptExtension(currentScript.path)) {
      dialogBoxCreate(`Cannot run ${currentScript.path}. It is not a script.`);
      return;
    }
    // Check if the current script's server is valid.
    const server = GetServer(currentScript.hostname);
    if (server === null) {
      return;
    }

    // Always save before doing anything else.
    await save();

    const result = createRunningScriptInstance(
      server,
      currentScript.path,
      { threads: 1 as PositiveInteger, temporary: false, preventDuplicates: false },
      [],
    );
    if (!result.success) {
      dialogBoxCreate(result.message);
      return;
    }
    startWorkerScript(result.runningScript, server);
  }, [save]);

  useEffect(() => {
    async function keydown(event: KeyboardEvent) {
      if (Settings.DisableHotkeys) {
        return;
      }
      const keyBindingTypes = determineKeyBindingTypes(CurrentKeyBindings, convertKeyboardEventToKeyCombination(event));
      if (keyBindingTypes.has(ScriptEditorAction.Save)) {
        event.preventDefault();
        event.stopPropagation();
        await save();
      }
      if (keyBindingTypes.has(ScriptEditorAction.GoToTerminal)) {
        event.preventDefault();
        Router.toPage(Page.Terminal);
      }
      if (keyBindingTypes.has(ScriptEditorAction.Run)) {
        event.preventDefault();
        await run();
      }
    }
    const listener = (event: KeyboardEvent) => {
      keydown(event).catch((error) => console.error(error));
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [save, run]);

  function infLoop(ast: AST, code: string): void {
    if (editorRef.current === null || currentScript === null || isLegacyScript(currentScript.path)) {
      return;
    }
    if (!decorations) {
      decorations = editorRef.current.createDecorationsCollection();
    }
    const possibleLines = checkInfiniteLoop(ast, code);
    if (possibleLines.length !== 0) {
      decorations.set(
        possibleLines.map((awaitWarning) => ({
          range: {
            startLineNumber: awaitWarning,
            startColumn: 1,
            endLineNumber: awaitWarning,
            endColumn: 10,
          },
          options: {
            isWholeLine: true,
            glyphMarginClassName: "myGlyphMarginClass",
            glyphMarginHoverMessage: {
              value:
                "Possible infinite loop, await something. If this is a false positive, use `// @ignore-infinite` to suppress.",
            },
          },
        })),
      );
    } else {
      decorations.clear();
    }
  }

  const debouncedCodeParsing = debounce((newCode: string) => {
    let server;
    if (!currentScript || !hasScriptExtension(currentScript.path)) {
      showRAMError();
      return;
    }
    if (!(server = GetServer(currentScript.hostname))) {
      showRAMError({
        errorCode: RamCalculationErrorCode.InvalidServer,
        errorMessage: `Server ${currentScript.hostname} does not exist`,
      });
      return;
    }
    let ast;
    try {
      ast = parseAST(currentScript.path, currentScript.hostname, newCode, getFileType(currentScript.path));
      makeModelsForImports(ast, server);
    } catch (error) {
      showRAMError({
        errorCode: RamCalculationErrorCode.SyntaxError,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    infLoop(ast, newCode);
    updateRAM(ast, currentScript.path, server);
    finishUpdatingRAM();
  }, 300);

  const parseCode = (newCode: string) => {
    startUpdatingRAM();
    debouncedCodeParsing(newCode);
  };

  // When the editor is mounted
  function onMount(editor: IStandaloneCodeEditor): void {
    // Required when switching between site navigation (e.g. from Script Editor -> Terminal and back)
    // the `useEffect()` for vim mode is called before editor is mounted.
    editorRef.current = editor;

    /**
     * Editor-scoped keybindings (Task 12). addAction (rather than addCommand) because it returns
     * an IDisposable and shows up in the editor's F1 command palette; both register with the
     * standalone editor's own keybinding service, which listens on the editor's DOM node — so
     * these bindings only fire while the editor has focus, and they die with editor.dispose() on
     * unmount (Editor.tsx cleanup). They cannot leak to the terminal, the shell's Ctrl+K palette,
     * or any other page. The handlers use only stable React state setters since onMount runs once
     * per editor instance.
     *
     * Vim-mode note: monaco-vim maps <C-p> to `k` (keymap_vim: keyToKey, all contexts) and
     * consumes the keydown before monaco's keybinding service sees it — so in vim mode Ctrl+P
     * stays a vim motion and quick-open simply doesn't trigger. That is the documented-acceptable
     * outcome; vim users have :e-style flows and the mouse.
     */
    editor.addAction({
      id: "bitburner.quick-open",
      label: "Quick Open File (all accessible servers)",
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      keybindings: [(monaco.KeyMod?.CtrlCmd ?? 0) | (monaco.KeyCode?.KeyP ?? 0)],
      run: () => setQuickOpenOpen(true),
    });
    editor.addAction({
      id: "bitburner.search-all-servers",
      label: "Search All Servers",
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      keybindings: [(monaco.KeyMod?.CtrlCmd ?? 0) | (monaco.KeyMod?.Shift ?? 0) | (monaco.KeyCode?.KeyF ?? 0)],
      run: () => {
        setSidePanel("search");
        setSearchFocusToken((token) => token + 1);
      },
    });

    // Open current script. This happens when the player switch tabs and open the editor tab.
    if (props.files.size === 0 && currentScript !== null) {
      currentScript.regenerateModel();
      editorRef.current.setModel(currentScript.model);
      editorRef.current.setPosition(currentScript.lastPosition);
      editorRef.current.revealLineInCenter(currentScript.lastPosition.lineNumber);
      parseCode(currentScript.code);
      editorRef.current.focus();
      return;
    }

    // This happens when the player opens scripts by using nano/vim.
    for (const [filename, code] of props.files) {
      // Check if file is already opened
      const openScript = openScripts.find((script) => script.path === filename && script.hostname === props.hostname);
      if (openScript) {
        // Script is already opened
        if (openScript.model === undefined || openScript.model === null || openScript.model.isDisposed()) {
          openScript.regenerateModel();
        }

        currentScript = openScript;
        editorRef.current.setModel(openScript.model);
        editorRef.current.setPosition(openScript.lastPosition);
        editorRef.current.revealLineInCenter(openScript.lastPosition.lineNumber);
        parseCode(openScript.code);
      } else {
        // Open script
        const newScript = new OpenScript(
          filename,
          code,
          props.hostname,
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          monaco.Position ? new monaco.Position(0, 0) : ({ lineNumber: 0, column: 0 } as monaco.Position),
          makeModel(props.hostname, filename, code),
          props.vim,
        );
        openScripts.push(newScript);
        currentScript = newScript;
        editorRef.current.setModel(newScript.model);
        parseCode(newScript.code);
      }
    }

    editorRef.current.focus();
  }

  // When the code is updated within the editor
  function updateCode(newCode?: string): void {
    if (newCode === undefined) return;
    // parseCode includes ram check and infinite loop detection
    parseCode(newCode);
    if (editorRef.current === null) return;
    const newPos = editorRef.current.getPosition();
    if (newPos === null) return;
    if (currentScript !== null) {
      currentScript.code = newCode;
      currentScript.lastPosition = newPos;
    }
  }

  function currentTabIndex(): number | undefined {
    if (currentScript) return openScripts.findIndex((openScript) => currentScript === openScript);
    return undefined;
  }

  function onTabClick(index: number): void {
    if (currentScript !== null) {
      // Save the current position of the cursor.
      const currentPosition = editorRef.current?.getPosition();
      if (currentPosition) {
        currentScript.lastPosition = currentPosition;
      }
      // Save currentScript to openScripts
      const curIndex = currentTabIndex();
      if (curIndex !== undefined) {
        openScripts[curIndex] = currentScript;
      }
    }

    currentScript = openScripts[index];

    if (editorRef.current !== null && openScripts[index] !== null) {
      if (!currentScript.model || currentScript.model.isDisposed()) {
        currentScript.regenerateModel();
      }
      editorRef.current.setModel(currentScript.model);
      editorRef.current.setPosition(currentScript.lastPosition);
      editorRef.current.revealLineInCenter(currentScript.lastPosition.lineNumber);
      parseCode(currentScript.code);
      editorRef.current.focus();
    }
    removeOutlineOfEditor();
  }

  function onTabClose(index: number): void {
    // See if the script on the server is up to date
    const closingScript = openScripts[index];
    const savedScriptCode = closingScript.code;
    const wasCurrentScript = openScripts[index] === currentScript;

    if (isUnsavedFile(openScripts, index)) {
      PromptEvent.emit({
        txt: `Do you want to save changes to ${closingScript.path} on ${closingScript.hostname}?`,
        resolve: (result: boolean | string) => {
          if (result) {
            // Save changes
            closingScript.code = savedScriptCode;
            saveScript(closingScript);
          }
        },
      });
    }
    //unmounting the editor will dispose all, doesnt hurt to dispose on close aswell
    closingScript.model.dispose();
    openScripts.splice(index, 1);
    if (openScripts.length === 0) {
      currentScript = null;
      rerender();
      return;
    }

    // Change current script if we closed it
    if (wasCurrentScript) {
      //Keep the same index unless we were on the last script
      const indexOffset = openScripts.length === index ? -1 : 0;
      currentScript = openScripts[index + indexOffset];
      if (editorRef.current !== null) {
        if (!currentScript.model || currentScript.model.isDisposed()) {
          currentScript.regenerateModel();
        }
        editorRef.current.setModel(currentScript.model);
        editorRef.current.setPosition(currentScript.lastPosition);
        editorRef.current.revealLineInCenter(currentScript.lastPosition.lineNumber);
        parseCode(currentScript.code);
        editorRef.current.focus();
      }
    }
    rerender();
    removeOutlineOfEditor();
  }

  function onTabUpdate(index: number): void {
    const openScript = openScripts[index];
    const serverScriptCode = getServerCode(openScripts, index);
    if (serverScriptCode === null) return;

    if (openScript.code !== serverScriptCode) {
      PromptEvent.emit({
        txt:
          "Do you want to overwrite the current editor content with the contents of " +
          openScript.path +
          " on the server? This cannot be undone.",
        resolve: (result: boolean | string) => {
          if (result) {
            // Save changes
            openScript.code = serverScriptCode;

            // Switch to target tab
            onTabClick(index);

            if (editorRef.current !== null && openScript !== null) {
              if (openScript.model === undefined || openScript.model.isDisposed()) {
                openScript.regenerateModel();
              }
              editorRef.current.setModel(openScript.model);

              editorRef.current.setValue(openScript.code);
              parseCode(openScript.code);
              editorRef.current.focus();
            }
          }
        },
      });
    }
  }

  function onOpenNextTab(step: number): void {
    // Go to the next tab (to the right). Wraps around when at the rightmost tab
    const currIndex = currentTabIndex();
    if (currIndex !== undefined) {
      const nextIndex = (currIndex + step) % openScripts.length;
      onTabClick(nextIndex);
    }
  }

  function onOpenPreviousTab(step: number): void {
    // Go to the previous tab (to the left). Wraps around when at the leftmost tab
    const currIndex = currentTabIndex();
    if (currIndex !== undefined) {
      let nextIndex = currIndex - step;
      while (nextIndex < 0) {
        nextIndex += openScripts.length;
      }
      onTabClick(nextIndex);
    }
  }

  /**
   * Open a file from the explorer panel. This is the SAME machinery onMount uses for nano/vim
   * openings (reuse existing OpenScript via the tab path, else create OpenScript + makeModel) —
   * deliberately not a second open path.
   */
  function openFileFromExplorer(hostname: string, path: string): void {
    const server = GetServer(hostname);
    if (server === null) {
      return;
    }
    const filePath = path as ContentFilePath; // paths come straight from server.scripts/textFiles keys
    const existingIndex = openScripts.findIndex((script) => script.path === filePath && script.hostname === hostname);
    if (existingIndex !== -1) {
      // Already open: the tab-click path handles cursor bookkeeping, model swap, and parseCode.
      onTabClick(existingIndex);
      rerender();
      return;
    }
    const content = server.getContentFile(filePath)?.content;
    if (content === undefined) {
      return;
    }
    // Save the cursor of the file we're leaving (same bookkeeping as onTabClick).
    if (currentScript !== null) {
      const currentPosition = editorRef.current?.getPosition();
      if (currentPosition) {
        currentScript.lastPosition = currentPosition;
      }
    }
    const newScript = new OpenScript(
      filePath,
      content,
      hostname,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      monaco.Position ? new monaco.Position(0, 0) : ({ lineNumber: 0, column: 0 } as monaco.Position),
      makeModel(hostname, filePath, content),
      currentScript !== null ? currentScript.vimMode : props.vim,
    );
    openScripts.push(newScript);
    currentScript = newScript;
    if (editorRef.current !== null) {
      editorRef.current.setModel(newScript.model);
      parseCode(newScript.code);
      editorRef.current.focus();
    }
    rerender();
    removeOutlineOfEditor();
  }

  /** Reveal a position in the active editor (outline clicks, problems rows, search matches). */
  function revealPosition(line: number, column: number): void {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column });
    editor.focus();
  }

  /** Open a file (same machinery as the explorer) and jump to a position — search-match clicks. */
  function openFileAt(hostname: string, path: string, line: number, column: number): void {
    openFileFromExplorer(hostname, path);
    // openFileFromExplorer bails silently when the server/file vanished; only reveal on success.
    if (currentScript !== null && currentScript.hostname === hostname && currentScript.path === path) {
      revealPosition(line, column);
    }
  }

  function onUnmountEditor() {
    // Save the current cursor position before disposing — only meaningful when there is
    // an active script and the editor still holds a valid position.
    if (currentScript) {
      const currentPosition = editorRef.current?.getPosition();
      if (currentPosition) {
        currentScript.lastPosition = currentPosition;
      }
    }
    // Always null the ref: the Monaco instance is disposed after this callback returns.
    // Downstream callers (openFileFromExplorer, revealPosition) guard on
    // editorRef.current !== null; without this they would call setModel/focus on the
    // disposed instance. The remount-recovery branch in onMount re-populates the ref
    // when the Editor remounts. This must come AFTER the position save above.
    editorRef.current = null;
  }

  const { statusBarRef } = useVimEditor({
    editor: editorRef.current,
    vim: currentScript !== null ? currentScript.vimMode : props.vim,
    onSave: save,
    onOpenNextTab,
    onOpenPreviousTab,
  });

  useEffect(() => {
    if (currentScript !== null) {
      const tabIndex = currentTabIndex();
      if (typeof tabIndex === "number") onTabClick(tabIndex);
      parseCode(currentScript.code);
    }
    // disable eslint because we want to run this only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Layout per design-notes-2C: tab strip (46px spacer over the activity bar, then tabs),
          main row = activity bar | explorer-or-search | editor column, bottom panel, status bar.
          Sized by the shell pane via height:100% — no 100vh (global constraint).
          W4: the chrome (activity bar / explorer / status bar) is ALWAYS rendered regardless of
          whether a file is open. The Editor surface is only mounted when currentScript !== null;
          when no file is open <NoOpenScripts> is shown in its place. This avoids mounting Monaco
          with no model (which historically caused issues) while keeping the shell chrome visible.
          position:relative hosts the quick-open overlay; the bottom panel squeezing the editor is
          handled by monaco's automaticLayout (same height mechanism Task 11 established). */}
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch" }}>
          {/* Spacer above the activity bar per the 2C mock, sharing the tab strip's chrome. */}
          <div
            style={{
              width: 46,
              flex: "none",
              boxSizing: "border-box",
              backgroundColor: Settings.theme.bgRail,
              borderBottom: `1px solid ${Settings.theme.borderDefault}`,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Tabs
              scripts={openScripts}
              currentScript={currentScript}
              onTabClick={onTabClick}
              onTabClose={onTabClose}
              onTabUpdate={onTabUpdate}
            />
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
          <ActivityBar
            activePanel={sidePanel}
            onSelectPanel={toggleSidePanel}
            nsApiOpen={bottomOpen && bottomTab === "nsapi"}
            onToggleNsApi={() => toggleBottomPanel("nsapi")}
            onOpenOptions={openOptions}
          />
          {sidePanel === "explorer" && (
            <ExplorerPanel
              currentScript={currentScript}
              onOpenFile={openFileFromExplorer}
              onReveal={(line) => revealPosition(line, 1)}
            />
          )}
          {sidePanel === "search" && (
            <SearchPanel
              currentHostname={currentScript?.hostname ?? Player.getCurrentServer().hostname}
              focusToken={searchFocusToken}
              onOpenAt={openFileAt}
            />
          )}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {/* W4: mount Monaco only when a file is open; show a quiet placeholder otherwise.
                Ctrl+P (quick-open) is registered as an editor addAction — it won't fire when
                Monaco is not mounted (no editor has focus), which is acceptable: the hint line
                in the placeholder names it for when files are open. */}
            {currentScript !== null ? (
              <Editor onMount={onMount} onChange={updateCode} onUnmount={onUnmountEditor} />
            ) : (
              <NoOpenScripts />
            )}
          </div>
        </div>

        {bottomOpen && (
          <BottomPanel
            tab={bottomTab}
            onTabChange={setBottomTab}
            onClose={() => setBottomOpen(false)}
            editor={editorRef.current}
            currentScript={currentScript}
            onGotoProblem={revealPosition}
          />
        )}

        <StatusBar2C
          currentScript={currentScript}
          editor={editorRef.current}
          vimStatus={statusBarRef.current}
          onRun={() => {
            run().catch((error) => console.error(error));
          }}
          onSave={() => {
            save().catch((error) => console.error(error));
          }}
          onBeautify={() => {
            beautify().catch((error) => console.error(error));
          }}
          onOpenRAMModal={openRAMInfo}
          onProblemsClick={() => toggleBottomPanel("problems")}
        />

        {/* Quick-open overlay (Ctrl+P inside the editor). Opening it steals focus from the
            editor, which triggers the existing autosave-on-blur (Editor.tsx onDidBlurEditorWidget
            when MonacoAutoSaveOnFocusChange) — the same thing every toolbar/status-bar click has
            always done; saveScript is idempotent, so this is harmless. Closing refocuses the
            editor per the design notes. */}
        <QuickOpen
          open={quickOpenOpen}
          currentHostname={currentScript?.hostname ?? Player.getCurrentServer().hostname}
          onOpenFile={openFileFromExplorer}
          onClose={() => {
            setQuickOpenOpen(false);
            editorRef.current?.focus();
          }}
        />
      </div>

      {/* Editor options round-trip (was the Toolbar's Options button; now the activity bar ⚙). */}
      <OptionsModal
        open={optionsOpen}
        options={options}
        onClose={closeOptions}
        onOptionChange={onOptionChange}
        onThemeChange={onThemeChange}
      />
      {/* Static RAM breakdown (was the Toolbar's RAM button; now the status-bar RAM segment). */}
      <Modal open={ramInfoOpen} onClose={closeRAMInfo}>
        <Tooltip
          title={
            "Static RAM costs of individual functions used by this script. " +
            "Calling `ns.ramOverride()` with a constant number as the first statement in " +
            "your script will override the value here, as well."
          }
        >
          <Table>
            <TableBody>
              {ramEntries.map(([n, r]) => (
                <React.Fragment key={n + r}>
                  <TableRow>
                    <TableCell sx={{ color: Settings.theme.primary }}>{n}</TableCell>
                    <TableCell align="right" sx={{ color: Settings.theme.primary }}>
                      {r}
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </Tooltip>
      </Modal>
    </>
  );
}

// Called every time script editor is opened
export function ScriptEditorRoot(props: IProps) {
  return (
    <ScriptEditorContextProvider>
      <Root {...props} />
    </ScriptEditorContextProvider>
  );
}
