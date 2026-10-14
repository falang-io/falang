import type { NodeStore } from '@falang/scheme';
import {
  buildForcedTypePrefix,
  buildNodeScopeCode,
  identifierField,
  templateField,
  type ICheckedField,
  type IFieldCheckContext,
} from '@falang/typescript-scheme';
import type { IFieldConfig, IIntegrationInstance } from '@falang/workflow-integrations-common';
import { initialFieldValue } from '../registry/initial-field-value.js';
import { expressionFieldPrefix } from './expression-field-prefix.js';

type TRecord = Record<string, unknown>;

export const recordOf = (value: unknown): TRecord =>
  value !== null && typeof value === 'object' ? (value as TRecord) : {};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Every field's value the way an editor store starts it: the stored one, else a `credential-ref`'s first instance,
 * else the field's `defaultValue`. A function `expectedType` reads this snapshot.
 */
export const storedFieldValues = (
  fields: readonly IFieldConfig[],
  data: TRecord,
  instances: readonly IIntegrationInstance[],
): Record<string, string> =>
  Object.fromEntries(fields.map((field) => [field.name, initialFieldValue(field, text(data[field.name]), instances)]));

/**
 * A field that declares a `defaultValue` is optional: the editor fills it in, and when the default itself is empty an
 * empty value is legitimate, so it isn't checked. A field without one is checked as it stands.
 */
const isOptional = (field: IFieldConfig): boolean => typeof field.defaultValue === 'string';

/**
 * The checked fields of a descriptor-driven node (an integration action, or a question/choice header): `expression`
 * fields (typed by `expectedType` when set), `template-string` fields and `new-variable` fields. Other kinds
 * (`text`/`select`/`secret`/`credential-ref`/…) hold no code.
 */
export const describeIntegrationFields = (
  node: NodeStore,
  ctx: IFieldCheckContext,
  fields: readonly IFieldConfig[],
  data: unknown,
  instances: readonly IIntegrationInstance[],
): ICheckedField[] => {
  const values = storedFieldValues(fields, recordOf(data), instances);
  const result: ICheckedField[] = [];
  for (const field of fields) {
    const value = values[field.name];
    const allowEmpty = isOptional(field);
    if (field.kind === 'expression') {
      result.push({
        field: field.name,
        kind: 'code',
        prefix: expressionFieldPrefix(field, values, buildNodeScopeCode(node, ctx.projectService), (type) =>
          buildForcedTypePrefix(node, ctx.projectService, type),
        ),
        value,
        suffix: '',
        allowEmpty,
      });
    } else if (field.kind === 'template-string') {
      result.push({ ...templateField(node, ctx, field.name, value), allowEmpty } as ICheckedField);
    } else if (field.kind === 'new-variable') {
      if (allowEmpty && value.trim() === '') continue;
      result.push(identifierField(node, ctx, field.name, value));
    }
  }
  return result;
};
