/**
 * What a backend-side producer reports to the run journal when input never reaches a workflow (ADR 0059 (private)
 * §2c): an undeliverable signal, a stale button press, a resolved task whose run is gone. Implemented in `backend`
 * by `RunJournalService.recordProblem` over the same ingest normalisation runner entries go through; vendors reach it
 * through `IIntegrationBackendContext.reportJournalProblem` (the vendor/env come from the target, not the caller).
 * Every implementation must swallow its own errors — the journal never breaks the caller.
 */
export interface IRunJournalProblemParams {
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
  readonly workflowId: string;
  /** `null`/omitted when the problem belongs to no run (nothing was running to receive the input). */
  readonly runId?: string | null;
  readonly vendor?: string | null;
  readonly documentId?: string | null;
  readonly nodeId?: string | null;
  readonly message: string;
  readonly data?: Record<string, unknown> | null;
  /** Default `'warn'`. */
  readonly level?: 'info' | 'warn' | 'error';
}

export interface IRunJournalProblemPort {
  recordProblem(params: IRunJournalProblemParams): Promise<void>;
}
