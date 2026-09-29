import type { ITriggerDescriptor, IWorkflowIntegration } from './types.js';

/**
 * Keyword search over the vendor catalog, shared by every agent-facing catalog tool — the in-app agent's
 * `search_integrations` (`@falang/workflow-client-common`'s `integration-catalog.ts`) and the workflow
 * MCP server's `list_integrations` (`packages/workflow/backend`'s `mcp-workflow-tools.ts`), see
 * ADR 0034 (private)'s 2026-09-27 "token budget" notes. Only the ranking and the "nothing matched"/
 * "more matched" hints live here; how a matched vendor is described is up to each host.
 */

/** Max vendors one keyword search returns. */
export const SEARCH_INTEGRATIONS_LIMIT = 10;

/** `"ai telegram, bot"` or `["ai", "telegram bot"]` → `["ai", "telegram", "bot"]` (lowercased, deduplicated). */
export const normalizeKeywords = (input: unknown): string[] => {
  const raw = Array.isArray(input) ? input.filter((item) => typeof item === 'string') : [input];
  const words = raw
    .filter((item): item is string => typeof item === 'string')
    .flatMap((item) => item.toLowerCase().split(/[\s,;]+/))
    .filter(Boolean);
  return [...new Set(words)];
};

/** The node kinds a vendor adds to a function body (its triggers bind a trigger-function document instead). */
export const integrationNodeKindNames = (integration: IWorkflowIntegration): string[] => [
  ...integration.actions.map((action) => action.name),
  ...(integration.questions ?? []).map((question) => question.name),
  ...(integration.choices ?? []).map((choice) => choice.name),
];

// `label` is UI-display text (an `I18NStore` translation key for some vendors, e.g. Telegram's
// "telegram:trigger.onCommand" — meaningless with no `I18NStore` in scope) — never sent to an agent.
// `notes` is the one required, always-real-English description exposed instead; `contextFields` carries
// only what a tool call actually needs (`name`/`kind`), since `notes` is expected to explain each field's
// purpose in prose. See ADR 0034 (private)'s "third real chat" / "notes made mandatory" note.
export const describeTriggerForAgent = (trigger: ITriggerDescriptor) => ({
  contextFields: trigger.contextFields?.map((field) => ({ kind: field.kind, name: field.name })),
  name: trigger.name,
  notes: trigger.notes,
});

const vendorHaystack = (integration: IWorkflowIntegration): string =>
  [
    integration.vendor,
    integration.label,
    integration.notes,
    ...integrationNodeKindNames(integration),
    ...integration.triggers.flatMap((trigger) => [trigger.name, trigger.notes]),
  ]
    .join('\n')
    .toLowerCase();

export const NO_INTEGRATION_MATCH_NOTE =
  'No vendor matched. Try synonyms, category words (e.g. "llm", "crm", "marketplace", "payments") or the ' +
  'product name; call with no keywords for a compact list of every vendor. For a web service with no ' +
  'dedicated vendor, the "http-request" vendor can call any HTTP API.';

export interface IIntegrationSearchResult<TVendor> {
  readonly vendors: TVendor[];
  readonly note?: string;
}

/**
 * With keywords, the vendors matching at least one keyword (case-insensitive substring over vendor id,
 * notes, node kind names and trigger names/notes), most keywords matched first (catalog order breaks
 * ties), capped at `SEARCH_INTEGRATIONS_LIMIT`, each described by `describe`. With no keywords, a compact
 * index (`vendor` + `notes` only) of every vendor, so an agent can still browse without paying for every
 * vendor's actions/triggers/fields.
 */
export const searchIntegrationCatalog = <TVendor>(
  integrations: readonly IWorkflowIntegration[],
  keywordsInput: unknown,
  describe: (integration: IWorkflowIntegration) => TVendor,
): IIntegrationSearchResult<TVendor | { notes: string; vendor: string }> => {
  const keywords = normalizeKeywords(keywordsInput);
  if (keywords.length === 0) {
    return { vendors: integrations.map((integration) => ({ notes: integration.notes, vendor: integration.vendor })) };
  }
  const ranked = integrations
    .map((integration, order) => {
      const haystack = vendorHaystack(integration);
      return { integration, order, score: keywords.filter((keyword) => haystack.includes(keyword)).length };
    })
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || a.order - b.order);
  const vendors = ranked.slice(0, SEARCH_INTEGRATIONS_LIMIT).map((entry) => describe(entry.integration));
  if (vendors.length === 0) return { note: NO_INTEGRATION_MATCH_NOTE, vendors };
  return ranked.length > vendors.length
    ? { note: `${ranked.length - vendors.length} more vendors matched — use more specific keywords.`, vendors }
    : { vendors };
};
