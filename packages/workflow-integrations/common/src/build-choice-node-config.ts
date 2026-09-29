import { zod, type INodeConfig } from '@falang/dto';
import { variableInfoZod, type TVariableInfo } from '@falang/typescript-dto';
import { nanoid } from 'nanoid';
import { buildActionDataSchema } from './build-node-config.js';
import type { IChoiceDescriptor } from './types.js';

export interface IChoiceOption {
  readonly alias: string;
  readonly dataType: TVariableInfo;
  /**
   * Identifier the option's branch binds its (typed) picked data to — see `choice-emitters.ts`'s
   * `buildChoiceEmitter`. One name per choice node, not per option: `@falang/workflow-scheme`'s
   * `ChoiceEditorStore` exposes a single editable field and stamps the same value onto every
   * option here, since each option's branch is a mutually-exclusive `switch` case that only needs
   * its OWN copy for `getContainerScopeContribution` (`@falang/typescript-common`) to resolve
   * without looking past its immediate parent.
   */
  readonly variable: string;
}

/** Same index-signature-widened-to-`unknown` shape as `TQuestionHeaderData` — see its doc comment for why. */
export interface TChoiceHeaderData {
  readonly options: readonly IChoiceOption[];
  readonly [fieldName: string]: unknown;
}
export type IChoiceOptionData = IChoiceOption;

const DEFAULT_OPTIONS: readonly IChoiceOption[] = [
  { alias: 'Option 1', dataType: { type: 'string' }, variable: 'data' },
  { alias: 'Option 2', dataType: { type: 'string' }, variable: 'data' },
];

/** All header fields, in editor/UI order — `contextFields` (who/where) followed by `promptFields` (what). */
export const getChoiceHeaderFields = (descriptor: IChoiceDescriptor) => [
  ...descriptor.contextFields,
  ...descriptor.promptFields,
];

const choiceOptionDataSchema = zod.object({ alias: zod.string(), dataType: variableInfoZod, variable: zod.string() });

/**
 * A choice header's `data` is its descriptor's own fields (same field-driven schema
 * `IActionDescriptor` nodes use, see `buildActionDataSchema`) plus `options` — the alias+dataType
 * list the sidebar editor keeps in sync with this node's `<name>-option` children (see
 * `@falang/workflow-scheme`'s `ChoiceEditorStore`). `options` is the source of truth for the JSON
 * Schema sent to the AI activity; the children are the source of truth for the compiled branches.
 */
export const buildChoiceHeaderDataSchema = (descriptor: IChoiceDescriptor): zod.ZodType<TChoiceHeaderData> =>
  buildActionDataSchema(getChoiceHeaderFields(descriptor)).extend({
    options: zod.array(choiceOptionDataSchema),
  }) as unknown as zod.ZodType<TChoiceHeaderData>;

/**
 * Modeled on `buildQuestionNodeConfig` (`build-question-node-config.ts`) — a header node with a
 * fixed-name `<name>-option` child kind, factory-seeded with 2 default options.
 */
export const buildChoiceNodeConfig = (descriptor: IChoiceDescriptor): readonly INodeConfig[] => {
  const optionNodeName = `${descriptor.name}-option`;
  const dataSchema = buildChoiceHeaderDataSchema(descriptor);
  const defaultData = (): TChoiceHeaderData => ({
    ...Object.fromEntries(getChoiceHeaderFields(descriptor).map((field) => [field.name, ''])),
    options: DEFAULT_OPTIONS,
  });

  return [
    {
      name: descriptor.name,
      data: { type: dataSchema, default: defaultData },
      children: [optionNodeName],
      factory: () => ({
        id: nanoid(),
        name: descriptor.name,
        data: defaultData(),
        children: DEFAULT_OPTIONS.map((option) => ({
          id: nanoid(),
          name: optionNodeName,
          data: option satisfies IChoiceOptionData,
          children: [],
        })),
      }),
    },
    {
      name: optionNodeName,
      data: { type: choiceOptionDataSchema, default: () => DEFAULT_OPTIONS[0] },
      children: true,
      haveOut: true,
    },
  ] as const satisfies readonly INodeConfig[];
};

export const getChoiceNodeConfigs = (descriptors: readonly IChoiceDescriptor[]): readonly INodeConfig[] =>
  descriptors.flatMap((descriptor) => buildChoiceNodeConfig(descriptor));
