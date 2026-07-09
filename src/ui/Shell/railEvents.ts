/**
 * Shared expand/collapse state channel for the icon rail.
 *
 * `Settings.IsSidebarOpened` is the persisted source of truth — the same setting the classic
 * SidebarRoot chevron used, so old saves keep their sidebar preference. This emitter just tells
 * the interested components (IconRail itself, ShellLayout's grid column) to rerender when it
 * flips. Same pattern as hudEvents.ts, kept separate so the two toggles stay independent.
 */
import { Settings } from "../../Settings/Settings";
import { EventEmitter } from "../../utils/EventEmitter";

export const RailToggleEvents = new EventEmitter<[]>();

/** Set the rail expanded state and notify subscribers. No-op when the value is unchanged. */
export function setRailExpanded(expanded: boolean): void {
  if (Settings.IsSidebarOpened === expanded) return;
  Settings.IsSidebarOpened = expanded;
  RailToggleEvents.emit();
}
