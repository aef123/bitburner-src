import { CommandBlockStart, type TerminalHistoryItem } from "../OutputTypes";

/** One command "card": the echoed command plus every output item that followed it. */
export interface CommandBlockGroup {
  start: CommandBlockStart;
  items: TerminalHistoryItem[];
}

export interface GroupedOutput {
  /** Items before the first CommandBlockStart (version banner, or outputs orphaned by the
   * MaxTerminalCapacity front-splice removing their block start). Rendered bare. */
  preamble: TerminalHistoryItem[];
  blocks: CommandBlockGroup[];
}

/**
 * Pure render-time grouping of the flat Terminal.outputHistory into command blocks.
 * Single O(n) pass; no state is kept on the Terminal, so the MaxTerminalCapacity splice
 * in Terminal.append keeps working unchanged (grouping just sees fewer items).
 */
export function groupOutputHistory(items: readonly TerminalHistoryItem[]): GroupedOutput {
  const preamble: TerminalHistoryItem[] = [];
  const blocks: CommandBlockGroup[] = [];
  let current: CommandBlockGroup | null = null;
  for (const item of items) {
    if (item instanceof CommandBlockStart) {
      current = { start: item, items: [] };
      blocks.push(current);
    } else if (current !== null) {
      current.items.push(item);
    } else {
      preamble.push(item);
    }
  }
  return { preamble, blocks };
}
