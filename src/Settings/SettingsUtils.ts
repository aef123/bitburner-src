import type { Result } from "@nsdefs";
import { toggleSuppressErrorModals } from "../ErrorHandling/ErrorState";
import {
  assertAndSanitizeEditorTheme,
  assertAndSanitizeKeyBindings,
  assertAndSanitizeMainTheme,
  assertAndSanitizeStyles,
} from "../JsonSchema/JSONSchemaAssertion";
import { mergePlayerDefinedKeyBindings } from "../utils/KeyBindingUtils";
import { assertObject } from "../utils/TypeAssertion";
import { Settings } from "./Settings";
import { OtelLogLevel } from "./SettingEnums";

/**
 * This function won't be able to catch **all** invalid hostnames. In order to validate a hostname properly, we need to
 * import a good validation library or write one by ourselves. Considering that we only need to catch common mistakes,
 * it's not worth the effort.
 *
 * Some invalid hostnames that we don't catch:
 * - Invalid/missing TLD: "abc".
 * - Use space character: "a a.com"
 * - Use non-http schemes in the hostname: "ftp://a.com"
 * - etc.
 */
export function isValidConnectionHostname(hostname: string): Result {
  // Return a user-friendly error message.
  if (hostname === "") {
    return {
      success: false,
      message: "Hostname cannot be empty",
    };
  }
  /**
   * We expect a hostname, but the player may mistakenly put other unexpected things. We will try to catch common mistakes:
   * - Specify a scheme: http or https.
   * - Specify a port.
   * - Specify a pathname or search params.
   */
  try {
    // Check scheme.
    if (hostname.startsWith("http://") || hostname.startsWith("https://")) {
      return {
        success: false,
        message: "Do not specify scheme (e.g., http, https)",
      };
    }
    // Parse to a URL with a default scheme.
    const url = new URL(`http://${hostname}`);
    // Check port, pathname, and search params.
    if (url.port !== "" || url.pathname !== "/" || url.search !== "") {
      return {
        success: false,
        message: "Do not specify port, pathname, or search parameters",
      };
    }
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: `Invalid hostname: ${hostname}`,
    };
  }
  return { success: true };
}

export function isValidConnectionPort(port: number): Result {
  // 0 is a special value for port. It's an invalid port, but the player can use it to disable RFA.
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    return { success: false, message: "Invalid port" };
  }
  return { success: true };
}

