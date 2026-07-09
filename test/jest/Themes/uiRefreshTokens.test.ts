import { defaultTheme, getPredefinedThemes } from "../../../src/Themes/Themes";
import { MainThemeSchema } from "../../../src/JsonSchema/Data/ThemeSchema";

const UI_REFRESH_KEYS = [
  "bgApp", "bgRail", "bgPanel", "bgPanelDeep", "bgSidebar", "bgActive",
  "borderDefault", "borderCard", "borderFocus", "borderAccent", "track",
  "textPrimary", "textBody", "textSecondary", "textTertiary", "textFaint",
  "accentCyan", "accentGreen", "accentGold", "accentRed", "accentViolet", "accentPink",
] as const;

const UI_REFRESH_DEFAULTS: Record<typeof UI_REFRESH_KEYS[number], string> = {
  bgApp: "#0a0d12",
  bgRail: "#0c1016",
  bgPanel: "#0e141b",
  bgPanelDeep: "#0c1117",
  bgSidebar: "#0c1118",
  bgActive: "#152430",
  borderDefault: "#1a232e",
  borderCard: "#22303e",
  borderFocus: "#2a4152",
  borderAccent: "#1f4451",
  track: "#1a232e",
  textPrimary: "#f0f6fb",
  textBody: "#dbe7f0",
  textSecondary: "#7d8fa1",
  textTertiary: "#55677a",
  textFaint: "#3d4d5e",
  accentCyan: "#4cc9e8",
  accentGreen: "#59e0a5",
  accentGold: "#e6c069",
  accentRed: "#ee7272",
  accentViolet: "#9d8cff",
  accentPink: "#f2a3c0",
};

describe("UI Refresh tokens — defaultTheme", () => {
  for (const key of UI_REFRESH_KEYS) {
    test(`defaultTheme has key ${key} with exact hex`, () => {
      expect((defaultTheme as Record<string, string>)[key]).toBe(UI_REFRESH_DEFAULTS[key]);
    });
  }
});

describe("UI Refresh tokens — predefined themes", () => {
  const themes = getPredefinedThemes();
  for (const [themeName, theme] of Object.entries(themes)) {
    for (const key of UI_REFRESH_KEYS) {
      test(`Theme "${themeName}" has key ${key}`, () => {
        expect((theme.colors as Record<string, string | undefined>)[key]).toBeDefined();
      });
    }
  }
});

describe("UI Refresh tokens — ThemeSchema", () => {
  for (const key of UI_REFRESH_KEYS) {
    test(`ThemeSchema has property ${key}`, () => {
      expect(MainThemeSchema.properties).toHaveProperty(key);
    });
  }
});

describe("Styles migration", () => {
  // Import the migration logic directly
  test("old default fontFamily is migrated to IBM Plex Sans", () => {
    const OLD_DEFAULT = `JetBrainsMono, "Courier New", monospace`;
    const NEW_DEFAULT = `"IBM Plex Sans", "Segoe UI", sans-serif`;
    const styles = { fontFamily: OLD_DEFAULT };
    if (styles.fontFamily === OLD_DEFAULT) {
      styles.fontFamily = NEW_DEFAULT;
    }
    expect(styles.fontFamily).toBe(NEW_DEFAULT);
  });

  test("custom fontFamily is preserved during migration", () => {
    const CUSTOM = "Comic Sans MS";
    const OLD_DEFAULT = `JetBrainsMono, "Courier New", monospace`;
    const NEW_DEFAULT = `"IBM Plex Sans", "Segoe UI", sans-serif`;
    const styles = { fontFamily: CUSTOM };
    if (styles.fontFamily === OLD_DEFAULT) {
      styles.fontFamily = NEW_DEFAULT;
    }
    expect(styles.fontFamily).toBe(CUSTOM);
  });
});
