import type { CursorBlinking, CursorStyle, Minimap, StickyScroll, WordWrapOptions } from "../ScriptEditor/ui/Options";
import { defaultMonacoTheme } from "../ScriptEditor/ui/themes";
import { defaultStyles } from "../Themes/Styles";
import { defaultTheme } from "../Themes/Themes";
import type { PlayerDefinedKeyBindingsType } from "../utils/KeyBindingUtils";
import { OtelLogLevel, OwnedAugmentationsOrderSetting, PurchaseAugmentationsOrderSetting } from "./SettingEnums";

/** The current options the player has customized to their play style. */
export const Settings = {
  /** How many servers per page */
  ActiveScriptsServerPageSize: 10,
  /** How many scripts per page */
  ActiveScriptsScriptPageSize: 10,
  /** Script + args to launch on game load */
  AutoexecScript: "",
  /** How often the game should autosave the player's progress, in seconds. */
  AutosaveInterval: 60,
  /** Whether to use the classic world/city maps (ASCII art or button lists) instead of the redesigned SVG maps. */
  ClassicMaps: false,
  /** Whether to render city as list of buttons. */
  DisableASCIIArt: false,
  /** Whether global keyboard shortcuts should be disabled throughout the game. */
  DisableHotkeys: false,
  /** Whether text effects such as corruption should be disabled. */
  DisableTextEffects: false,
  /** Whether overview progress bars should be visible. */
  DisableOverviewProgressBars: false,
  /** Whether the docked HUD panel is collapsed. When true, the panel is hidden and a reopen button appears in the TopBar; there is no floating overview widget. */
  HudCollapsed: false,
  /**
   * Sort mode for the joined-factions list on the Factions screen.
   * "" (the default) applies no sort: the list stays in the game's standard faction order, and the
   * empty string round-trips through saves as "still using the default order".
   * Other values: "closest" (smallest rep delta to the next unowned augmentation), "reputation", "favor".
   */
  FactionsSortMode: "",
  /** Whether the Factions screen filters the joined-factions list to factions with purchasable augmentations. */
  FactionsCanBuyOnly: false,
  /** Whether to enable bash hotkeys */
  EnableBashHotkeys: false,
  /** Whether to enable terminal history search */
  EnableHistorySearch: false,
  /** Whether to show IPvGO in a traditional stone-and-shell-on-wood style, or the cyberpunk style */
  GoTraditionalStyle: false,
  /** Timestamps format string */
  TimestampsFormat: "",
  /** Locale used for display numbers. */
  Locale: "en",
  /** Limit the number of recently killed script entries being tracked. */
  MaxRecentScriptsCapacity: 50,
  /** Limit the number of log entries for each script being executed on each server. */
  MaxLogCapacity: 50,
  /** Limit how many entries can be written to a Netscript Port before entries start to get pushed out. */
  MaxPortCapacity: 50,
  /** Limit the number of entries in the terminal. */
  MaxTerminalCapacity: 500,
  /** Commands pinned to the top of the terminal's history panel. */
  PinnedTerminalCommands: [] as string[],
  /** IP address the Remote File API client will try to connect to. Default localhost . */
  RemoteFileApiAddress: "localhost",
  /** Port the Remote File API client will try to connect to. 0 to disable. */
  RemoteFileApiPort: 0,
  /** Automatically reconnect to the Remote File API client after this delay. Set it 0 to disable. */
  RemoteFileApiReconnectionDelay: 0,
  /** Use wss instead of ws when connecting to RFA clients */
  UseWssForRemoteFileApi: false,
  /** Whether to save the game when the player saves any file. */
  SaveGameOnFileSave: true,
  /** Whether to hide the confirmation dialog for augmentation purchases. */
  SuppressBuyAugmentationConfirmation: false,
  /** Whether to hide the info dialog for script errors. */
  SuppressErrorModals: false,
  /** Whether to hide the dialog showing new faction invites. */
  SuppressFactionInvites: false,
  /** Whether to hide the dialog when the player receives a new message file. */
  SuppressMessages: false,
  /** Whether to hide the confirmation dialog when the player attempts to travel between cities. */
  SuppressTravelConfirmation: false,
  /** Whether to hide the dialog when the player's Bladeburner actions are cancelled. */
  SuppressBladeburnerPopup: false,
  /** Whether to hide dialogs for stock market actions. */
  SuppressTIXPopup: false,
  /** Whether to hide the toast alert when the game is saved. */
  SuppressSavedGameToast: false,
  /** Whether to hide the toast warning when the autosave is disabled. */
  SuppressAutosaveDisabledWarnings: false,
  /** Whether to GiB instead of GB. */
  UseIEC60027_2: false,
  /** Whether to display intermediary time unit when their value is null */
  ShowMiddleNullTimeUnit: false,
  /** Whether the game should skip saving the running scripts to the save file. */
  ExcludeRunningScriptsFromSave: false,
  /**  Whether the game's sidebar is opened. */
  IsSidebarOpened: true,
  /** Tail rendering intervall in ms */
  TailRenderInterval: 1000,
  /** Whether the terminal's command-history side panel is collapsed to its slim rail. Collapsed by default: the terminal ships full-width and the panel is opt-in. */
  TerminalHistoryCollapsed: true,
  /** Whether the terminal's target side panel is collapsed to its slim rail. Collapsed by default: the terminal ships full-width and the panel is opt-in. */
  TerminalTargetCollapsed: true,
  /** Theme colors. */
  theme: { ...defaultTheme },
  /** Interface styles. */
  styles: { ...defaultStyles },
  /** Character overview settings. */
  overview: { x: 0, y: 0, opened: true },
  /**  Script editor theme data. */
  EditorTheme: { ...defaultMonacoTheme },
  /** Order to display the player's owned Augmentations/Source Files. */
  OwnedAugmentationsOrder: OwnedAugmentationsOrderSetting.AcquirementTime,
  /** What order the Augmentations should be displayed in when purchasing from a Faction. */
  PurchaseAugmentationsOrder: PurchaseAugmentationsOrderSetting.Default,
  /** Script editor theme. */
  MonacoTheme: "monokai",
  /** Whether to use spaces instead of tabs for indentation */
  MonacoInsertSpaces: true,
  /** Size of indentation */
  MonacoTabSize: 2,
  /** Whether to auto detect indentation settings per-file based on contents */
  MonacoDetectIndentation: false,
  /** Font Family for script editor. */
  MonacoFontFamily: "JetBrainsMono",
  /** Text size for script editor. */
  MonacoFontSize: 20,
  /** Whether to use font ligatures in the script editor */
  MonacoFontLigatures: false,
  /** Whether to use Vim mod by default in the script editor */
  MonacoDefaultToVim: false,
  /** Word wrap setting for Script Editor. */
  MonacoWordWrap: "off" as WordWrapOptions,
  /** Whether to run Beautify code formatter on save */
  MonacoBeautifyOnSave: false,
  /** Control the cursor style*/
  MonacoCursorStyle: "line" as CursorStyle,
  /** Control the cursor animation style */
  MonacoCursorBlinking: "blink" as CursorBlinking,
  /** Toggle use of Sticky Scroll in the Script Editor */
  MonacoStickyScroll: { enabled: false } as StickyScroll,
  /** Whether to show minimap in the script editor */
  MonacoMinimap: { enabled: true } as Minimap,
  /** Whether to autosave on focus change */
  MonacoAutoSaveOnFocusChange: true,
  /** Whether to hide trailing zeroes on fractional part of decimal */
  hideTrailingDecimalZeros: false,
  /** Whether to hide thousands separators. */
  hideThousandsSeparator: false,
  /** Whether to use engineering notation instead of scientific for exponential form. */
  useEngineeringNotation: false,
  /** Whether to disable suffixes and always use exponential form (scientific or engineering). */
  disableSuffixes: false,
  /** The default amount of digits displayed after the decimal separator. */
  fractionalDigits: 3,
  /** Currency symbol used for displaying money. */
  CurrencySymbol: "$",
  /** Whether to show the currency symbol after the money value. */
  CurrencySymbolAfterValue: false,
  /**
   * Player-defined key bindings. Don't use this property directly. It must be merged with DefaultKeyBindings in
   * src\utils\KeyBindingUtils.ts.
   */
  KeyBindings: {} as PlayerDefinedKeyBindingsType,
  /** Whether to sync Steam achievements */
  SyncSteamAchievements: true,

  // --- OpenTelemetry ---
  /** Master switch for OpenTelemetry telemetry. Off by default; nothing is emitted and the SDK is not loaded when false. */
  TelemetryEnabled: false,
  /** Minimum log severity that will be emitted. */
  TelemetryLogLevel: OtelLogLevel.INFO,
  /** Sink: route log records to the in-game console (ns.print/Terminal). Logs only. */
  TelemetrySinkGameConsole: false,
  /** Sink: route signals to the JS console (stdout/stderr). */
  TelemetrySinkStdio: true,
  /** Sink: export signals to an OTLP/HTTP endpoint. */
  TelemetrySinkOtlp: false,
  /** Base URL of the OTLP/HTTP endpoint. Per-signal paths (/v1/logs, /v1/metrics, /v1/traces) are appended. */
  TelemetryOtlpEndpoint: "http://localhost:4318",
  /** Whether to export periodic game metrics (money, skills, etc.) when telemetry is on. */
  TelemetryMetricsEnabled: true,
  /** Whether to trace the script execution chain (one span per script) when telemetry is on. */
  TelemetryTracesEnabled: true,
  /** Head sampling ratio for traces, 0..1. */
  TelemetryTraceSampleRatio: 1,
  /** Metric/trace export interval in milliseconds. */
  TelemetryExportIntervalMs: 10000,
};
