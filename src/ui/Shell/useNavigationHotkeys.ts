/**
 * Global Alt+X page-navigation hotkeys for the shell. This is a straight port of the keydown effect that historically
 * lived in SidebarRoot (SidebarRoot is no longer mounted once the shell owns the layout, so the listener lives here).
 * Suppression rules are identical: disabled hotkeys, modifier-state keys, key-binding setup mode, focused work, and
 * the BitVerse page.
 */
import { useCallback, useEffect, useRef } from "react";

import { Player } from "@player";
import { Router } from "../GameRoot";
import { isSimplePage, Page } from "../Router";
import { Settings } from "../../Settings/Settings";
import { iTutorialNextStep } from "../../InteractiveTutorial";
import { getTutorialFlashPage, isPageVisible } from "../../Sidebar/navigationItems";
import {
  convertKeyboardEventToKeyCombination,
  CurrentKeyBindings,
  determineKeyBindingTypes,
  type GoToPageKeyBindingType,
  GoToPageKeyBindingTypes,
  KeyBindingEvents,
  KeyBindingEventType,
  type KeyBindingType,
} from "../../utils/KeyBindingUtils";

/**
 * Shared hotkey suppression guard. Returns an object with:
 *   - `isSuppressed(event)` — true when any shell hotkey (navigation or palette) should be skipped.
 *
 * The hook owns the KeyBindingEvents subscription so callers don't need to manage it themselves.
 * Both useNavigationHotkeys and ShellLayout's palette shortcut handler use this to avoid drift.
 */
export function useHotkeySuppression(): { isSuppressed: (event: KeyboardEvent) => boolean } {
  const isSettingUpKeyBindings = useRef(false);

  useEffect(() => {
    const clearSubscription = KeyBindingEvents.subscribe((eventType) => {
      if (eventType === KeyBindingEventType.StartSettingUp) isSettingUpKeyBindings.current = true;
      if (eventType === KeyBindingEventType.StopSettingUp) isSettingUpKeyBindings.current = false;
    });
    return clearSubscription;
  }, []);

  const isSuppressed = useCallback((event: KeyboardEvent): boolean => {
    if (Settings.DisableHotkeys) return true;
    if (event.getModifierState(event.key)) return true;
    if (isSettingUpKeyBindings.current) return true;
    if ((Player.currentWork && Player.focus) || Router.page() === Page.BitVerse) return true;
    return false;
  }, []);

  return { isSuppressed };
}

/**
 * Navigate to a page from a navigation surface (icon rail, hotkeys, palette). Mirrors SidebarRoot's clickPage:
 * provides the required context for complex pages and advances the interactive tutorial when the flashed page is
 * visited.
 */
export function navigateToPage(page: Page): void {
  if (page === Page.ScriptEditor) {
    Router.toPage(page, {
      files: new Map(),
      options: { vim: Settings.MonacoDefaultToVim, hostname: Player.currentServer },
    });
  } else if (page === Page.Documentation || page === Page.Options || page === Page.ActiveScripts) {
    Router.toPage(page, {});
  } else if (isSimplePage(page)) {
    Router.toPage(page);
  } else {
    throw new Error("Can't handle navigation to Page " + page);
  }
  if (getTutorialFlashPage() === page) {
    iTutorialNextStep();
  }
}

export function useNavigationHotkeys(): void {
  const { isSuppressed } = useHotkeySuppression();

  /**
   * "keyBindingType is GoToPageKeyBindingType" narrows the type: a binding is navigable when it targets a page
   * (not a script editor action) and that page's navigation item is currently visible.
   */
  const canGoToPage = useCallback((keyBindingType: KeyBindingType): keyBindingType is GoToPageKeyBindingType => {
    if (!(GoToPageKeyBindingTypes as readonly KeyBindingType[]).includes(keyBindingType)) {
      return false;
    }
    return isPageVisible(keyBindingType as Page);
  }, []);

  useEffect(() => {
    function handleShortcuts(this: Document, event: KeyboardEvent): void {
      if (isSuppressed(event)) return;
      const keyBindingTypes = determineKeyBindingTypes(CurrentKeyBindings, convertKeyboardEventToKeyCombination(event));
      for (const keyBindingType of keyBindingTypes) {
        if (!canGoToPage(keyBindingType)) {
          continue;
        }
        event.preventDefault();
        navigateToPage(keyBindingType);
      }
    }

    document.addEventListener("keydown", handleShortcuts);
    return () => document.removeEventListener("keydown", handleShortcuts);
  }, [canGoToPage, isSuppressed]);
}
