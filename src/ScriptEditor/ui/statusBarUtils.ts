/**
 * Pure helpers for the script-editor status bar (Task 11, 2C part 1). The monaco-touching parts
 * (cursor/marker listeners) live in StatusBar2C behind editor-null guards; these stay testable.
 */

import { FileType, getFileType } from "../../utils/ScriptTransformer";
import { throwIfReachable } from "../../utils/helpers/throwIfReachable";
import { formatRam } from "../../ui/formatNumber";

export interface RamFitResult {
  /** true = fits on the script's server, false = exceeds it, null = unknown (error/text file). */
  fits: boolean | null;
  /** The mock's context clause, e.g. "— fits home (128.00GB)". Empty when unknown. */
  clause: string;
}

/**
 * Describe whether a script's static RAM cost fits on its server (mock: "— fits home (128 GB)").
 * A cost exactly equal to maxRam still fits: a full-server single-thread run is legal.
 */
export function describeRamFit(ramCost: number | null, hostname: string | null, maxRam: number | null): RamFitResult {
  if (ramCost === null || hostname === null || maxRam === null) {
    return { fits: null, clause: "" };
  }
  const fits = ramCost <= maxRam;
  return { fits, clause: `— ${fits ? "fits" : "exceeds"} ${hostname} (${formatRam(maxRam)})` };
}

/** Human label for the status bar's file · language segment. */
export function languageLabel(path: string): string {
  const fileType = getFileType(path);
  switch (fileType) {
    case FileType.JS:
      return "JavaScript";
    case FileType.JSX:
      return "JavaScript (JSX)";
    case FileType.TS:
      return "TypeScript";
    case FileType.TSX:
      return "TypeScript (TSX)";
    case FileType.NS1:
      return "JavaScript (NS1)";
    case FileType.PLAINTEXT:
      return "Plain Text";
    case FileType.JSON:
      return "JSON";
    case FileType.CSS:
      return "CSS";
    default:
      throwIfReachable(fileType);
      return "Unknown";
  }
}
