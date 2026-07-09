/**
 * Eager-safe front door for script-execution-chain tracing. Called from the script lifecycle
 * (createAndAddWorkerScript / stopAndCleanUpWorkerScript), so it must NOT import
 * @opentelemetry/*. The real span manager (lazy, OTel-backed) is installed here once the
 * tracer provider exists.
 */
export interface ScriptStartInfo {
  filename: string;
  server: string;
  threads: number;
  /** JSON-stringified script args. */
  args: string;
  /** "run" | "exec" | "spawn" | "root" (or another caller string). */
  launchMethod: string;
}

export interface ScriptTracerImpl {
  onScriptStart(pid: number, info: ScriptStartInfo, parentPid?: number): void;
  onScriptEnd(pid: number, error?: boolean): void;
  endAllOpenSpans(): void;
}

let impl: ScriptTracerImpl | null = null;

/** Installed by the Telemetry facade when the tracer provider is live; cleared on teardown. */
export function setScriptTracerImpl(next: ScriptTracerImpl | null): void {
  impl = next;
}

/** Cheap guard so callers can skip building the start-info object when tracing is off. */
export function isTracing(): boolean {
  return impl !== null;
}

export function onScriptStart(pid: number, info: ScriptStartInfo, parentPid?: number): void {
  impl?.onScriptStart(pid, info, parentPid);
}

export function onScriptEnd(pid: number, error?: boolean): void {
  impl?.onScriptEnd(pid, error);
}

export function endAllOpenSpans(): void {
  impl?.endAllOpenSpans();
}
