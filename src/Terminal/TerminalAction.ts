export interface TerminalAction {
  // Abort the current action on a best-effort basis, if it is not already
  // completed. Does nothing if "finished" is already resolved.
  cancel: () => void;

  // Signal for when the action is complete. Will be rejected with Cancellation
  // if cancel is called before resolving.
  finished: Promise<void>;

  // Returns the current displayed progress for this action.
  getProgressText: () => string;

  // UI-only additive fields (Task 8): actions with a known fixed duration (Terminal.timedAction)
  // expose their start time and duration so the UI can compute a numeric progress fraction.
  // Custom actions (wget/upload) omit them and the UI falls back to getProgressText.

  // performance.now() timestamp captured when the action started.
  startTime?: number;

  // Total duration of the action in milliseconds.
  durationMs?: number;
}

export class Cancellation extends Error {
  constructor(name: string) {
    super(`Terminal command ${name} was cancelled`);
  }
}
