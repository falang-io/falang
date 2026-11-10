import { describe, expect, it } from 'vitest';
import { MESSENGER_CONVERSATIONS_DOCS_TOPIC } from '@falang/workflow-integrations-common';
import { buildDocsUrl, normalizeDocsBaseUrl, resolveDocsTopicUrl } from './docs-links.js';

describe('normalizeDocsBaseUrl', () => {
  it('trims and drops trailing slashes', () => {
    expect(normalizeDocsBaseUrl(' https://docs.example.com/ ')).toBe('https://docs.example.com');
    expect(normalizeDocsBaseUrl('https://example.com/docs//')).toBe('https://example.com/docs');
  });

  it('is null for empty, missing or non-http values', () => {
    expect(normalizeDocsBaseUrl(null)).toBeNull();
    expect(normalizeDocsBaseUrl('')).toBeNull();
    expect(normalizeDocsBaseUrl('docs.example.com')).toBeNull();
    expect(normalizeDocsBaseUrl('ftp://docs.example.com')).toBeNull();
  });
});

describe('buildDocsUrl', () => {
  it('joins with exactly one slash', () => {
    expect(buildDocsUrl('https://d.io')).toBe('https://d.io/');
    expect(buildDocsUrl('https://d.io', '/a/b/')).toBe('https://d.io/a/b/');
    expect(buildDocsUrl('https://d.io', 'a/b/#x')).toBe('https://d.io/a/b/#x');
  });
});

describe('resolveDocsTopicUrl', () => {
  it('uses the default community path', () => {
    expect(resolveDocsTopicUrl('https://d.io', MESSENGER_CONVERSATIONS_DOCS_TOPIC)).toBe(
      'https://d.io/workflow/bot-conversations/',
    );
  });

  it('prefers a host override', () => {
    expect(
      resolveDocsTopicUrl('https://d.io', MESSENGER_CONVERSATIONS_DOCS_TOPIC, {
        [MESSENGER_CONVERSATIONS_DOCS_TOPIC]: '/integrations/bot-dialogs/',
      }),
    ).toBe('https://d.io/integrations/bot-dialogs/');
  });

  it('gives no link without a host, a topic or a known path', () => {
    expect(resolveDocsTopicUrl(null, MESSENGER_CONVERSATIONS_DOCS_TOPIC)).toBeNull();
    expect(resolveDocsTopicUrl('https://d.io', null)).toBeNull();
    expect(resolveDocsTopicUrl('https://d.io', 'unknown-topic')).toBeNull();
  });
});
