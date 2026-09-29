import { zod, type INodeConfig } from '@falang/dto';
import { nanoid } from 'nanoid';
import { buildActionDataSchema } from './build-node-config.js';
import type { IQuestionOptionDataWithType, TTaskOptionDataType } from './question-extensions.js';
import type { IQuestionDescriptor } from './types.js';

/**
 * A plain `Readonly<Record<string, string>>` (like `TIntegrationActionData`) can't also carry
 * `options: readonly string[]` — a string index signature and a differently-typed named property
 * are mutually exclusive types. The index signature is widened to `unknown` instead: every
 * declared field's value is still a plain `string` in practice (enforced by the zod schema,
 * `buildActionDataSchema`'s per-field `zod.string()`), but reading an arbitrary field name back out
 * needs a local cast (see `question-emitters.ts`/`QuestionEditorStore`) the same way any
 * `Record<string, unknown>` access would.
 */
export interface TQuestionHeaderData {
  readonly options: readonly string[];
  readonly [fieldName: string]: unknown;
}
export interface IQuestionOptionData {
  readonly label: string;
  /** Set only on the automatic `timeout` option a `timeoutField` descriptor adds — see `TIMEOUT_OPTION_LABEL`/`buildQuestionNodeConfig`. Never user-set, never deletable/renamable/reorderable (enforced by the sidebar editor, not this schema). */
  readonly fixed?: boolean;
}

const DEFAULT_OPTION_LABELS: readonly string[] = ['Вариант 1', 'Вариант 2'];

/** Label of the automatic option `timeoutField` adds — see `IQuestionDescriptorExtensions.timeoutField`. */
export const TIMEOUT_OPTION_LABEL = 'timeout';

/**
 * A question header's `data` is its descriptor's own fields (same field-driven schema `IActionDescriptor`
 * nodes use, see `buildActionDataSchema`) plus `options` — the button-label list the sidebar editor
 * keeps in sync with this node's `<name>-option` children (see `@falang/workflow-scheme`'s
 * `QuestionEditorStore`). `options` is the source of truth for what gets sent to the vendor's
 * ask-activity; the children are the source of truth for the compiled branches. The automatic
 * `timeout` option (when the descriptor sets `timeoutField`) is a child but never listed in
 * `options` — it isn't a real button.
 */
/** All header fields, in editor/UI order — `contextFields` (who/where) followed by `questionFields` (what). */
export const getQuestionHeaderFields = (descriptor: IQuestionDescriptor) => [
  ...descriptor.contextFields,
  ...descriptor.questionFields,
];

export const buildQuestionHeaderDataSchema = (descriptor: IQuestionDescriptor): zod.ZodType<TQuestionHeaderData> =>
  buildActionDataSchema(getQuestionHeaderFields(descriptor)).extend({
    options: zod.array(zod.string()),
  }) as unknown as zod.ZodType<TQuestionHeaderData>;

const TASK_OPTION_DATA_TYPES: readonly TTaskOptionDataType[] = ['void', 'string', 'number', 'boolean'];

const questionOptionDataSchema = zod.object({ label: zod.string(), fixed: zod.boolean().optional() });
const questionOptionWithTypeDataSchema = zod.object({
  label: zod.string(),
  dataType: zod.enum(TASK_OPTION_DATA_TYPES),
  prompt: zod.string().optional(),
  fixed: zod.boolean().optional(),
});

/**
 * Modeled on `switchCfg` (`@falang/dto`'s `nodes/switch.ts`) — a header node with a fixed-name
 * `<name>-option` child kind, factory-seeded with 2 default options — but the header carries a
 * richer, descriptor-driven `data` shape instead of a bare expression string, so it's built directly
 * rather than by calling `switchCfg`. Two extensions layer on top of that shape
 * (ADR 0040 (private) §4, `IQuestionDescriptorExtensions`): with
 * `optionDataTypes`, every option (default and user-added alike) carries `{ label, dataType, prompt? }`
 * instead of a bare `{ label }`; with `timeoutField`, the factory appends one extra, fixed
 * (`data.fixed: true`) option beyond the two/N regular ones, never counted in `options` and never
 * editable/deletable from the sidebar (see `@falang/workflow-scheme`'s `QuestionEditorStore`).
 */
export const buildQuestionNodeConfig = (descriptor: IQuestionDescriptor): readonly INodeConfig[] => {
  const optionNodeName = `${descriptor.name}-option`;
  const dataSchema = buildQuestionHeaderDataSchema(descriptor);
  const optionDataSchema = descriptor.optionDataTypes ? questionOptionWithTypeDataSchema : questionOptionDataSchema;
  const buildOptionData = (label: string): IQuestionOptionData | IQuestionOptionDataWithType =>
    descriptor.optionDataTypes ? { label, dataType: 'void' } : { label };
  const defaultData = (): TQuestionHeaderData => ({
    ...Object.fromEntries(getQuestionHeaderFields(descriptor).map((field) => [field.name, ''])),
    options: DEFAULT_OPTION_LABELS,
  });
  const buildDefaultChildren = () => [
    ...DEFAULT_OPTION_LABELS.map((label) => ({
      id: nanoid(),
      name: optionNodeName,
      data: buildOptionData(label),
      children: [],
    })),
    ...(descriptor.timeoutField
      ? [
          {
            id: nanoid(),
            name: optionNodeName,
            data: { ...buildOptionData(TIMEOUT_OPTION_LABEL), fixed: true },
            children: [],
          },
        ]
      : []),
  ];

  return [
    {
      name: descriptor.name,
      data: { type: dataSchema, default: defaultData },
      children: [optionNodeName],
      factory: () => ({
        id: nanoid(),
        name: descriptor.name,
        data: defaultData(),
        children: buildDefaultChildren(),
      }),
    },
    {
      name: optionNodeName,
      data: { type: optionDataSchema, default: () => buildOptionData(DEFAULT_OPTION_LABELS[0]) },
      children: true,
      haveOut: true,
    },
  ] as const satisfies readonly INodeConfig[];
};

export const getQuestionNodeConfigs = (descriptors: readonly IQuestionDescriptor[]): readonly INodeConfig[] =>
  descriptors.flatMap((descriptor) => buildQuestionNodeConfig(descriptor));
