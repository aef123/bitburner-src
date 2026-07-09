import React, { useState, useEffect, useRef } from "react";
import { Theme } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import { Paper, Popper, TextField, Typography } from "@mui/material";

import { KEY } from "../../utils/KeyboardEventKey";
import { Terminal } from "../../Terminal";
import { Player } from "@player";
import { extractCurrentText, getTabCompletionPossibilities } from "../getTabCompletionPossibilities";
import { Settings } from "../../Settings/Settings";
import { getTypeScale } from "../../Themes/tokens/typeScale";
import { longestCommonStart } from "../../utils/StringHelperFunctions";
import { exceptionAlert } from "../../utils/helpers/exceptionAlert";
import { CommandBlockStart } from "../OutputTypes";

// Input line + hint row per 2A design notes: bordered mono field, green prompt, honest hints.
const useStyles = makeStyles()((theme: Theme) => {
  const typeScale = getTypeScale();
  return {
  root: {
    flexShrink: 0,
    padding: "0 18px 12px",
  },
  inputWrap: {
    position: "relative",
  },
  // Bordered field per mock: border #2a4152 = borderFocus, radius 10. Mock field bg #0d141c has
  // no token; bgPanel is the nearest.
  input: {
    border: `1px solid ${theme.colors.borderFocus as string}`,
    borderRadius: "10px",
    backgroundColor: theme.colors.bgPanel,
    padding: "11px 14px",
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.value, // mock: 12.5px
    "& input": {
      padding: 0,
    },
  },
  nopadding: {
    padding: theme.spacing(0),
  },
  preformatted: {
    margin: theme.spacing(0),
    fontFamily: Settings.styles.monoFontFamily,
  },
  prompt: {
    margin: theme.spacing(0),
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.value, // mock: 12.5px (must match `input` for baseline alignment)
    color: theme.colors.accentGreen,
  },
  promptDisabled: {
    color: theme.colors.textTertiary,
  },
  // Ghost history-search suggestion overlay. Vertically centered over the single-line input so it
  // tracks the input's baseline; horizontal alignment comes from the monospace prespace fill.
  absolute: {
    margin: theme.spacing(0),
    fontFamily: Settings.styles.monoFontFamily,
    fontSize: typeScale.value, // mock: 12.5px (must match `input` so the ghost overlay tracks it)
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "14px",
    right: "14px",
    display: "flex",
    alignItems: "center",
    opacity: "0.75",
    whiteSpace: "pre",
    overflow: "hidden",
    pointerEvents: "none",
  },
  // Hint row: REAL bindings only (there is no Ctrl+R history search in the game).
  hintRow: {
    display: "flex",
    gap: "16px",
    fontFamily: Settings.styles.fontFamily,
    fontSize: typeScale.caption, // mock: 10px
    fontWeight: 500,
    color: theme.colors.textFaint,
    padding: "6px 4px 0",
    userSelect: "none",
  },
  };
});

// Save command in case we de-load this screen.
let command = "";

interface TerminalInputProps {
  /** Lets the parent hand our setValue to the history panel for Shift+click paste-into-input. */
  registerPaste?: (fn: (command: string) => void) => void;
}

