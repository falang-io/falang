import type { IFieldConfig, IIntegrationInstance } from '@falang/workflow-integrations-common';

/** First configured instance of `vendor`, or `''` when the project has none. */
export const firstInstanceId = (instances: readonly IIntegrationInstance[], vendor: string | undefined): string =>
  instances.find((instance) => instance.vendor === vendor)?.id ?? '';

/**
 * Value an editor starts a field with: the stored one when non-empty, else — for a `credential-ref`
 * field — the first configured instance of the field's vendor (never overwrites a stored selection),
 * else the field's `defaultValue` (e.g. `'[]'` for an optional array expression).
 */
export const initialFieldValue = (
  field: IFieldConfig,
  stored: string | undefined,
  instances: readonly IIntegrationInstance[],
): string => {
  if (stored) return stored;
  if (field.kind === 'credential-ref') return firstInstanceId(instances, field.vendor);
  return field.defaultValue ?? '';
};
