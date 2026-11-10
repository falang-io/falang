import { describe, expect, it } from 'vitest';
import type { IWorkflowIntegration } from './types.js';
import {
  buildIntegrationsDocumentConfig,
  buildIntegrationsDocumentSchema,
  INTEGRATIONS_DOCUMENT_TYPE,
  supportsBuiltInProvider,
} from './integrations-document.js';

const telegramIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [
    { name: 'botToken', label: 'Bot Token', kind: 'secret' },
    { name: 'botUsername', label: 'Bot Username', kind: 'text' },
  ],
  triggers: [],
  actions: [],
};

describe('buildIntegrationsDocumentSchema', () => {
  it('requires dev/prod pair for secret fields and a plain string for others', () => {
    const schema = buildIntegrationsDocumentSchema([telegramIntegration]);
    const valid = schema.parse({
      instances: [
        {
          id: 'inst-1',
          vendor: 'telegram',
          name: 'My Bot',
          fields: { botToken: { dev: 'dev-token', prod: 'prod-token' }, botUsername: '@my_bot' },
        },
      ],
    });
    expect(valid.instances).toHaveLength(1);
  });

  it('rejects a secret field given a plain string instead of a dev/prod pair', () => {
    const schema = buildIntegrationsDocumentSchema([telegramIntegration]);
    expect(() =>
      schema.parse({
        instances: [
          {
            id: 'inst-1',
            vendor: 'telegram',
            name: 'My Bot',
            fields: { botToken: 'not-a-pair', botUsername: '@my_bot' },
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects an instance for an unregistered vendor', () => {
    const schema = buildIntegrationsDocumentSchema([telegramIntegration]);
    expect(() => schema.parse({ instances: [{ id: 'inst-1', vendor: 'slack', name: 'x', fields: {} }] })).toThrow();
  });

  it('accepts an empty instance list with no registered integrations', () => {
    const schema = buildIntegrationsDocumentSchema([]);
    expect(schema.parse({ instances: [] })).toEqual({ instances: [] });
  });
});

const aiIntegration: IWorkflowIntegration = {
  vendor: 'ai',
  label: 'AI',
  notes: 'Test vendor.',
  credentialFields: [
    { name: 'baseUrl', label: 'Base URL', kind: 'text' },
    { name: 'apiKey', label: 'API key', kind: 'secret' },
  ],
  builtInProvider: true,
  triggers: [],
  actions: [],
};

describe('platformProvider (ADR 0081)', () => {
  const schema = buildIntegrationsDocumentSchema([telegramIntegration, aiIntegration]);

  it('is accepted, with empty credential fields, on a vendor that declares builtInProvider', () => {
    const parsed = schema.parse({
      instances: [
        {
          id: 'ai-1',
          vendor: 'ai',
          name: 'Built-in',
          fields: { baseUrl: '', apiKey: { dev: '', prod: '' } },
          platformProvider: true,
        },
      ],
    });
    expect(parsed.instances[0]?.platformProvider).toBe(true);
  });

  it('is rejected on a vendor without builtInProvider', () => {
    expect(() =>
      schema.parse({
        instances: [
          {
            id: 'tg-1',
            vendor: 'telegram',
            name: 'Bot',
            fields: { botToken: { dev: '', prod: '' }, botUsername: '' },
            platformProvider: true,
          },
        ],
      }),
    ).toThrow();
  });

  it('only accepts the literal true', () => {
    expect(() =>
      schema.parse({
        instances: [
          {
            id: 'ai-1',
            vendor: 'ai',
            name: 'x',
            fields: { baseUrl: '', apiKey: { dev: '', prod: '' } },
            platformProvider: 'yes',
          },
        ],
      }),
    ).toThrow();
  });

  it('supportsBuiltInProvider reads the marker', () => {
    expect(supportsBuiltInProvider(aiIntegration)).toBe(true);
    expect(supportsBuiltInProvider(telegramIntegration)).toBe(false);
  });
});

describe('buildIntegrationsDocumentConfig', () => {
  it('is a pinned custom document config with an empty default', () => {
    const config = buildIntegrationsDocumentConfig([telegramIntegration]);
    expect(config.typeName).toBe(INTEGRATIONS_DOCUMENT_TYPE);
    expect(config.type).toBe('custom');
    expect(config.data).toEqual({ instances: [] });
  });
});
