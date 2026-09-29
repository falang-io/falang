import type { IWorkflowIntegration } from './types.js';

/** `namespace:dotted.path` — the shape of an `I18NStore` key a vendor puts in `label` (e.g.
 *  `telegram:action.sendMessage`); anything else is literal text already. */
const LABEL_KEY_PATTERN = /^([\w-]+):([\w-]+(?:\.[\w-]+)*)$/;

const identity = (text: string): string => text;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A resolver turning a vendor's `label` strings (its own, its actions'/fields'/questions'/choices') into
 * display text for an agent, outside any `I18NStore`: an i18n key is looked up in the vendor's own
 * `locales[language]` (English by default — agent-facing catalogs are English, like `notes`), anything
 * else — a literal label, a vendor without `locales`, a key its locale file lacks, a loader that throws —
 * comes back unchanged. ADR 0034 (private) flagged the raw keys (`openai:action.callAiText`) reaching the
 * MCP `list_integrations` catalog; this closes that without hand-writing a `notes` per action.
 */
export const loadIntegrationLabelResolver = async (
  integration: IWorkflowIntegration,
  language = 'en',
): Promise<(text: string) => string> => {
  const loader = integration.locales?.[language];
  if (!loader) return identity;
  const loaded = await loader().catch(() => null);
  if (!loaded) return identity;
  const resources: Record<string, unknown> = loaded.default;
  return (text) => {
    const match = LABEL_KEY_PATTERN.exec(text);
    if (!match) return text;
    const [, namespace = '', path = ''] = match;
    let current: unknown = resources[namespace];
    for (const part of path.split('.')) current = isRecord(current) ? current[part] : null;
    return typeof current === 'string' ? current : text;
  };
};
