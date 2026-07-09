import type { ITheme } from "../Themes";

type UIRefreshKeys =
  | "bgApp" | "bgRail" | "bgPanel" | "bgPanelDeep" | "bgSidebar" | "bgActive"
  | "borderDefault" | "borderCard" | "borderFocus" | "borderAccent" | "track"
  | "textPrimary" | "textBody" | "textSecondary" | "textTertiary" | "textFaint"
  | "accentCyan" | "accentGreen" | "accentGold" | "accentRed" | "accentViolet" | "accentPink";

export const uiRefreshTokens: Pick<ITheme, UIRefreshKeys> = {
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
