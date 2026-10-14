import type { TVariableInfo } from '@falang/typescript-dto';
import type { IFieldConfig } from '@falang/workflow-integrations-common';

/**
 * The hidden prefix of an integration `expression` field. Shared by the block editor stores (live values) and the
 * background field descriptors (stored values) so the editor and the check can't disagree (ADR 0068 (private)).
 */

/** `expectedType` of a field, evaluated over the node's field values when it is a function. */
export const resolveExpectedType = (
  field: IFieldConfig,
  values: Readonly<Record<string, string>>,
): TVariableInfo | undefined =>
  typeof field.expectedType === 'function' ? field.expectedType(values) : field.expectedType;

/**
 * A field with no (resolved) `expectedType` gets the bare enclosing scope — any TS expression type-checks; one that
 * has it is forced to type-check against it (`buildForType` adds the hidden `_value = ` assignment).
 */
export const expressionFieldPrefix = (
  field: IFieldConfig,
  values: Readonly<Record<string, string>>,
  scopeCode: string,
  buildForType: (type: TVariableInfo) => string,
): string => {
  const resolvedType = resolveExpectedType(field, values);
  return resolvedType ? buildForType(resolvedType) : scopeCode;
};