export function TerminalInput({ registerPaste }: TerminalInputProps = {}): React.ReactElement {
  const terminalInput = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState(command);
  const [postUpdateValue, setPostUpdateValue] = useState<{ postUpdate: () => void } | null>();
  const [possibilities, setPossibilities] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchResultsIndex, setSearchResultsIndex] = useState(0);
  const [autofilledValue, setAutofilledValue] = useState(false);
  const { classes, cx } = useStyles();

  // If we have no data in the current terminal history, let's initialize it from the player save
  if (Terminal.commandHistory.length === 0 && Player.terminalCommandHistory.length > 0) {
    Terminal.commandHistory = Player.terminalCommandHistory;
    Terminal.commandHistoryIndex = Terminal.commandHistory.length;
  }

  // Need to run after state updates, for example if we need to move cursor
  // *after* we modify input
  useEffect(() => {
    if (postUpdateValue?.postUpdate) {
      postUpdateValue.postUpdate();
      setPostUpdateValue(null);
    }
  }, [postUpdateValue]);

  // Re-register on every render so the paste handler never closes over stale state.
  useEffect(() => {
    registerPaste?.((pasted: string) => {
      saveValue(pasted, () => {
        const ref = terminalInput.current;
        if (!ref) return;
        ref.focus();
        ref.setSelectionRange(pasted.length, pasted.length);
      });
    });
  });

  function saveValue(newValue: string, postUpdate?: () => void): void {
    /**
     * There are reports of a crash caused by "value" (the React state) being undefined. It means that a caller of this
     * function passes undefined to the first parameter. Currently, we don't know which caller does that, so we put this
     * safety check here to mitigate the crash and gather more debug information.
     */
    if (newValue == null) {
      exceptionAlert(
        new Error(
          `saveValue was called with invalid value.\n` +
            `command: ${command}\nterminalInput.current.value: ${terminalInput.current?.value}\nvalue: ${value}\n` +
            `possibilities: ${possibilities}\nsearchResults: ${searchResults}\nsearchResultsIndex: ${searchResultsIndex}\n` +
            `Terminal.commandHistory: ${Terminal.commandHistory}\nTerminal.commandHistoryIndex: ${Terminal.commandHistoryIndex}`,
        ),
        true,
      );
      return;
    }
    command = newValue;
    setValue(newValue);

    if (postUpdate) {
      setPostUpdateValue({ postUpdate });
    }
  }

  function handleValueChange(event: React.ChangeEvent<HTMLInputElement>): void {
    saveValue(event.target.value);
    setPossibilities([]);
    setSearchResults([]);
    setAutofilledValue(false);
  }

  function resetSearch(isAutofilled = false) {
    setSearchResults([]);
    setAutofilledValue(isAutofilled);
    setSearchResultsIndex(0);
  }

  function getSearchSuggestionPrespace() {
    const currentPrefix = `[${Player.getCurrentServer().hostname} /${Terminal.cwd()}]> `;
    const prefixLength = `${currentPrefix}${value}`.length;
    return Array<string>(prefixLength).fill(" ");
  }

  function modifyInput(mod: Modification): void {
    const ref = terminalInput.current;
    if (!ref) return;
    const inputLength = value.length;
    const start = ref.selectionStart;
    if (start === null) return;
    const inputText = ref.value;

    switch (mod) {
      case "backspace":
        if (start > 0 && start <= inputLength + 1) {
          saveValue(inputText.substr(0, start - 1) + inputText.substr(start));
        }
        break;
      case "deletewordbefore": // Delete rest of word before the cursor
        for (let delStart = start - 1; delStart > -2; --delStart) {
          if ((inputText.charAt(delStart) === KEY.SPACE || delStart === -1) && delStart !== start - 1) {
            saveValue(inputText.substr(0, delStart + 1) + inputText.substr(start), () => {
              // Move cursor to correct location
              // foo bar |baz bum --> foo |baz bum
              const ref = terminalInput.current;
              ref?.setSelectionRange(delStart + 1, delStart + 1);
            });
            return;
          }
        }
        break;
      case "deletewordafter": // Delete rest of word after the cursor, including trailing space
        for (let delStart = start + 1; delStart <= value.length + 1; ++delStart) {
          if (inputText.charAt(delStart) === KEY.SPACE || delStart === value.length + 1) {
            saveValue(inputText.substr(0, start) + inputText.substr(delStart + 1), () => {
              // Move cursor to correct location
              // foo bar |baz bum --> foo bar |bum
              const ref = terminalInput.current;
              ref?.setSelectionRange(start, start);
            });
            return;
          }
        }
        break;
      case "clearafter": // Deletes everything after cursor
        saveValue(inputText.substr(0, start));
        break;
      case "clearbefore": // Deletes everything before cursor
        saveValue(inputText.substr(start), () => moveTextCursor("home"));
        break;
      case "clearall": // Deletes everything in the input
        saveValue("");
        resetSearch();
        break;
    }
  }

  function moveTextCursor(loc: Location): void {
    const ref = terminalInput.current;
    if (!ref) return;
    const inputLength = value.length;
    const start = ref.selectionStart;
    if (start === null) return;

    switch (loc) {
      case "home":
        ref.setSelectionRange(0, 0);
        break;
      case "end":
        ref.setSelectionRange(inputLength, inputLength);
        break;
      case "prevchar":
        if (start > 0) {
          ref.setSelectionRange(start - 1, start - 1);
        }
        break;
      case "prevword":
        for (let i = start - 2; i >= 0; --i) {
          if (ref.value.charAt(i) === KEY.SPACE) {
            ref.setSelectionRange(i + 1, i + 1);
            return;
          }
        }
        ref.setSelectionRange(0, 0);
        break;
      case "nextchar":
        ref.setSelectionRange(start + 1, start + 1);
        break;
      case "nextword":
        for (let i = start + 1; i <= inputLength; ++i) {
          if (ref.value.charAt(i) === KEY.SPACE) {
            ref.setSelectionRange(i, i);
            return;
          }
        }
        ref.setSelectionRange(inputLength, inputLength);
        break;
      default:
        console.warn("Invalid loc argument in Terminal.moveTextCursor()");
        break;
    }
  }

  // Catch all key inputs and redirect them to the terminal.
  useEffect(() => {
    function keyDown(this: Document, event: KeyboardEvent): void {
      if (Terminal.contractOpen || Terminal.nsPromptApiOpen) {
        return;
      }
      if (Terminal.action !== null && event.key === KEY.C && event.ctrlKey) {
        Terminal.action.cancel();
        return;
      }
      const ref = terminalInput.current;
      if (event.ctrlKey || event.metaKey) return;
      if (event.key === KEY.C && (event.ctrlKey || event.metaKey)) return; // trying to copy
      // Don't steal focus from other input elements
      const target = event.target;
      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)) &&
        target !== ref
      ) {
        return;
      }
      if (ref) ref.focus();
    }
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, []);

  async function onKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): Promise<void> {
    const ref = terminalInput.current;

    // Run command or insert newline
    if (event.key === KEY.ENTER) {
      event.preventDefault();
      const command = searchResults.length ? searchResults[searchResultsIndex] : value;
      // Echo as a command-block start so the output renders as a card (Task 8).
      Terminal.append(new CommandBlockStart(command, Player.getCurrentServer().hostname, Terminal.cwd()));
      if (command) {
        void Terminal.executeCommands(command); // Async function, errors will hit the uncaught handler
        saveValue("");
        resetSearch();
      }
      return;
    }

    // Autocomplete
    if (event.key === KEY.TAB) {
      if (event.altKey || event.ctrlKey) {
        return;
      }
      event.preventDefault();
      if (searchResults.length) {
        saveValue(searchResults[searchResultsIndex]);
        resetSearch(true);
        return;
      }
      const possibilities = await getTabCompletionPossibilities(value, Terminal.cwd());
      if (possibilities.length === 0) return;

      setSearchResults([]);
      // Use quote-aware replacement: if mid-quote, replace from the opening quote
      const currentText = extractCurrentText(value);
      const replacePattern = currentText.startsWith('"') ? /"[^"]*$/ : /[^ ]*$/;
      if (possibilities.length === 1) {
        saveValue(value.replace(replacePattern, possibilities[0]) + " ");
        return;
      }
      // More than one possibility, check to see if there is a longer common string than currentText.
      const longestMatch = longestCommonStart(possibilities);
      saveValue(value.replace(replacePattern, longestMatch));
      setPossibilities(possibilities);
    }

    // Clear screen.
    if (event.key === KEY.L && event.ctrlKey) {
      event.preventDefault();
      Terminal.clear();
    }

    // Select previous command.
    if (event.key === KEY.UP_ARROW || (Settings.EnableBashHotkeys && event.key === KEY.P && event.ctrlKey)) {
      if (Settings.EnableBashHotkeys || (Settings.EnableHistorySearch && value)) {
        event.preventDefault();
      }
      const i = Terminal.commandHistoryIndex;
      const len = Terminal.commandHistory.length;

      if (len == 0) {
        return;
      }

      // If there is a partial command in the terminal, hitting "up" will filter the history
      if (value && !autofilledValue && Settings.EnableHistorySearch) {
        if (searchResults.length > 0) {
          setSearchResultsIndex((searchResultsIndex + 1) % searchResults.length);
          return;
        }
        const newResults = [...new Set(Terminal.commandHistory.filter((item) => item?.startsWith(value)).reverse())];

        if (newResults.length) {
          setSearchResults(newResults);
        }
        // Prevent moving through the history when the user has a search term even if there are
        // no search results, to be consistent with zsh-type terminal behavior
        return;
      }

      if (i < 0 || i > len) {
        Terminal.commandHistoryIndex = len;
      }

      if (i != 0) {
        --Terminal.commandHistoryIndex;
      }
      const prevCommand = Terminal.commandHistory[Terminal.commandHistoryIndex];
      saveValue(prevCommand);
      resetSearch(true);
      if (ref) {
        setTimeout(function () {
          ref.selectionStart = ref.selectionEnd = 10000;
        }, 10);
      }
    }

    // Select next command
    if (event.key === KEY.DOWN_ARROW || (Settings.EnableBashHotkeys && event.key === KEY.M && event.ctrlKey)) {
      if (Settings.EnableBashHotkeys) {
        event.preventDefault();
      }
      if (searchResults.length > 0) {
        setSearchResultsIndex(searchResultsIndex === 0 ? searchResults.length - 1 : searchResultsIndex - 1);
        return;
      }

      const i = Terminal.commandHistoryIndex;
      const len = Terminal.commandHistory.length;

      if (len == 0) {
        return;
      }
      if (i < 0 || i > len) {
        Terminal.commandHistoryIndex = len;
      }

      // Latest command, put nothing
      if (i == len || i == len - 1) {
        Terminal.commandHistoryIndex = len;
        saveValue("");
        resetSearch();
      } else {
        ++Terminal.commandHistoryIndex;
        const prevCommand = Terminal.commandHistory[Terminal.commandHistoryIndex];

        saveValue(prevCommand);
        resetSearch(true);
      }
    }

    if (event.key === KEY.ESC && searchResults.length) {
      resetSearch();
    }

    // Extra Bash Emulation Hotkeys, must be enabled through options
    if (Settings.EnableBashHotkeys) {
      if (event.key === KEY.C && event.ctrlKey && ref && ref.selectionStart === ref.selectionEnd) {
        event.preventDefault();
        // Echo the discarded input the same way an executed command is echoed.
        Terminal.append(new CommandBlockStart(value, Player.getCurrentServer().hostname, Terminal.cwd()));
        modifyInput("clearall");
      }

      if (event.key === KEY.A && event.ctrlKey) {
        event.preventDefault();
        moveTextCursor("home");
      }

      if (event.key === KEY.E && event.ctrlKey) {
        event.preventDefault();
        moveTextCursor("end");
      }

      if (event.key === KEY.B && event.ctrlKey) {
        event.preventDefault();
        moveTextCursor("prevchar");
      }

      if (event.key === KEY.B && event.altKey) {
        event.preventDefault();
        moveTextCursor("prevword");
      }

      if (event.key === KEY.F && event.ctrlKey) {
        event.preventDefault();
        moveTextCursor("nextchar");
      }

      if (event.key === KEY.F && event.altKey) {
        event.preventDefault();
        moveTextCursor("nextword");
      }

      if ((event.key === KEY.H || event.key === KEY.D) && event.ctrlKey) {
        modifyInput("backspace");
        event.preventDefault();
      }

      if (event.key === KEY.W && event.ctrlKey) {
        event.preventDefault();
        modifyInput("deletewordbefore");
      }

      if (event.key === KEY.D && event.altKey) {
        event.preventDefault();
        modifyInput("deletewordafter");
      }

      if (event.key === KEY.U && event.ctrlKey) {
        event.preventDefault();
        modifyInput("clearbefore");
      }

      if (event.key === KEY.K && event.ctrlKey) {
        event.preventDefault();
        modifyInput("clearafter");
      }
    }
  }

  return (
    <div className={classes.root}>
      <div className={classes.inputWrap}>
        <TextField
          fullWidth
          color={Terminal.action === null ? "primary" : "secondary"}
          autoFocus
          disabled={Terminal.action !== null}
          autoComplete="off"
          value={value}
          classes={{ root: classes.preformatted }}
          onChange={handleValueChange}
          inputRef={terminalInput}
          InputProps={{
            // for players to hook in
            id: "terminal-input",
            className: classes.input,
            disableUnderline: true,
            startAdornment: (
              <Typography
                classes={{ root: cx(classes.prompt, Terminal.action !== null && classes.promptDisabled) }}
                flexShrink={0}
              >
                [{Player.getCurrentServer().hostname}&nbsp;/{Terminal.cwd()}]&gt;&nbsp;
              </Typography>
            ),
            spellCheck: false,
            onBlur: () => {
              setPossibilities([]);
              resetSearch();
            },
            onKeyDown: (event) => {
              onKeyDown(event).catch((error) => {
                console.error(error);
              });
            },
          }}
        ></TextField>
        <Typography classes={{ root: classes.absolute }} color={"primary"} paragraph={false}>
          {getSearchSuggestionPrespace()}
          {(searchResults[searchResultsIndex] ?? "").substring(value.length)}
        </Typography>
      </div>
      <Popper
        open={possibilities.length > 0}
        anchorEl={terminalInput.current}
        placement={"top"}
        sx={{ maxWidth: "75%" }}
      >
        <Paper sx={{ m: 1, p: 2 }}>
          <Typography classes={{ root: classes.preformatted }} color={"primary"} paragraph={false}>
            Possible autocomplete candidates:
          </Typography>
          <Typography classes={{ root: classes.preformatted }} color={"primary"} paragraph={false}>
            {possibilities.join(" ")}
          </Typography>
        </Paper>
      </Popper>
      <div className={classes.hintRow}>
        <span>↹ complete</span>
        <span>↑↓ history</span>
        <span>Ctrl+K palette</span>
      </div>
    </div>
  );
}

type Modification =
  | "clearall"
  | "home"
  | "end"
  | "prevchar"
  | "prevword"
  | "nextword"
  | "backspace"
  | "deletewordbefore"
  | "deletewordafter"
  | "clearbefore"
  | "clearafter";

type Location = "home" | "end" | "prevchar" | "nextchar" | "prevword" | "nextword";
