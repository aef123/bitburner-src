import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { styled, Theme, CSSObject } from "@mui/material/styles";
import { makeStyles } from "tss-react/mui";
import MuiDrawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";

import { Router } from "../../ui/GameRoot";
import { Page, isSimplePage } from "../../ui/Router";
import { SidebarAccordion } from "./SidebarAccordion";
import { Player } from "@player";
import { CONSTANTS } from "../../Constants";
import { iTutorialNextStep } from "../../InteractiveTutorial";
import { Settings } from "../../Settings/Settings";

import { commitHash } from "../../utils/helpers/commitHash";
import { useCycleRerender } from "../../ui/React/hooks";
import {
  convertKeyboardEventToKeyCombination,
  determineKeyBindingTypes,
  type GoToPageKeyBindingType,
  GoToPageKeyBindingTypes,
  KeyBindingEvents,
  KeyBindingEventType,
  type KeyBindingType,
  CurrentKeyBindings,
} from "../../utils/KeyBindingUtils";
import {
  getTutorialFlashPage,
  isItemVisible,
  isPageVisible,
  navigationSections,
} from "../navigationItems";

const openedMixin = (theme: Theme): CSSObject => ({
  width: theme.spacing(31),
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: "hidden",
});

const closedMixin = (theme: Theme): CSSObject => ({
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: "hidden",
  width: `calc(${theme.spacing(2)} + 1px)`,
  [theme.breakpoints.up("sm")]: {
    width: `calc(${theme.spacing(7)} + 1px)`,
  },
});

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== "open" })(({ theme, open }) => ({
  width: theme.spacing(31),
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  ...(open && {
    ...openedMixin(theme),
    "& .MuiDrawer-paper": openedMixin(theme),
  }),
  ...(!open && {
    ...closedMixin(theme),
    "& .MuiDrawer-paper": closedMixin(theme),
  }),
}));

const useStyles = makeStyles()((theme: Theme) => ({
  active: {
    borderLeft: "3px solid " + theme.palette.primary.main,
  },
  listitem: {},
}));

export function SidebarRoot(props: { page: Page }): React.ReactElement {
  const isSettingUpKeyBindings = useRef(false);
  useCycleRerender();

  const flash = getTutorialFlashPage();

  const clickPage = useCallback(
    (page: Page) => {
      if (page == Page.ScriptEditor) {
        Router.toPage(page, {
          files: new Map(),
          options: { vim: Settings.MonacoDefaultToVim, hostname: Player.currentServer },
        });
      } else if (page === Page.Documentation || page === Page.Options || page === Page.ActiveScripts) {
        Router.toPage(page, {});
      } else if (isSimplePage(page)) {
        Router.toPage(page);
      } else {
        throw new Error("Can't handle click on Page " + page);
      }
      if (flash === page) {
        iTutorialNextStep();
      }
    },
    [flash],
  );

  /**
   * We use "keyBindingType is GoToPageKeyBindingType" to narrow down the type of keyBindingType. A binding is
   * navigable when it targets a page (not a script editor action) and that page's shared navigation item is
   * currently visible.
   */
  const canGoToPage = useCallback((keyBindingType: KeyBindingType): keyBindingType is GoToPageKeyBindingType => {
    if (!(GoToPageKeyBindingTypes as readonly KeyBindingType[]).includes(keyBindingType)) {
      return false;
    }
    return isPageVisible(keyBindingType as Page);
  }, []);

  useEffect(() => {
    const clearSubscription = KeyBindingEvents.subscribe((eventType) => {
      if (eventType === KeyBindingEventType.StartSettingUp) {
        isSettingUpKeyBindings.current = true;
      }
      if (eventType === KeyBindingEventType.StopSettingUp) {
        isSettingUpKeyBindings.current = false;
      }
    });
    return clearSubscription;
  }, []);

  useEffect(() => {
    function handleShortcuts(this: Document, event: KeyboardEvent): void {
      if (Settings.DisableHotkeys) {
        return;
      }
      if (event.getModifierState(event.key)) {
        return;
      }
      if (isSettingUpKeyBindings.current) {
        return;
      }
      if ((Player.currentWork && Player.focus) || Router.page() === Page.BitVerse) {
        return;
      }
      const keyBindingTypes = determineKeyBindingTypes(CurrentKeyBindings, convertKeyboardEventToKeyCombination(event));
      for (const keyBindingType of keyBindingTypes) {
        if (!canGoToPage(keyBindingType)) {
          continue;
        }
        event.preventDefault();
        clickPage(keyBindingType);
      }
    }

    document.addEventListener("keydown", handleShortcuts);
    return () => document.removeEventListener("keydown", handleShortcuts);
  }, [canGoToPage, clickPage, props.page]);

  const { classes } = useStyles();
  const [open, setOpen] = useState(Settings.IsSidebarOpened);
  const toggleDrawer = (): void =>
    setOpen((old) => {
      Settings.IsSidebarOpened = !old;
      return !old;
    });
  const li_classes = useMemo(() => ({ root: classes.listitem }), [classes.listitem]);
  const ChevronOpenClose = open ? ChevronLeftIcon : ChevronRightIcon;

  // Explicitly useMemo() to save rerendering deep chunks of this tree.
  // memo() can't be (easily) used on components like <List>, because the
  // props.children array will be a different object every time.
  return (
    <Drawer open={open} anchor="left" variant="permanent">
      {useMemo(
        () => (
          <ListItem classes={li_classes} button onClick={toggleDrawer}>
            <ListItemIcon>
              <ChevronOpenClose color={"primary"} />
            </ListItemIcon>
            <ListItemText
              primary={
                <Tooltip title={commitHash()}>
                  <Typography>Bitburner v{CONSTANTS.VersionString}</Typography>
                </Tooltip>
              }
            />
          </ListItem>
        ),
        [ChevronOpenClose, li_classes],
      )}
      <Divider />
      <List>
        {navigationSections.map((section, index) => (
          <React.Fragment key={section.label}>
            {index > 0 && <Divider />}
            <SidebarAccordion
              key_={section.label}
              page={props.page}
              clickPage={clickPage}
              flash={flash}
              icon={section.icon}
              sidebarOpen={open}
              classes={classes}
              items={section.items.map(
                (item) =>
                  isItemVisible(item) && {
                    key_: item.page,
                    icon: item.icon,
                    count: item.badge?.(),
                    alternateKeys: item.alternateKeys,
                  },
              )}
            />
            <Typography component="div" id={`sidebar-extra-hook-${index}`}></Typography>
          </React.Fragment>
        ))}
      </List>
    </Drawer>
  );
}
