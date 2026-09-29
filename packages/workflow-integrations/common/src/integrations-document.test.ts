import { describe, expect, it } from 'vitest';
import type { IWorkflowIntegration } from './types.js';
import {
  buildIntegrationsDocumentConfig,
  buildIntegrationsDocumentSchema,
  INTEGRATIONS_DOCUMENT_TYPE,
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

describe('buildIntegrationsDocumentConfig', () => {
  it('is a pinned custom document config with an empty default', () => {
    const config = buildIntegrationsDocumentConfig([telegramIntegration]);
    expect(config.typeName).toBe(INTEGRATIONS_DOCUMENT_TYPE);
    expect(config.type).toBe('custom');
    expect(config.data).toEqual({ instances: [] });
  });
});
