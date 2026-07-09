import React from "react";
import { createTheme, ThemeProvider, Theme, StyledEngineProvider } from "@mui/material/styles";
import { EventEmitter } from "../../utils/EventEmitter";
import { Settings } from "../../Settings/Settings";

export const ThemeEvents = new EventEmitter<[]>();

declare module "@mui/material/styles" {
  interface Theme {
    colors: {
      hp: React.CSSProperties["color"];
      money: React.CSSProperties["color"];
      hack: React.CSSProperties["color"];
      combat: React.CSSProperties["color"];
      cha: React.CSSProperties["color"];
      int: React.CSSProperties["color"];
      rep: React.CSSProperties["color"];
      backgroundprimary: React.CSSProperties["color"];
      backgroundsecondary: React.CSSProperties["color"];
      button: React.CSSProperties["color"];
      successlight: React.CSSProperties["color"];
      success: React.CSSProperties["color"];
      successdark: React.CSSProperties["color"];
      white: React.CSSProperties["color"];
      black: React.CSSProperties["color"];
      maplocation: React.CSSProperties["color"];
      disabled: React.CSSProperties["color"];
      primary: React.CSSProperties["color"];
      secondary: React.CSSProperties["color"];
      well: React.CSSProperties["color"];
      bgApp: React.CSSProperties["color"];
      bgRail: React.CSSProperties["color"];
      bgPanel: React.CSSProperties["color"];
      bgPanelDeep: React.CSSProperties["color"];
      bgSidebar: React.CSSProperties["color"];
      bgActive: React.CSSProperties["color"];
      borderDefault: React.CSSProperties["color"];
      borderCard: React.CSSProperties["color"];
      borderFocus: React.CSSProperties["color"];
      borderAccent: React.CSSProperties["color"];
      track: React.CSSProperties["color"];
      textPrimary: React.CSSProperties["color"];
      textBody: React.CSSProperties["color"];
      textSecondary: React.CSSProperties["color"];
      textTertiary: React.CSSProperties["color"];
      textFaint: React.CSSProperties["color"];
      accentCyan: React.CSSProperties["color"];
      accentGreen: React.CSSProperties["color"];
      accentGold: React.CSSProperties["color"];
      accentRed: React.CSSProperties["color"];
      accentViolet: React.CSSProperties["color"];
      accentPink: React.CSSProperties["color"];
    };
  }
  interface ThemeOptions {
    colors: {
      hp: React.CSSProperties["color"];
      money: React.CSSProperties["color"];
      hack: React.CSSProperties["color"];
      combat: React.CSSProperties["color"];
      cha: React.CSSProperties["color"];
      int: React.CSSProperties["color"];
      rep: React.CSSProperties["color"];
      backgroundprimary: React.CSSProperties["color"];
      backgroundsecondary: React.CSSProperties["color"];
      button: React.CSSProperties["color"];
      successlight: React.CSSProperties["color"];
      success: React.CSSProperties["color"];
      successdark: React.CSSProperties["color"];
      white: React.CSSProperties["color"];
      black: React.CSSProperties["color"];
      maplocation: React.CSSProperties["color"];
      disabled: React.CSSProperties["color"];
      primary: React.CSSProperties["color"];
      secondary: React.CSSProperties["color"];
      well: React.CSSProperties["color"];
      bgApp: React.CSSProperties["color"];
      bgRail: React.CSSProperties["color"];
      bgPanel: React.CSSProperties["color"];
      bgPanelDeep: React.CSSProperties["color"];
      bgSidebar: React.CSSProperties["color"];
      bgActive: React.CSSProperties["color"];
      borderDefault: React.CSSProperties["color"];
      borderCard: React.CSSProperties["color"];
      borderFocus: React.CSSProperties["color"];
      borderAccent: React.CSSProperties["color"];
      track: React.CSSProperties["color"];
      textPrimary: React.CSSProperties["color"];
      textBody: React.CSSProperties["color"];
      textSecondary: React.CSSProperties["color"];
      textTertiary: React.CSSProperties["color"];
      textFaint: React.CSSProperties["color"];
      accentCyan: React.CSSProperties["color"];
      accentGreen: React.CSSProperties["color"];
      accentGold: React.CSSProperties["color"];
      accentRed: React.CSSProperties["color"];
      accentViolet: React.CSSProperties["color"];
      accentPink: React.CSSProperties["color"];
    };
  }
}