/** Validates the base URL of an OTLP/HTTP endpoint. We only need to catch common mistakes. */
export function isValidOtlpEndpoint(endpoint: string): Result {
  if (endpoint === "") {
    return { success: false, message: "Endpoint cannot be empty" };
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { success: false, message: `Invalid URL: ${endpoint}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { success: false, message: "Endpoint must use http or https" };
  }
  return { success: true };
}

export function loadSettings(saveString: string) {
  const save: unknown = JSON.parse(saveString);
  assertObject(save);
  save.overview && Object.assign(Settings.overview, save.overview);
  try {
    // Sanitize theme data. Invalid theme data may crash the game or make it stuck in the loading page.
    assertAndSanitizeMainTheme(save.theme);
    Object.assign(Settings.theme, save.theme);
  } catch (error) {
    console.error(error);
  }
  try {
    // Sanitize editor theme data. Invalid editor theme data may crash the game when the player opens the script editor.
    assertAndSanitizeEditorTheme(save.EditorTheme);
    Object.assign(Settings.EditorTheme, save.EditorTheme);
  } catch (error) {
    console.error(error);
  }
  try {
    // Sanitize styles.
    assertAndSanitizeStyles(save.styles);
    Object.assign(Settings.styles, save.styles);
  } catch (error) {
    console.error(error);
  }
  // Migration: if the user has the old JetBrainsMono-only fontFamily default, update it to
  // the new IBM Plex Sans default for UI text. Custom font selections are preserved.
  if (Settings.styles.fontFamily === `JetBrainsMono, "Courier New", monospace`) {
    Settings.styles.fontFamily = `"IBM Plex Sans", "Segoe UI", sans-serif`;
  }
  // Migration: if monoFontFamily is missing (old save), set it to the default.
  if (!Settings.styles.monoFontFamily) {
    Settings.styles.monoFontFamily = `JetBrainsMono, "Courier New", monospace`;
  }
  /**
   * KeyBindings data does not exist in old save files. Technically, this check is unnecessary. If KeyBindings is
   * undefined, assertAndSanitizeKeyBindings will throw an error, and that error will be caught here. However, it
   * means that there will be an error logged in the console every time the player loads an old save file, and this
   * logged error is kind of a "false positive" one.
   */
  if (save.KeyBindings !== undefined) {
    try {
      // Sanitize key bindings.
      assertAndSanitizeKeyBindings(save.KeyBindings);
      Object.assign(Settings.KeyBindings, save.KeyBindings);
    } catch (error) {
      console.error(error);
    }
  }
  Object.assign(Settings, save, {
    overview: Settings.overview,
    theme: Settings.theme,
    EditorTheme: Settings.EditorTheme,
    styles: Settings.styles,
    KeyBindings: Settings.KeyBindings,
  });
  /**
   * The hostname and port of RFA have not been validated properly, so the save data may contain invalid data. In that
   * case, we set them to the default value.
   */
  if (!isValidConnectionHostname(Settings.RemoteFileApiAddress).success) {
    Settings.RemoteFileApiAddress = "localhost";
  }
  if (!isValidConnectionPort(Settings.RemoteFileApiPort).success) {
    Settings.RemoteFileApiPort = 0;
  }

  // Telemetry settings come from a blind Object.assign of the save, so defensively
  // sanitize them: a tampered/old save must not be able to inject bad values.
  if (!isValidOtlpEndpoint(Settings.TelemetryOtlpEndpoint).success) {
    Settings.TelemetryOtlpEndpoint = "http://localhost:4318";
  }
  if (!Object.values(OtelLogLevel).includes(Settings.TelemetryLogLevel)) {
    Settings.TelemetryLogLevel = OtelLogLevel.INFO;
  }
  if (!Number.isFinite(Settings.TelemetryExportIntervalMs)) {
    Settings.TelemetryExportIntervalMs = 10000;
  }
  Settings.TelemetryExportIntervalMs = Math.min(Math.max(Settings.TelemetryExportIntervalMs, 1000), 600000);
  if (!Number.isFinite(Settings.TelemetryTraceSampleRatio)) {
    Settings.TelemetryTraceSampleRatio = 1;
  }
  Settings.TelemetryTraceSampleRatio = Math.min(Math.max(Settings.TelemetryTraceSampleRatio, 0), 1);
  Settings.TelemetryEnabled = Boolean(Settings.TelemetryEnabled);
  Settings.TelemetrySinkGameConsole = Boolean(Settings.TelemetrySinkGameConsole);
  Settings.TelemetrySinkStdio = Boolean(Settings.TelemetrySinkStdio);
  Settings.TelemetrySinkOtlp = Boolean(Settings.TelemetrySinkOtlp);
  Settings.TelemetryMetricsEnabled = Boolean(Settings.TelemetryMetricsEnabled);
  Settings.TelemetryTracesEnabled = Boolean(Settings.TelemetryTracesEnabled);

  // PinnedTerminalCommands comes from a blind Object.assign of the save; a tampered/old save must
  // not be able to inject a non-string-array value.
  if (
    !Array.isArray(Settings.PinnedTerminalCommands) ||
    !Settings.PinnedTerminalCommands.every((command) => typeof command === "string")
  ) {
    Settings.PinnedTerminalCommands = [];
  }

  // Merge Settings.KeyBindings with DefaultKeyBindings.
  mergePlayerDefinedKeyBindings(Settings.KeyBindings);

  // Set up initial state for error modal suppression
  toggleSuppressErrorModals(Settings.SuppressErrorModals, true);

  // Disable this feature for existing save files.
  if (save.MonacoAutoSaveOnFocusChange === undefined) {
    Settings.MonacoAutoSaveOnFocusChange = false;
  }
}
