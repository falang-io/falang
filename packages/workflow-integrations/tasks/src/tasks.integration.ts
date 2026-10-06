import type { TVariableInfo } from '@falang/typescript-dto';
import type { IQuestionDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { fileArrayTypeInfo } from '@falang/workflow-integrations-files';
import { HUMAN_TASK_ANSWER_SIGNAL_NAME, HUMAN_TASK_NAME, TASKS_VENDOR } from './constants.js';
import { taskTypeInfo, tasksTaskType } from './task-types.js';

const anyType: TVariableInfo = { type: 'any' };

/**
 * `readonly { id: string; name: string; size: number; mime: string; publicUrl?: string }[]` is
 * `@falang/workflow-integrations-files`'s `IFileRef` inlined verbatim, not imported — same reasoning
 * `files/src/actions.ts`'s own `FILE_REF_TYPE` doc comment gives: `askActivitySignature`'s text is
 * spliced into `workflows.ts`'s `proxyActivities<{...}>()` type literal, a different generated file
 * from `activities.ts` (the only one this vendor's own `sharedActivityCode` imports `IFileRef` into).
 */
const ASK_ACTIVITY_SIGNATURE =
  'humanTaskAsk(title: string, description: string, payload: unknown, ' +
  'attachments: readonly { id: string; name: string; size: number; mime: string; publicUrl?: string }[] | undefined, ' +
  'options: string): Promise<{ messageId: string }>';

const RESOLVE_ACTIVITY_SIGNATURE = 'humanTaskResolve(messageId: string, answer: string): Promise<void>';

const CLOSE_ACTIVITY_SIGNATURE = 'humanTaskClose(messageId: string, reason: string): Promise<void>';

/**
 * The single all-in-one `human-task` node (ADR 0040 (private) §1,
 * "Option A") — an `IQuestionDescriptor`-shaped node modeled on `telegram-question` (ask/wait/
 * resolve/branch) plus `call-ai-choice`'s per-option typed `data` (`optionDataTypes`). No
 * `contextFields`: unlike Telegram (which needs a bot/chat to address), a task's recipient is always
 * the project owner, resolved entirely by `backend`'s `TasksService` from `PROJECT_ID` — nothing the
 * compiled call needs to pass.
 */
export const humanTaskQuestion: IQuestionDescriptor = {
  name: HUMAN_TASK_NAME,
  label: 'tasks:question.humanTask',
  contextFields: [],
  questionFields: [
    { name: 'title', label: 'tasks:field.title', kind: 'template-string' },
    { name: 'description', label: 'tasks:field.description', kind: 'template-string' },
    { name: 'payload', label: 'tasks:field.payload', kind: 'expression', expectedType: anyType },
    { name: 'attachments', label: 'tasks:field.attachments', kind: 'expression', expectedType: fileArrayTypeInfo() },
    { name: 'timeout', label: 'tasks:field.timeout', kind: 'text' },
  ],
  // On expiry the node takes its automatic `timeout` branch (ADR §1's table) — added in the same
  // pass `telegram-question` itself adopted this (ADR §4, "Decisions" item 4).
  timeoutField: 'timeout',
  // Every option carries `{ label, dataType, prompt? }` instead of a bare `{ label }` (ADR §1) —
  // `void`/`string`/`number`/`boolean`, exactly like `call-ai-choice`'s per-option `dataType`.
  optionDataTypes: true,
  answerScope: { variableName: 'task', type: taskTypeInfo(), perOptionData: true },
  answerSignalName: HUMAN_TASK_ANSWER_SIGNAL_NAME,
  askActivitySignature: ASK_ACTIVITY_SIGNATURE,
  // Run journal (ADR 0059 (private)): the task as the owner will see it (title, text, options) — never the payload/attachments.
  journal: { kind: 'message-out', args: ['title', 'description', 'options'] },
  // TS source emitted verbatim into activities.ts — see `sharedActivityCode` below for the
  // `Context`/`tasksInternalRequest` this (and `humanTaskClose`) rely on.
  askActivityCode: [
    'export const humanTaskAsk = async (',
    '  title: string,',
    '  description: string,',
    '  payload: unknown,',
    '  attachments: readonly { id: string; name: string; size: number; mime: string; publicUrl?: string }[] | undefined,',
    '  options: string,',
    '): Promise<{ messageId: string }> => {',
    '  const info = Context.current().info;',
    '  const workflowExecution = info.workflowExecution;',
    '  if (!workflowExecution) {',
    "    throw new Error('humanTaskAsk must be called from within a workflow');",
    '  }',
    "  const response = await tasksInternalRequest('', {",
    '    workflowId: workflowExecution.workflowId,',
    '    runId: workflowExecution.runId,',
    '    taskQueue: info.taskQueue,',
    // `activityId` is stable across retries of this same scheduled ask activity (Temporal's own
    // scheduled-event id), so a retried call upserts the same row instead of creating a duplicate —
    // see the internal API's `UNIQUE (workflow_id, run_id, node_id)` contract.
    '    nodeId: info.activityId,',
    "    env: process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev',",
    '    title,',
    '    description,',
    '    payload,',
    '    attachments: attachments ?? [],',
    '    options: JSON.parse(options) as unknown[],',
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`humanTaskAsk: failed to create task: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { taskId: string };',
    '  return { messageId: data.taskId };',
    '};',
  ].join('\n'),
  resolveActivitySignature: RESOLVE_ACTIVITY_SIGNATURE,
  // No-op: by the time this compiled call runs, `TasksService.resolve` (ADR §2) has already marked
  // the task row `done` and signalled this very workflow with the answer — this activity exists only
  // because `question-emitters.ts` always calls a resolve activity after a real (non-timeout) answer
  // arrives, matching every other `IQuestionDescriptor`'s shape (e.g. `telegram-question`'s own
  // resolve, which does real work — stripping buttons — this one has none to do).
  resolveActivityCode: [
    'export const humanTaskResolve = async (_messageId: string, _answer: string): Promise<void> => {',
    '  // Intentionally empty — see the doc comment on `resolveActivitySignature` above.',
    '};',
  ].join('\n'),
  closeActivitySignature: CLOSE_ACTIVITY_SIGNATURE,
  closeActivityCode: [
    'export const humanTaskClose = async (messageId: string, reason: string): Promise<void> => {',
    '  const response = await tasksInternalRequest(`/${messageId}/close`, { status: reason });',
    '  if (!response.ok) {',
    '    throw new Error(`humanTaskClose: failed to close task ${messageId}: ${response.status} ${await response.text()}`);',
    '  }',
    '};',
  ].join('\n'),
  activityOptions: { kind: 'regular', startToCloseTimeout: '30 seconds' },
};

/**
 * A platform-owned vendor with no credentials and no triggers/actions — a task is always addressed
 * to the project owner, resolved entirely inside `backend`'s own `TasksService` (`registerBackend`
 * is unnecessary: there is no inbound ingress, `TasksService.resolve` signals the run directly — see
 * ADR §2's "`IIntegrationBackendContext` is therefore *not* used here at all").
 */
export const tasksIntegration: IWorkflowIntegration = {
  vendor: TASKS_VENDOR,
  label: 'tasks:label',
  notes:
    'Human-in-the-loop approval / manual review: pause the workflow and wait for the project owner to decide. ' +
    'Keywords: approval, human, manual review, sign-off, task, someone decides, owner, wait for a person, ' +
    'human task, approve, reject, confirm.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [],
  triggers: [],
  actions: [],
  types: [tasksTaskType],
  questions: [humanTaskQuestion],
  // Shared by `humanTaskAsk`/`humanTaskClose` — emitted once by `compileActivities`, see
  // `IWorkflowIntegration.sharedActivityCode`.
  sharedActivityCode: [
    "import { Context } from '@temporalio/activity';",
    '',
    '// Overridable so e2e tests can point this at a mock instead of the real backend — same',
    '// BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID contract every internal-API-calling',
    "// vendor uses (see @falang/workflow-integrations-files's own activity-helpers.ts).",
    'const tasksInternalRequest = async (path: string, body: unknown): Promise<Response> => {',
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    '  return fetch(`${backendUrl}/internal/tasks/${projectId}${path}`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    '    body: JSON.stringify(body),',
    '  });',
    '};',
  ].join('\n'),
};
