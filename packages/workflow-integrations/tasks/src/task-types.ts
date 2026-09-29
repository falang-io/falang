import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import { TASK_TYPE_ID } from './constants.js';

/**
 * Bound as the `task` scope variable inside every `human-task-option` branch (`answerScope`, see
 * `tasks.integration.ts`) — the same struct as the compiled `<variableName>: <type>` declaration
 * `question-emitters.ts` emits. `resolvedBy`/`resolvedAt` come from the `humanTaskAnswer` signal
 * payload (see ADR 0040 (private)'s contract), which are always
 * present for a real answer (not the automatic timeout branch, which never binds `task` values from
 * a payload the way a real answer's branch does — see `question-emitters.ts`'s `afterWaitLines`,
 * which only reads `${prefix}Payload` after a genuine signal, not the timeout path).
 */
export interface ITaskRef {
  readonly id: string;
  readonly resolvedBy: string;
  readonly resolvedAt: string;
}

/** Registered into the editor's `TypesRegistryStore` via `IWorkflowIntegration.types`, same mechanism as Telegram's own struct types. */
export const tasksTaskType: IIntegrationStructType = {
  id: TASK_TYPE_ID,
  name: 'Task',
  properties: {
    id: { type: 'string' },
    resolvedBy: { type: 'string' },
    resolvedAt: { type: 'string' },
  },
};

/** `{ type: 'struct', id: 'tasks/Task' }` — `answerScope.type`. */
export const taskTypeInfo = (): TVariableInfo => ({ type: 'struct', id: TASK_TYPE_ID });
