/**
 * Shared collapse/restore state channel for the docked HUD (Task 4).
 *
 * `Settings.HudCollapsed` is the persisted source of truth; this emitter just tells the interested
 * components (ShellLayout grid, TopBar reopen button, GameRoot's floating-Overview switch) to
 * rerender when it flips. Kept in its own module so Hud/TopBar/ShellLayout/GameRoot can all import
 * it without creating import cycles.
 */
import { Settings } from "../../Settings/Settings";
import { EventEmitter } from "../../utils/EventEmitter";

export const HudToggleEvents = new EventEmitter<[]>();

/** Set the HUD collapsed state and notify subscribers. No-op when the value is unchanged. */
export function setHudCollapsed(collapsed: boolean): void {
  if (Settings.HudCollapsed === collapsed) return;
  Settings.HudCollapsed = collapsed;
  HudToggleEvents.emit();
}
