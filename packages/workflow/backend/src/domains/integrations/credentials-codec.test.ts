import type { IIntegrationsDocumentData, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import {
  encodeIntegrationsDataForWrite,
  maskIntegrationsDataForRead,
  mergeIntegrationsDataForRestore,
  resolveFieldValue,
  SECRET_MASK,
} from './credentials-codec.js';
import { decryptSecret, deriveEncryptionKey } from './credentials-crypto.js';

const botTokenField = { name: 'botToken', label: 'Bot Token', kind: 'secret' as const };

/** The fields every fake integration below leaves empty. */
const EMPTY_INTEGRATION_PARTS = { notes: '', triggers: [], actions: [] } as const;

const fakeIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  credentialFields: [{ name: 'botToken', label: 'Bot Token', kind: 'secret' }],
  ...EMPTY_INTEGRATION_PARTS,
};

const key = deriveEncryptionKey('test-key');

describe('encodeIntegrationsDataForWrite', () => {
  it('encrypts a new plaintext secret value', () => {
    const incoming: IIntegrationsDocumentData = {
      instances: [
        { id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'raw-dev-token', prod: '' } } },
      ],
    };

    const result = encodeIntegrationsDataForWrite(incoming, null, [fakeIntegration], key);

    const stored = result.instances[0]?.fields.botToken;
    if (typeof stored !== 'object') throw new Error('expected an environment value');
    expect(stored.dev).not.toBe('raw-dev-token');
    expect(decryptSecret(stored.dev, key)).toBe('raw-dev-token');
    expect(stored.prod).toBe('');
  });

  it('keeps the previously stored encrypted value when the client echoes back SECRET_MASK unchanged', () => {
    const previousEncrypted = encodeIntegrationsDataForWrite(
      {
        instances: [
          {
            id: 'cred-1',
            vendor: 'telegram',
            name: 'My Bot',
            fields: { botToken: { dev: 'original-token', prod: '' } },
          },
        ],
      },
      null,
      [fakeIntegration],
      key,
    );

    const resubmitted: IIntegrationsDocumentData = {
      instances: [
        {
          id: 'cred-1',
          vendor: 'telegram',
          name: 'My Bot (renamed)',
          fields: { botToken: { dev: SECRET_MASK, prod: '' } },
        },
      ],
    };

    const result = encodeIntegrationsDataForWrite(resubmitted, previousEncrypted, [fakeIntegration], key);

    const stored = result.instances[0]?.fields.botToken;
    if (typeof stored !== 'object') throw new Error('expected an environment value');
    expect(decryptSecret(stored.dev, key)).toBe('original-token');
  });

  it('replaces the stored value when the client submits a genuinely new value over an existing one', () => {
    const previousEncrypted = encodeIntegrationsDataForWrite(
      {
        instances: [
          { id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'old-token', prod: '' } } },
        ],
      },
      null,
      [fakeIntegration],
      key,
    );

    const resubmitted: IIntegrationsDocumentData = {
      instances: [
        { id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'new-token', prod: '' } } },
      ],
    };

    const result = encodeIntegrationsDataForWrite(resubmitted, previousEncrypted, [fakeIntegration], key);

    const stored = result.instances[0]?.fields.botToken;
    if (typeof stored !== 'object') throw new Error('expected an environment value');
    expect(decryptSecret(stored.dev, key)).toBe('new-token');
  });

  it('leaves an unrecognized vendor instance untouched', () => {
    const incoming: IIntegrationsDocumentData = {
      instances: [{ id: 'cred-1', vendor: 'slack', name: 'Slack', fields: { webhookUrl: 'https://example.com' } }],
    };

    const result = encodeIntegrationsDataForWrite(incoming, null, [fakeIntegration], key);

    expect(result).toEqual(incoming);
  });
});

describe('maskIntegrationsDataForRead', () => {
  it('replaces a configured secret value with SECRET_MASK', () => {
    const encoded = encodeIntegrationsDataForWrite(
      {
        instances: [
          { id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'a-real-token', prod: '' } } },
        ],
      },
      null,
      [fakeIntegration],
      key,
    );

    const masked = maskIntegrationsDataForRead(encoded, [fakeIntegration]);

    expect(masked.instances[0]?.fields.botToken).toEqual({ dev: SECRET_MASK, prod: '' });
  });

  it('never leaks ciphertext or ciphertext-shaped values to the read path', () => {
    const encoded = encodeIntegrationsDataForWrite(
      {
        instances: [
          {
            id: 'cred-1',
            vendor: 'telegram',
            name: 'My Bot',
            fields: { botToken: { dev: 'a-real-token', prod: 'another-token' } },
          },
        ],
      },
      null,
      [fakeIntegration],
      key,
    );

    const masked = maskIntegrationsDataForRead(encoded, [fakeIntegration]);
    const serialized = JSON.stringify(masked);

    expect(serialized).not.toContain('a-real-token');
    expect(serialized).not.toContain('another-token');
  });
});

