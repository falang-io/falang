/**
 * Thrown by the host's `ensureRunnerRunning` hook when starting the runner was refused on purpose (a suspended project,
 * an exhausted balance) rather than failing. `IntegrationsRuntimeService.signalWorkflow` then does NOT signal the
 * workflow — nothing would run it, and the event must not sit in Temporal to fire later when the project is resumed —
 * and journals the input as undeliverable instead. Any other wake error keeps the old best-effort "signal anyway" behaviour.
 */
export class RunnerStartRefusedError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RunnerStartRefusedError';
    this.cause = cause;
  }
}
