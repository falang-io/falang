import { getGlobalI18n } from '@falang/scheme';
import type { IFieldDocsLink } from '@falang/workflow-scheme';
import { useClientExtensions } from '../extensions/client-extensions.js';
import { buildDocsUrl, DOCS_BASE_URL, resolveDocsTopicUrl } from './docs-links.js';

export interface IDocsLinks {
  /** The docs site's home page, or `null` when the build has no docs host. */
  readonly home: string | null;
  /** The page of a documentation topic (`IFieldConfig.docsTopic`), or `null`. */
  readonly topicUrl: (topic: string | null | undefined) => string | null;
  /** The `docs` prop of a field's `FieldLabel` for its `docsTopic`, or `null`. */
  readonly fieldDocs: (topic: string | null | undefined) => IFieldDocsLink | null;
}

/** Links into the documentation: `VITE_DOCS_URL` plus the host's `IClientExtensions.docsPaths`. */
export const useDocsLinks = (): IDocsLinks => {
  const { docsPaths } = useClientExtensions();
  const topicUrl = (topic: string | null | undefined): string | null =>
    resolveDocsTopicUrl(DOCS_BASE_URL, topic, docsPaths);
  return {
    home: DOCS_BASE_URL ? buildDocsUrl(DOCS_BASE_URL) : null,
    topicUrl,
    fieldDocs: (topic) => {
      const url = topicUrl(topic);
      return url ? { url, title: getGlobalI18n().t('client:docs.field-link') } : null;
    },
  };
};
