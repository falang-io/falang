import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * Builds a `function` document's root node — header/body/footer, matching `functionCfg` in
 * `@falang/dto`. Used to seed document content directly through the backend API: the visual
 * scheme editor's canvas (drag/drop node placement) isn't driven by these tests — everything a
 * user can do through the project tree and toolbar (login, create/delete documents, Build & Run)
 * is driven through the real UI; only a function's *body statements* are seeded this way, since
 * automating canvas node placement is out of scope here. `returnValue` is only needed when the
 * body ends in a `return` node with an actual value (see `buildReturnNode`).
 */
export const buildFunctionNode = (id: string, bodyChildren: INode[] = [], returnValue?: TVariableInfo): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [], returnValue }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

export const buildReturnNode = (id: string, expression: string): INode => ({ id, name: 'return', data: expression });

export const buildLogNode = (id: string, message: string): INode => ({ id, name: 'log', data: message });

export const buildCallFunctionNode = (
  id: string,
  targetSchemeId: string,
  options: { parameters?: string[]; returnVariable?: string } = {},
): INode => ({
  id,
  name: 'call-function',
  data: {
    schemeId: targetSchemeId,
    parameters: options.parameters ?? [],
    returnVariable: options.returnVariable ?? '',
  },
});

export interface IHumanTaskOption {
  readonly label: string;
  readonly dataType: 'void' | 'string' | 'number' | 'boolean';
  /** The typed input's caption on the task page — only meaningful when `dataType !== 'void'`. */
  readonly prompt?: string;
  readonly children?: readonly INode[];
}

/**
 * `human-task` node (ADR 0040 (private) §1) — mirrors
 * `@falang/workflow-backend`'s own `test-utils/workflow-e2e-fixtures-tasks.ts` `buildHumanTaskNode`
 * (reimplemented here rather than imported across the package boundary, same reasoning this file's
 * other builders already follow — this package seeds documents through the same real API, not a
 * shared fixture module). No `timeout` support — `tasks-page.spec.ts` doesn't need it.
 */
export const buildHumanTaskNode = (
  id: string,
  fields: { readonly title: string; readonly description: string },
  options: readonly IHumanTaskOption[],
): INode => ({
  id,
  name: 'human-task',
  data: {
    title: fields.title,
    description: fields.description,
    payload: '',
    attachments: '',
    timeout: '',
    options: options.map((option) => option.label),
  },
  children: options.map((option, index) => ({
    id: `${id}-option-${index}`,
    name: 'human-task-option',
    data: { label: option.label, dataType: option.dataType, ...(option.prompt ? { prompt: option.prompt } : {}) },
    children: [...(option.children ?? [])],
  })),
});
