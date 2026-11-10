import { MESSENGER_CONVERSATIONS_DOCS_TOPIC } from '@falang/workflow-integrations-common';

/** Re-exported so a host's `IClientExtensions.docsPaths` can key its map without depending on the vendor package. */
export { MESSENGER_CONVERSATIONS_DOCS_TOPIC };

/**
 * Page of each documentation topic (`IFieldConfig.docsTopic`) on the community docs site (`site/docs`; the en and ru
 * builds share paths). A host whose docs site is laid out differently overrides them with `IClientExtensions.docsPaths`.
 */
export const DEFAULT_DOCS_PATHS: Readonly<Record<string, string>> = {
  [MESSENGER_CONVERSATIONS_DOCS_TOPIC]: '/workflow/bot-conversations/',
};

/** `VITE_DOCS_URL` as set at build time: trimmed, without a trailing slash; `null` when empty or not an http(s) URL. */
export const normalizeDocsBaseUrl = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/]+/i.test(value) ? value : null;
};

/** Base URL plus a path (with or without its leading slash); the bare base gets a trailing slash. */
export const buildDocsUrl = (baseUrl: string, path = '/'): string => `${baseUrl}/${path.replace(/^\/+/, '')}`;

/** Link of a topic, or `null` without a docs host, a topic, or a known path for it. */
export const resolveDocsTopicUrl = (
  baseUrl: string | null,
  topic: string | null | undefined,
  overrides?: Readonly<Record<string, string>>,
): string | null => {
  if (!baseUrl || !topic) return null;
  const path = overrides?.[topic] ?? DEFAULT_DOCS_PATHS[topic];
  return path ? buildDocsUrl(baseUrl, path) : null;
};

/** The docs host this client was built with (`VITE_DOCS_URL`); `null` = no "?" buttons anywhere. */
export const DOCS_BASE_URL: string | null = normalizeDocsBaseUrl(import.meta.env?.VITE_DOCS_URL);
