import * as predefined from "./data";
import { uiRefreshTokens } from "./data/uiRefreshDefaults";

/**
 * If we change this interface, we must change MainThemeSchema and UserInterfaceTheme.
 */
export interface ITheme {
  primarylight: string;
  primary: string;
  primarydark: string;
  successlight: string;
  success: string;
  successdark: string;
  errorlight: string;
  error: string;
  errordark: string;
  secondarylight: string;
  secondary: string;
  secondarydark: string;
  warninglight: string;
  warning: string;
  warningdark: string;
  infolight: string;
  info: string;
  infodark: string;
  welllight: string;
  well: string;
  white: string;
  black: string;
  hp: string;
  money: string;
  hack: string;
  combat: string;
  cha: string;
  int: string;
  rep: string;
  disabled: string;
  backgroundprimary: string;
  backgroundsecondary: string;
  button: string;
  maplocation: string;
  bnlvl0: string;
  bnlvl1: string;
  bnlvl2: string;
  bnlvl3: string;
  bgApp: string;
  bgRail: string;
  bgPanel: string;
  bgPanelDeep: string;
  bgSidebar: string;
  bgActive: string;
  borderDefault: string;
  borderCard: string;
  borderFocus: string;
  borderAccent: string;
  track: string;
  textPrimary: string;
  textBody: string;
  textSecondary: string;
  textTertiary: string;
  textFaint: string;
  accentCyan: string;
  accentGreen: string;
  accentGold: string;
  accentRed: string;
  accentViolet: string;
  accentPink: string;
}

export interface IPredefinedTheme {
  colors: ITheme;
  name: string;
  credit: string;
  screenshot: string;
  description: string;
  reference?: string;
}

export const defaultTheme: ITheme = {
  ...predefined.Default.colors,
  ...uiRefreshTokens,
};

export const getPredefinedThemes = (): Record<string, IPredefinedTheme> => ({
  ...predefined,
});
