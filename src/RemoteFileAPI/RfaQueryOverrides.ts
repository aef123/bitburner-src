import { Settings } from "../Settings/Settings";

/**
 * Read `rfaPort` and `rfaAddress` from the page URL query string and apply them to the live
 * Settings object.  Called at the top of newRemoteFileApiConnection so that the Electron CLI
 * flags `--rfa-port=<n>` / `--rfa-address=<host>` (appended as query params by gameWindow.js)
 * can auto-connect the Remote API without the player touching the Options screen.
 *
 * Does NOT persist: only Settings' in-memory values are updated.  The save file is written
 * only if the player manually saves, which is acceptable.
 *
 * Validation rules:
 *   rfaPort  – must parse as an integer in [1, 65535]; anything else is silently ignored.
 *   rfaAddress – must be a non-empty, non-whitespace string; empty/absent is silently ignored.
 */
export function applyRfaQueryOverrides(): void {
  try {
    const params = new URLSearchParams(window.location.search);

    const portStr = params.get("rfaPort");
    if (portStr !== null) {
      const port = parseInt(portStr, 10);
      if (Number.isInteger(port) && port >= 1 && port <= 65535) {
        Settings.RemoteFileApiPort = port;
      }
    }

    const address = params.get("rfaAddress");
    if (address !== null && address.trim() !== "") {
      Settings.RemoteFileApiAddress = address.trim();
    }
  } catch {
    // Defensive: window.location may be unavailable in some environments (e.g. unit tests
    // that do not set up jsdom, or non-browser contexts).  Fail silently.
  }
}
