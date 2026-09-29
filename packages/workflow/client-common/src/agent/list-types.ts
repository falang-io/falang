import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { normalizeKeywords } from './integration-catalog.js';

export interface IProjectStructType {
  readonly documentId: string;
  readonly id: string;
  readonly name: string;
  readonly properties: Readonly<Record<string, TVariableInfo>>;
}

/** A vendor with at most this many (keyword-matching) types gets them in full, inline. */
export const LIST_TYPES_FULL_LIMIT = 5;
/** A vendor with at most this many (keyword-matching) types gets an `id`/`name` index; more → a count only. */
export const LIST_TYPES_INDEX_LIMIT = 50;

export interface IListTypesParams {
  /** The tool call's raw input — `{ keywords?, ids? }`. */
  readonly input: unknown;
  readonly integrations: readonly IWorkflowIntegration[];
  readonly projectTypes: readonly IProjectStructType[];
  /** See `getVendorsInUse` — only these vendors' types are listed (not looked up by `ids`, which is unrestricted). */
  readonly vendorsInUse: ReadonlySet<string>;
  /**
   * Struct types derived from the project's own configured integration instances (one `db:<instanceId>`
   * struct per synced table, say) — see `IWorkflowIntegration.instanceTypes`/ADR 0039 (private) §5.
   * Already scoped to instances that exist in the project (there's no "vendor in use" filter left to
   * apply — an instance existing *is* being in use), so these flow straight into the same keyword
   * match/full/index/count treatment `vendorTypes` gets below, just as one combined bucket instead of
   * one per vendor (no per-type vendor tag to group by). Defaults to `[]`.
   */
  readonly instanceTypes?: readonly IIntegrationStructType[];
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * `list_types` (ADR 0034 (private)'s 2026-09-27 "token budget" note). Vendor struct types range from 3
 * (Telegram) to ~2000 (МойСклад, ~1.1 MB of JSON) — listing them all, as the first version of this tool
 * did, would have blown the model's context outright. So: the project's own interfaces always in full
 * (they're few and exactly what the agent itself declared); vendor types only for vendors in use,
 * keyword-filtered by id/name, inline in full when few, as an `id`/`name` index when more, and as a bare
 * count past `LIST_TYPES_INDEX_LIMIT`; `ids` fetches exact full definitions from anywhere.
 */
export const listTypes = ({
  input,
  integrations,
  projectTypes,
  vendorsInUse,
  instanceTypes = [],
}: IListTypesParams) => {
  const params = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const vendorTypes = integrations.flatMap((integration) =>
    (integration.types ?? []).map((type) => ({
      id: type.id,
      name: type.name,
      properties: type.properties,
      vendor: integration.vendor,
    })),
  );

  const ids = asStringArray(params.ids);
  if (ids.length > 0) {
    const all = [...projectTypes, ...vendorTypes, ...instanceTypes];
    const types = ids.flatMap((id) => all.filter((type) => type.id === id));
    const notFound = ids.filter((id) => !all.some((type) => type.id === id));
    return notFound.length > 0 ? { notFound, types } : { types };
  }

  const keywords = normalizeKeywords(params.keywords);
  const matches = (type: { id: string; name: string }) =>
    keywords.length === 0 || keywords.some((keyword) => `${type.id}\n${type.name}`.toLowerCase().includes(keyword));

  const types: object[] = [...projectTypes];
  const typeIndex: { id: string; name: string; vendor?: string }[] = [];
  const notes: string[] = [];
  for (const integration of integrations) {
    if (!vendorsInUse.has(integration.vendor)) continue;
    const matching = vendorTypes.filter((type) => type.vendor === integration.vendor && matches(type));
    if (matching.length === 0) continue;
    if (matching.length <= LIST_TYPES_FULL_LIMIT) {
      types.push(...matching);
    } else if (matching.length <= LIST_TYPES_INDEX_LIMIT) {
      typeIndex.push(...matching.map(({ id, name, vendor }) => ({ id, name, vendor })));
    } else {
      notes.push(
        `Vendor "${integration.vendor}": ${matching.length} types${keywords.length > 0 ? ' match' : ''} — pass ` +
          '(more specific) keywords to list them.',
      );
    }
  }

  const matchingInstanceTypes = instanceTypes.filter((type) => matches(type));
  if (matchingInstanceTypes.length > 0) {
    if (matchingInstanceTypes.length <= LIST_TYPES_FULL_LIMIT) {
      types.push(...matchingInstanceTypes);
    } else if (matchingInstanceTypes.length <= LIST_TYPES_INDEX_LIMIT) {
      typeIndex.push(...matchingInstanceTypes.map(({ id, name }) => ({ id, name })));
    } else {
      notes.push(
        `Configured database instances: ${matchingInstanceTypes.length} types` +
          `${keywords.length > 0 ? ' match' : ''} — pass (more specific) keywords to list them.`,
      );
    }
  }

  return {
    types,
    ...(typeIndex.length > 0 ? { typeIndex } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
};