describe('resolveFieldValue', () => {
  it('decrypts the requested env value of a secret field', () => {
    const encoded = encodeIntegrationsDataForWrite(
      {
        instances: [
          {
            id: 'cred-1',
            vendor: 'telegram',
            name: 'My Bot',
            fields: { botToken: { dev: 'dev-token', prod: 'prod-token' } },
          },
        ],
      },
      null,
      [fakeIntegration],
      key,
    );
    const instance = encoded.instances[0];
    if (!instance) throw new Error('expected an instance');

    expect(resolveFieldValue(instance, botTokenField, 'dev', key)).toBe('dev-token');
    expect(resolveFieldValue(instance, botTokenField, 'prod', key)).toBe('prod-token');
  });

  it('returns undefined when no value is configured for the requested env and the field requires prod', () => {
    const encoded = encodeIntegrationsDataForWrite(
      {
        instances: [
          { id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'dev-token', prod: '' } } },
        ],
      },
      null,
      [fakeIntegration],
      key,
    );
    const instance = encoded.instances[0];
    if (!instance) throw new Error('expected an instance');

    expect(resolveFieldValue(instance, botTokenField, 'prod', key)).toBeUndefined();
  });

  it('falls back to the dev value for prod when the field opts into secretProdOptional', () => {
    const optionalProdField = { name: 'apiKey', label: 'API Key', kind: 'secret' as const, secretProdOptional: true };
    const encoded = encodeIntegrationsDataForWrite(
      {
        instances: [
          { id: 'cred-1', vendor: 'openai', name: 'My OpenAI', fields: { apiKey: { dev: 'dev-key', prod: '' } } },
        ],
      },
      null,
      [{ vendor: 'openai', label: 'OpenAI', credentialFields: [optionalProdField], ...EMPTY_INTEGRATION_PARTS }],
      key,
    );
    const instance = encoded.instances[0];
    if (!instance) throw new Error('expected an instance');

    expect(resolveFieldValue(instance, optionalProdField, 'prod', key)).toBe('dev-key');
  });

  it('returns a plain (non-secret) field value verbatim, ignoring env', () => {
    const baseUrlField = { name: 'baseUrl', label: 'Base URL', kind: 'text' as const };
    const instance = {
      id: 'cred-1',
      vendor: 'openai',
      name: 'My OpenAI',
      fields: { baseUrl: 'https://api.openai.com/v1' },
    };

    expect(resolveFieldValue(instance, baseUrlField, 'dev', key)).toBe('https://api.openai.com/v1');
    expect(resolveFieldValue(instance, baseUrlField, 'prod', key)).toBe('https://api.openai.com/v1');
  });
});

describe('mergeIntegrationsDataForRestore', () => {
  const storedEncrypted = encodeIntegrationsDataForWrite(
    {
      instances: [
        { id: 'cred-1', vendor: 'telegram', name: 'Live Bot', fields: { botToken: { dev: 'live-token', prod: '' } } },
      ],
    },
    null,
    [fakeIntegration],
    key,
  );

  it('keeps the currently stored encrypted secret for an instance present in both the snapshot and the current document', () => {
    const snapshot: IIntegrationsDocumentData = {
      instances: [
        { id: 'cred-1', vendor: 'telegram', name: 'Renamed Bot', fields: { botToken: { dev: '', prod: '' } } },
      ],
    };

    const merged = mergeIntegrationsDataForRestore(snapshot, storedEncrypted, [fakeIntegration]);

    expect(merged.instances[0]).toMatchObject({ id: 'cred-1', name: 'Renamed Bot' });
    const mergedSecret = merged.instances[0]?.fields.botToken;
    if (typeof mergedSecret !== 'object') throw new Error('expected an environment value');
    expect(decryptSecret(mergedSecret.dev, key)).toBe('live-token');
  });

  it('gives an instance only present in the snapshot empty secrets — no current value to carry over', () => {
    const snapshot: IIntegrationsDocumentData = {
      instances: [
        {
          id: 'cred-2',
          vendor: 'telegram',
          name: 'Deleted-then-restored Bot',
          fields: { botToken: { dev: '', prod: '' } },
        },
      ],
    };

    const merged = mergeIntegrationsDataForRestore(snapshot, storedEncrypted, [fakeIntegration]);

    expect(merged.instances[0]?.fields.botToken).toEqual({ dev: '', prod: '' });
  });

  it('takes non-secret fields from the snapshot verbatim', () => {
    const baseUrlField = { name: 'baseUrl', label: 'Base URL', kind: 'text' as const };
    const integration: IWorkflowIntegration = {
      vendor: 'openai',
      label: 'OpenAI',
      credentialFields: [baseUrlField],
      ...EMPTY_INTEGRATION_PARTS,
    };
    const current: IIntegrationsDocumentData = {
      instances: [
        { id: 'cred-1', vendor: 'openai', name: 'My OpenAI', fields: { baseUrl: 'https://old.example.com' } },
      ],
    };
    const snapshot: IIntegrationsDocumentData = {
      instances: [
        { id: 'cred-1', vendor: 'openai', name: 'My OpenAI', fields: { baseUrl: 'https://snapshot.example.com' } },
      ],
    };

    const merged = mergeIntegrationsDataForRestore(snapshot, current, [integration]);

    expect(merged.instances[0]?.fields.baseUrl).toBe('https://snapshot.example.com');
  });
});
