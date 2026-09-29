import { describe, expect, it, vi } from 'vitest';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationInstance } from '@falang/workflow-integrations-common';
import type { WorkflowDocument } from '../workflow-types.js';
import type { WorkflowStore } from '../workflow-store.js';
import { IntegrationToolProvider } from './integration-tool-provider.js';

const TELEGRAM_VENDOR = 'telegram';

const call = (name: string, input: unknown) => ({ id: 'call-1', input, name });

const parseOk = (result: { ok: boolean; content?: string; error?: string }): unknown => {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return JSON.parse(result.content as string);
};

const withTelegramCredential = (): readonly WorkflowDocument[] => {
  const instance: IIntegrationInstance = {
    fields: { botToken: { dev: 'secret-dev', prod: 'secret-prod' } },
    id: 'cred-1',
    name: 'My bot',
    vendor: TELEGRAM_VENDOR,
  };
  return [
    {
      customData: { instances: [instance] },
      folderId: null,
      id: 'integrations-doc',
      name: 'integrations',
      pinned: true,
      type: INTEGRATIONS_DOCUMENT_TYPE,
    },
  ];
};

const buildStore = (documents: readonly WorkflowDocument[] = []) => {
  const saveIntegrationInstance = vi.fn();
  const store = { documents, saveIntegrationInstance } as unknown as WorkflowStore;
  return { saveIntegrationInstance, store };
};

describe('IntegrationToolProvider', () => {
  it('search_integrations finds vendors by keyword, with credential fields, triggers and node kinds', () => {
    const { store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    const { vendors } = parseOk(provider.execute(call('search_integrations', { keywords: ['telegram'] }))) as {
      vendors: { vendor: string; nodeKinds: string[]; triggers: { name: string }[] }[];
    };

    expect(vendors[0]?.vendor).toBe(TELEGRAM_VENDOR);
    expect(vendors[0]?.nodeKinds).toContain('telegram-question');
    expect(vendors[0]?.triggers.map((trigger) => trigger.name)).toContain('telegram-on-command-trigger');
  });

  it('list_integration_instances never includes field values/secrets', () => {
    const { store } = buildStore(withTelegramCredential());
    const provider = new IntegrationToolProvider(store);

    const instances = parseOk(provider.execute(call('list_integration_instances', {}))) as Record<string, unknown>[];

    expect(instances).toEqual([{ id: 'cred-1', name: 'My bot', vendor: TELEGRAM_VENDOR }]);
    expect(instances[0].fields).toBeUndefined();
  });

  it('create_integration_instance without fields creates every field blank (secrets as {dev:"",prod:""})', () => {
    const { saveIntegrationInstance, store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    const result = provider.execute(call('create_integration_instance', { name: 'My bot', vendor: TELEGRAM_VENDOR }));

    expect(parseOk(result)).toHaveProperty('instanceId');
    expect(saveIntegrationInstance).toHaveBeenCalledTimes(1);
    const saved = saveIntegrationInstance.mock.calls[0][0] as IIntegrationInstance;
    expect(saved.vendor).toBe(TELEGRAM_VENDOR);
    expect(saved.name).toBe('My bot');
    // Telegram's one credential field (`botToken`) is `kind: 'secret'` — blank means both dev/prod empty.
    expect(saved.fields).toEqual({ botToken: { dev: '', prod: '' } });
  });

  it('create_integration_instance with partial fields leaves the rest blank', () => {
    const { saveIntegrationInstance, store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    provider.execute(
      call('create_integration_instance', {
        fields: { botToken: { dev: 'partial-dev' } },
        name: 'My bot',
        vendor: TELEGRAM_VENDOR,
      }),
    );

    const saved = saveIntegrationInstance.mock.calls[0][0] as IIntegrationInstance;
    expect(saved.fields.botToken).toEqual({ dev: 'partial-dev', prod: '' });
  });

  it('create_integration_instance rejects an unknown vendor without saving', () => {
    const { saveIntegrationInstance, store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    const result = provider.execute(call('create_integration_instance', { name: 'x', vendor: 'no-such-vendor' }));

    expect(result.ok).toBe(false);
    expect(saveIntegrationInstance).not.toHaveBeenCalled();
  });
});
