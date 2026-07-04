/**
 * Tests for applyRfaQueryOverrides() — reads rfaPort/rfaAddress from the page URL query
 * string and applies them to Settings before the RFA connection is established.
 *
 * window.location is mutated via history.replaceState (jsdom supports this).
 * Each test restores the original Settings values and URL in afterEach.
 */
import { applyRfaQueryOverrides } from "../../../src/RemoteFileAPI/RfaQueryOverrides";
import { Settings } from "../../../src/Settings/Settings";

describe("applyRfaQueryOverrides", () => {
  let originalPort: number;
  let originalAddress: string;

  beforeEach(() => {
    originalPort = Settings.RemoteFileApiPort;
    originalAddress = Settings.RemoteFileApiAddress;
    // Start each test from a clean (no-param) URL.
    history.replaceState({}, "", "/");
  });

  afterEach(() => {
    Settings.RemoteFileApiPort = originalPort;
    Settings.RemoteFileApiAddress = originalAddress;
    history.replaceState({}, "", "/");
  });

  // --- rfaPort ---

  test("valid rfaPort within [1,65535] is applied to Settings.RemoteFileApiPort", () => {
    history.replaceState({}, "", "?rfaPort=12345");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(12345);
  });

  test("rfaPort=1 (boundary low) is accepted", () => {
    history.replaceState({}, "", "?rfaPort=1");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(1);
  });

  test("rfaPort=65535 (boundary high) is accepted", () => {
    history.replaceState({}, "", "?rfaPort=65535");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(65535);
  });

  test("rfaPort=0 is rejected (out of range)", () => {
    Settings.RemoteFileApiPort = 9999;
    history.replaceState({}, "", "?rfaPort=0");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(9999); // unchanged
  });

  test("rfaPort=65536 is rejected (out of range)", () => {
    Settings.RemoteFileApiPort = 9999;
    history.replaceState({}, "", "?rfaPort=65536");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(9999); // unchanged
  });

  test("non-numeric rfaPort is rejected", () => {
    Settings.RemoteFileApiPort = 9999;
    history.replaceState({}, "", "?rfaPort=notaport");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(9999); // unchanged
  });

  test("absent rfaPort leaves Settings.RemoteFileApiPort unchanged", () => {
    Settings.RemoteFileApiPort = 7777;
    history.replaceState({}, "", "/");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(7777);
  });

  // --- rfaAddress ---

  test("valid rfaAddress is applied to Settings.RemoteFileApiAddress", () => {
    history.replaceState({}, "", "?rfaAddress=192.168.1.5");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiAddress).toBe("192.168.1.5");
  });

  test("rfaAddress is trimmed before assignment", () => {
    history.replaceState({}, "", "?rfaAddress=%20myhost%20");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiAddress).toBe("myhost");
  });

  test("empty rfaAddress is rejected (whitespace-only treated as empty)", () => {
    Settings.RemoteFileApiAddress = "localhost";
    history.replaceState({}, "", "?rfaAddress=");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiAddress).toBe("localhost"); // unchanged
  });

  test("absent rfaAddress leaves Settings.RemoteFileApiAddress unchanged", () => {
    Settings.RemoteFileApiAddress = "myhost";
    history.replaceState({}, "", "/");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiAddress).toBe("myhost");
  });

  // --- combined ---

  test("rfaPort and rfaAddress are both applied when both present", () => {
    history.replaceState({}, "", "?rfaPort=8080&rfaAddress=10.0.0.1");
    applyRfaQueryOverrides();
    expect(Settings.RemoteFileApiPort).toBe(8080);
    expect(Settings.RemoteFileApiAddress).toBe("10.0.0.1");
  });
});
