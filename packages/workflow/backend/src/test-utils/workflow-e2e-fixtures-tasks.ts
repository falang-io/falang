import type { INode } from '@falang/dto';

/**
 * `human-task` node builder — see `@falang/workflow-integrations-tasks`'s `tasks.integration.ts`
 * and ADR 0040 (private) §1/§4. Mirrors the exact shape
 * `compile-human-task.test.ts` builds by hand: `data.options` is the plain button-label list (never
 * includes the automatic `timeout` option — see `build-question-node-config.ts`'s own doc comment),
 * and every `human-task-option` child (including the automatic, fixed `timeout` one) carries
 * `{ label, dataType, prompt? }`. Split out from `workflow-e2e-fixtures.ts` to stay under this
 * repo's 300-line-per-file lint cap (see CLAUDE.md's "Conventions").
 */
export type THumanTaskOptionDataType = 'void' | 'string' | 'number' | 'boolean';

export interface IHumanTaskOption {
  readonly label: string;
  readonly dataType: THumanTaskOptionDataType;
  /** The typed input's caption on the task page — only meaningful when `dataType !== 'void'`. */
  readonly prompt?: string;
  readonly children?: readonly INode[];
}

export interface IHumanTaskFields {
  readonly title: string;
  readonly description: string;
  /** Raw expression code, `expectedType: any` — e.g. `'{ amount: 100 }'`. Blank compiles to `undefined`. */
  readonly payload?: string;
  /** Raw expression code, `expectedType: File[]`. Blank compiles to `undefined`. */
  readonly attachments?: string;
  /** Duration text (`'3s'`/`'48h'`/…) — non-empty adds the automatic, mandatory `timeout` branch (see `timeoutChildren`). Blank means "wait forever". */
  readonly timeout?: string;
  /** Children of the automatic `timeout` branch — only meaningful when `fields.timeout` is non-empty; a hand-built import fixture has to supply this branch itself, unlike the sidebar editor's factory (`buildQuestionNodeConfig`), which adds the option node but not its children. */
  readonly timeoutChildren?: readonly INode[];
}

/** `human-task` node — one `human-task-option` child per entry of `options`, plus (when `fields.timeout` is set) one more, fixed, non-user-visible `timeout` option. */
export const buildHumanTaskNode = (
  id: string,
  fields: IHumanTaskFields,
  options: readonly IHumanTaskOption[],
): INode => {
  const optionChildren: INode[] = options.map((option, index) => ({
    id: `${id}-option-${index}`,
    name: 'human-task-option',
    data: {
      label: option.label,
      dataType: option.dataType,
      ...(option.prompt ? { prompt: option.prompt } : {}),
    },
    children: [...(option.children ?? [])],
  }));
  if (fields.timeout) {
    optionChildren.push({
      id: `${id}-timeout`,
      name: 'human-task-option',
      data: { label: 'timeout', dataType: 'void', fixed: true },
      children: [...(fields.timeoutChildren ?? [])],
    });
  }
  return {
    id,
    name: 'human-task',
    data: {
      title: fields.title,
      description: fields.description,
      payload: fields.payload ?? '',
      attachments: fields.attachments ?? '',
      timeout: fields.timeout ?? '',
      options: options.map((option) => option.label),
    },
    children: optionChildren,
  };
};
