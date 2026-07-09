/**
 * Eager-safe front door for the income counter. Like TelemetryLogger, this file must NOT
 * import @opentelemetry/* — it is reached from hot game code (Player.recordMoneySource). The
 * actual OTel Counter is created in the lazy EngineMetrics module, which installs the
 * recorder here once it exists.
 */
export type IncomeRecorder = (source: string, amount: number) => void;

let recorder: IncomeRecorder | null = null;

/** Installed by EngineMetrics when the income counter exists; cleared on teardown. */
export function setIncomeRecorder(next: IncomeRecorder | null): void {
  recorder = next;
}

/** Records income/expense by source. No-op unless telemetry metrics are active. */
export function recordIncome(source: string, amount: number): void {
  recorder?.(source, amount);
}
