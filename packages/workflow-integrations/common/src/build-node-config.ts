import { zod, type IDataInfo, type INodeConfig } from '@falang/dto';
import { describeFieldForAgent } from './describe-field.js';
import type { IActionDescriptor, IFieldConfig, ITriggerDescriptor, IWorkflowIntegration } from './types.js';

export type TIntegrationActionData = Readonly<Record<string, string>>;

export const defaultFieldValue = (field: IFieldConfig): string => field.defaultValue ?? '';

type TFieldSchema = zod.ZodString | zod.ZodDefault<zod.ZodString>;

/**
 * Every field is a string and required — except a field that declares an explicit `defaultValue`:
 * missing from stored data, it parses to that value. That is how a field added to an existing action
 * later stays compatible with nodes saved before it existed (e.g. amoCRM's create-lead gaining its
 * optional pipeline/status/extra fields), without loosening the fields an agent must always fill.
 */
export const buildActionDataSchema = (fields: readonly IFieldConfig[]): zod.ZodObject<Record<string, TFieldSchema>> => {
  const shape: Record<string, TFieldSchema> = {};
  for (const field of fields) {
    const schema = zod.string().describe(describeFieldForAgent(field));
    shape[field.name] = typeof field.defaultValue === 'string' ? schema.default(field.defaultValue) : schema;
  }
  return zod.object(shape);
};

/**
 * Every action node kind shares this one generator — the zod `data` schema and default value come
 * straight from `IActionDescriptor.fields` instead of a hand-written DTO file per action, per ADR 0006.
 */
export const buildActionNodeConfig = (action: IActionDescriptor): INodeConfig => {
  const data: IDataInfo<zod.ZodType<TIntegrationActionData>> = {
    type: buildActionDataSchema(action.fields),
    default: () => Object.fromEntries(action.fields.map((field) => [field.name, defaultFieldValue(field)])),
  };
  return { name: action.name, data } satisfies INodeConfig;
};

/**
 * Trigger nodes carry no editable `data` — their payload shape (`scopeType`) is fixed by the vendor,
 * not entered by the user (see ADR 0006's `trigger-function` section).
 */
export const buildTriggerNodeConfig = (trigger: ITriggerDescriptor): INodeConfig =>
  ({ name: trigger.name }) satisfies INodeConfig;

export const getIntegrationNodeConfigs = (integrations: readonly IWorkflowIntegration[]): readonly INodeConfig[] =>
  integrations.flatMap((integration) => [
    ...integration.triggers.map(buildTriggerNodeConfig),
    ...integration.actions.map(buildActionNodeConfig),
  ]);
