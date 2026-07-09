/**
 * Pure list builders for the script editor's bottom panel (Task 12, 2C part 2).
 *
 * Kept monaco-free (monaco is NullMock'd in jest): marker severities are local numeric constants
 * mirroring monaco.MarkerSeverity, and workers are taken structurally.
 */

// monaco.MarkerSeverity values (Hint=1, Info=2, Warning=4, Error=8). Local copies keep this
// module importable in jsdom tests; StatusBar2C uses the real enum with the same floor.
const MARKER_SEVERITY_WARNING = 4;
const MARKER_SEVERITY_ERROR = 8;

/** Structural subset of monaco.editor.IMarker that the Problems tab needs. */
export interface MarkerLike {
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
}

export interface ProblemRow {
  severity: "error" | "warning";
  message: string;
  /** 1-based, straight from the marker. */
  line: number;
  column: number;
}

/**
 * Markers → Problems rows. Scope decision (documented in the plan): ACTIVE model only, with the
 * same severity floor (Warning and up) as StatusBar2C's problems count — so the panel's row count
 * always equals the status-bar number the player clicked to open it.
 */
export function buildProblemRows(markers: readonly MarkerLike[]): ProblemRow[] {
  return markers
    .filter((marker) => marker.severity >= MARKER_SEVERITY_WARNING)
    .map<ProblemRow>((marker) => ({
      severity: marker.severity >= MARKER_SEVERITY_ERROR ? "error" : "warning",
      message: marker.message,
      line: marker.startLineNumber,
      column: marker.startColumn,
    }))
    .sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Structural subset of WorkerScript that the Logs tab needs (scriptRef = RunningScript). */
export interface WorkerLike {
  scriptRef: {
    pid: number;
    filename: string;
    args: (string | number | boolean)[];
    server: string;
  };
}

export interface LogRow<T extends WorkerLike = WorkerLike> {
  pid: number;
  filename: string;
  /** Space-joined args, same presentation as the Active Scripts rows. */
  args: string;
  /** The source worker, so the click handler can LogBoxEvents.emit(worker.scriptRef). */
  worker: T;
}

/**
 * workerScripts → Logs rows for the active file's server. Scope decision (documented in the
 * plan): the simplest honest set is "scripts currently running on the server the player is
 * editing" — no cross-server aggregation, no filename guessing.
 */
export function buildLogRows<T extends WorkerLike>(workers: Iterable<T>, hostname: string | null): LogRow<T>[] {
  if (hostname === null) {
    return [];
  }
  const rows: LogRow<T>[] = [];
  for (const worker of workers) {
    if (worker.scriptRef.server !== hostname) {
      continue;
    }
    rows.push({
      pid: worker.scriptRef.pid,
      filename: String(worker.scriptRef.filename),
      args: worker.scriptRef.args.map(String).join(" "),
      worker,
    });
  }
  return rows.sort((a, b) => a.pid - b.pid);
}