let theme: Theme;
const themeStyleSheet = new CSSStyleSheet();

export function refreshTheme(): void {
  theme = createTheme({
    colors: {
      hp: Settings.theme.hp,
      money: Settings.theme.money,
      hack: Settings.theme.hack,
      combat: Settings.theme.combat,
      cha: Settings.theme.cha,
      int: Settings.theme.int,
      rep: Settings.theme.rep,
      backgroundprimary: Settings.theme.backgroundprimary,
      backgroundsecondary: Settings.theme.backgroundsecondary,
      button: Settings.theme.button,
      successlight: Settings.theme.successlight,
      success: Settings.theme.success,
      successdark: Settings.theme.successdark,
      white: Settings.theme.white,
      black: Settings.theme.black,
      maplocation: Settings.theme.maplocation,
      disabled: Settings.theme.disabled,
      primary: Settings.theme.primary,
      secondary: Settings.theme.secondary,
      well: Settings.theme.well,
      bgApp: Settings.theme.bgApp,
      bgRail: Settings.theme.bgRail,
      bgPanel: Settings.theme.bgPanel,
      bgPanelDeep: Settings.theme.bgPanelDeep,
      bgSidebar: Settings.theme.bgSidebar,
      bgActive: Settings.theme.bgActive,
      borderDefault: Settings.theme.borderDefault,
      borderCard: Settings.theme.borderCard,
      borderFocus: Settings.theme.borderFocus,
      borderAccent: Settings.theme.borderAccent,
      track: Settings.theme.track,
      textPrimary: Settings.theme.textPrimary,
      textBody: Settings.theme.textBody,
      textSecondary: Settings.theme.textSecondary,
      textTertiary: Settings.theme.textTertiary,
      textFaint: Settings.theme.textFaint,
      accentCyan: Settings.theme.accentCyan,
      accentGreen: Settings.theme.accentGreen,
      accentGold: Settings.theme.accentGold,
      accentRed: Settings.theme.accentRed,
      accentViolet: Settings.theme.accentViolet,
      accentPink: Settings.theme.accentPink,
    },
    palette: {
      primary: {
        light: Settings.theme.primarylight,
        main: Settings.theme.primary,
        dark: Settings.theme.primarydark,
      },
      secondary: {
        light: Settings.theme.secondarylight,
        main: Settings.theme.secondary,
        dark: Settings.theme.secondarydark,
      },
      error: {
        light: Settings.theme.errorlight,
        main: Settings.theme.error,
        dark: Settings.theme.errordark,
      },
      info: {
        light: Settings.theme.infolight,
        main: Settings.theme.info,
        dark: Settings.theme.infodark,
      },
      warning: {
        light: Settings.theme.warninglight,
        main: Settings.theme.warning,
        dark: Settings.theme.warningdark,
      },
      success: {
        light: Settings.theme.successlight,
        main: Settings.theme.success,
        dark: Settings.theme.successdark,
      },
      background: {
        default: Settings.theme.bgApp,
        paper: Settings.theme.bgPanel,
      },
      // Base text/divider tokens so un-overridden MUI internals (table cells, secondary text,
      // color="textPrimary"/"textSecondary" props) resolve to the refresh text scale instead of
      // MUI's light-mode near-black defaults.
      text: {
        primary: Settings.theme.textPrimary,
        secondary: Settings.theme.textSecondary,
        disabled: Settings.theme.textFaint,
      },
      divider: Settings.theme.borderDefault,
      action: {
        disabled: Settings.theme.disabled,
      },
    },
    typography: {
      fontFamily: Settings.styles.fontFamily,
      fontSize: Settings.styles.fontSize,
      button: {
        textTransform: "none",
      },
    },
    components: {
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: Settings.theme.bgPanelDeep,
            color: Settings.theme.textBody,
          },
          input: {
            "&::placeholder": {
              userSelect: "none",
              color: Settings.theme.textFaint,
              opacity: 1,
            },
          },
        },
      },

      MuiInput: {
        styleOverrides: {
          root: {
            backgroundColor: Settings.theme.bgPanelDeep,
            borderBottomColor: Settings.theme.borderCard,
          },
          underline: {
            "&:hover:not(.Mui-disabled):before": {
              borderBottomColor: Settings.theme.borderFocus,
            },
            "&:before": {
              borderBottomColor: Settings.theme.borderCard,
            },
            "&:after": {
              borderBottomColor: Settings.theme.borderFocus,
            },
          },
        },
      },

      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: Settings.theme.textSecondary,
            userSelect: "none",
            "&.Mui-focused": {
              color: Settings.theme.accentCyan,
            },
          },
        },
      },

      MuiButtonGroup: {
        styleOverrides: {
          root: {
            "& .MuiButton-root:not(:last-of-type)": {
              marginRight: "1px",
            },
          },
        },
      },

      MuiButton: {
        styleOverrides: {
          root: ({ ownerState }) => ({
            backgroundColor: Settings.theme.bgPanel,
            border: "1px solid " + Settings.theme.borderCard,
            borderRadius: 6,
            transition: "background-color 120ms ease-out, border-color 120ms ease-out",
            // Default (color="primary") buttons adopt the refresh body-text color; buttons with
            // explicit semantic colors (error/warning/success/...) keep their palette colors.
            ...(ownerState.color === "primary" && { color: Settings.theme.textBody }),
            "&:hover": {
              backgroundColor: Settings.theme.bgActive,
              borderColor: Settings.theme.borderFocus,
            },
          }),
          containedPrimary: {
            backgroundColor: Settings.theme.accentCyan,
            borderColor: "transparent",
            color: Settings.theme.bgApp,
            "&:hover": {
              backgroundColor: Settings.theme.accentCyan,
              borderColor: "transparent",
              filter: "brightness(1.15)",
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: {
            color: Settings.theme.textSecondary,
          },
        },
        defaultProps: {
          variant: "standard",
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: "standard",
        },
      },
      MuiTypography: {
        styleOverrides: {
          // Default text adopts the refresh body color. Legacy screens pass color="primary"
          // explicitly all over the place; in MUI v5 that resolves through the sx system
          // (higher cascade priority than a plain override), so those usages get a bumped
          // specificity ("&&") remap to textBody. Other explicit colors (error, secondary,
          // theme.colors.* via className/sx) are untouched. palette.primary itself is kept
          // green for ns.ui + user themes.
          root: ({ ownerState }) => ({
            lineHeight: Settings.styles.lineHeight,
            color: Settings.theme.textBody,
            ...((ownerState.color === "primary" || ownerState.color === "primary.main") && {
              "&&": { color: Settings.theme.textBody },
            }),
          }),
        },
      },
      MuiMenu: {
        styleOverrides: {
          list: {
            backgroundColor: Settings.theme.bgPanel,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            color: Settings.theme.textBody,
            "&:hover": {
              backgroundColor: Settings.theme.bgActive,
            },
            "&.Mui-selected": {
              backgroundColor: Settings.theme.bgActive,
            },
            "&.Mui-selected:hover": {
              backgroundColor: Settings.theme.bgActive,
            },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            backgroundColor: Settings.theme.bgPanel,
          },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: {
            backgroundColor: Settings.theme.bgPanelDeep,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          // Chrome-colored icon buttons; explicit semantic colors keep their palette colors.
          root: ({ ownerState }) => ({
            ...((ownerState.color === "default" || ownerState.color === "primary") && {
              color: Settings.theme.textBody,
            }),
          }),
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: "1em",
            color: Settings.theme.textBody,
            backgroundColor: Settings.theme.bgPanelDeep,
            borderRadius: 6,
            border: "1px solid " + Settings.theme.borderCard,
            maxWidth: "100vh",
          },
          popper: {
            zIndex: 25000,
          },
        },
        defaultProps: {
          disableInteractive: true,
        },
      },
      MuiSlider: {
        styleOverrides: {
          root: {
            color: Settings.theme.accentCyan,
          },
          valueLabel: {
            color: Settings.theme.textBody,
            backgroundColor: Settings.theme.bgPanelDeep,
            border: "1px solid " + Settings.theme.borderCard,
            borderRadius: 6,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            "&::-webkit-scrollbar": {
              // webkit
              display: "none",
            },
            scrollbarWidth: "none", // firefox
            backgroundColor: Settings.theme.bgPanel,
          },
          paperAnchorDockedLeft: {
            borderRight: "1px solid " + Settings.theme.borderDefault,
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            backgroundColor: Settings.theme.borderDefault,
            borderColor: Settings.theme.borderDefault,
          },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          root: {
            color: Settings.theme.textBody,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            color: Settings.theme.textTertiary,
            "&.Mui-checked": {
              color: Settings.theme.accentCyan,
            },
            "&.Mui-checked + .MuiSwitch-track": {
              backgroundColor: Settings.theme.accentCyan,
            },
          },
          track: {
            backgroundColor: Settings.theme.track,
            opacity: 1,
          },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: Settings.theme.textTertiary,
            "&.Mui-checked": {
              color: Settings.theme.accentCyan,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: ({ ownerState }) => ({
            ...(!ownerState.square && { borderRadius: 8 }),
            backgroundColor: Settings.theme.bgPanel,
            border: "1px solid " + Settings.theme.borderCard,
          }),
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          select: {
            color: Settings.theme.textBody,
          },
          selectLabel: {
            color: Settings.theme.textBody,
          },
          displayedRows: {
            color: Settings.theme.textBody,
          },
        },
      },
      // Underline tabs per the refresh grammar (see design-notes-1B tab bar + ActiveScriptsRoot).
      MuiTab: {
        styleOverrides: {
          textColorPrimary: {
            color: Settings.theme.textSecondary,
            "&.Mui-selected": {
              color: Settings.theme.accentCyan,
            },
          },
          root: {
            backgroundColor: "transparent",
            border: "none",
            margin: 0,
            padding: "9px 14px",
            minHeight: "40px",
            fontWeight: 500,
            "&.Mui-selected": {
              fontWeight: 600,
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: "40px",
            borderBottom: "1px solid " + Settings.theme.borderDefault,
          },
          indicator: {
            height: "2px",
            backgroundColor: Settings.theme.accentCyan,
          },
          scrollButtons: {
            color: Settings.theme.textSecondary,
            opacity: 1,
            width: "fit-content",

            "&.Mui-disabled": {
              opacity: 0.5,
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            backgroundColor: Settings.theme.bgPanel,
            borderRadius: 8,
            border: "1px solid " + Settings.theme.borderCard,
          },
          standardSuccess: {
            color: Settings.theme.successlight,
          },
          standardError: {
            color: Settings.theme.errorlight,
          },
          standardWarning: {
            color: Settings.theme.warninglight,
          },
          standardInfo: {
            color: Settings.theme.infolight,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          option: {
            color: Settings.theme.textBody,
            "&.Mui-focused": {
              backgroundColor: Settings.theme.bgActive,
            },
          },
          inputRoot: {
            height: "100%",
          },
        },
      },
      MuiModal: {
        styleOverrides: {
          root: {
            zIndex: 20000,
          },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            fontFamily: Settings.styles.fontFamily,
          },
        },
        defaultProps: {
          // Links adopt the interactive accent. Not a palette key, so it flows through the sx
          // system as a raw color; explicit color props on individual Links are still respected.
          color: Settings.theme.accentCyan,
        },
      },
    },
  });

  document.body.style.backgroundColor = theme.colors.bgApp?.toString() ?? "black";

  const styleSheet =
    ":root {" +
    Object.entries(Settings.theme)
      .map(([k, v]) => `--bb-theme-${k}: ${v}`)
      .join(";") +
    "}";

  themeStyleSheet.replaceSync(styleSheet);
}

document.adoptedStyleSheets.push(themeStyleSheet);
refreshTheme();

interface IProps {
  children: JSX.Element[] | JSX.Element;
}

export const TTheme = ({ children }: IProps): React.ReactElement => (
  <StyledEngineProvider injectFirst>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </StyledEngineProvider>
);
