/**
 * See ADR 0040 (private) §2/§3/§4 and the fixed phase-4 contract
 * (the private plan for ADRs 0037-0041). `IApiTask.attachments` deliberately mirrors
 * `../files/file.types.ts`'s `IFileRef` shape rather than importing `@falang/workflow-integrations-files`
 * (an independently-developed package this session must not touch) — same "the contract fixes the
 * shape precisely enough" reasoning that file's own doc comment gives.
 */

export type TTaskOptionDataType = 'void' | 'string' | 'number' | 'boolean';

/** One button the project owner can pick on the task page — `human-task-option`'s `data`, see the ADR §1. */
export interface ITaskOption {
  readonly label: string;
  readonly dataType: TTaskOptionDataType;
  /** The typed input's caption on the task page (e.g. "Reason") — only meaningful when `dataType !== 'void'`. */
  readonly prompt?: string;
}

export type TTaskStatus = 'open' | 'done' | 'expired' | 'cancelled' | 'orphaned';

/** An attachment reference shown as a download link on the task page — same shape as `../files/file.types.ts`'s `IFileRef`. */
export interface ITaskAttachment {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly publicUrl?: string;
}

/** The wire shape of `GET /tasks`/`GET /tasks/:id`/`POST /tasks/:id/resolve` — see the fixed phase-4 contract. */
export interface IApiTask {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly env: 'dev' | 'prod';
  readonly workflowId: string;
  readonly runId: string;
  readonly taskQueue: string;
  readonly nodeId: string;
  readonly title: string;
  readonly description: string;
  readonly payload: unknown;
  readonly attachments: readonly ITaskAttachment[];
  readonly options: readonly ITaskOption[];
  readonly status: TTaskStatus;
  readonly answer: string | null;
  readonly answerData: unknown;
  readonly resolvedBy: string | null;
  readonly createdAt: string;
  readonly dueAt: string | null;
  readonly resolvedAt: string | null;
  readonly orphanReason: string | null;
}

/**
 * The signal payload `TasksService.resolve` sends to `client.workflow.getHandle(workflowId,
 * runId).signal('humanTaskAnswer', ...)` — shared with the compiler's `question-emitters.ts`, which
 * declares the exact same shape independently on its own side of the contract (this package doesn't
 * depend on `@falang/workflow-compiler`, so there is no single shared type to import).
 */
export interface IHumanTaskAnswerSignal {
  readonly messageId: string;
  readonly value: string;
  readonly data?: unknown;
  readonly resolvedBy: string;
  readonly resolvedAt: string;
}

export const HUMAN_TASK_ANSWER_SIGNAL_NAME = 'humanTaskAnswer';

/** What `POST /internal/tasks/:projectId` hands `TasksService.createOrGet`. */
export interface ICreateTaskInput {
  readonly workflowId: string;
  readonly runId: string;
  readonly taskQueue: string;
  readonly env: 'dev' | 'prod';
  readonly nodeId: string;
  readonly title: string;
  readonly description: string;
  readonly payload?: unknown;
  readonly attachments?: readonly ITaskAttachment[];
  readonly options: readonly ITaskOption[];
  readonly timeoutSeconds?: number;
}

export interface ITasksFilters {
  readonly status?: TTaskStatus;
  readonly projectId?: string;
}
