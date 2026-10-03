// oxlint-disable max-lines -- over the default cap because of the new "credential-less vendor (implicit
// target)" describe block (ADR 0037 (private) §4), not accumulated complexity.
import { describe, expect, it, vi } from 'vitest';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationInstance } from '@falang/workflow-integrations-common';
import { WEBHOOK_TRIGGER_NAME, WEBHOOK_VENDOR } from '@falang/workflow-integrations-webhook';
import type { ITypeRegistryObjectItem, TypesRegistryStore } from '@falang/typescript-scheme';
import type { WorkflowDocument } from '../workflow-types.js';
import type { WorkflowStore } from '../workflow-store.js';
import { DocumentToolProvider } from './document-tool-provider.js';

const TELEGRAM_VENDOR = 'telegram';
const TELEGRAM_TRIGGER_NAME = 'telegram-trigger';

const call = (name: string, input: unknown) => ({ id: 'call-1', input, name });

const parseOk = (result: { ok: boolean; content?: string; error?: string }): Record<string, unknown> => {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return JSON.parse(result.content as string) as Record<string, unknown>;
};

/** Only `types` is read by `DocumentToolProvider` — a plain map stands in for the real MobX store, whose
 *  package index pulls in `monaco-editor` (needs `window`) and can't load in this plain-node environment. */
const fakeRegistry = (items: readonly ITypeRegistryObjectItem[] = []): TypesRegistryStore =>
  ({ types: new Map(items.map((item) => [item.id, item])) }) as unknown as TypesRegistryStore;

const SECTIONS = [
  { fixedKind: 'triggers', id: 'sec-triggers', name: 'Triggers', parentId: null },
  { fixedKind: 'functions', id: 'sec-functions', name: 'Functions', parentId: null },
  { fixedKind: 'types', id: 'sec-types', name: 'Types', parentId: null },
  { id: 'sub-tg', name: 'Telegram', parentId: 'sec-functions' },
];

const buildStore = (
  documents: readonly WorkflowDocument[] = [],
  typesRegistry = fakeRegistry(),
  folders: readonly object[] = [],
) => {
  const createDocument = vi.fn().mockReturnValue('new-doc-id');
  const createTriggerFunctionDocument = vi.fn().mockReturnValue('new-trigger-doc-id');
  const store = {
    createDocument,
    createTriggerFunctionDocument,
    documents,
    folders,
    typesRegistry,
  } as unknown as WorkflowStore;
  return { createDocument, createTriggerFunctionDocument, store };
};

const withTelegramCredential = (): readonly WorkflowDocument[] => {
  const instance: IIntegrationInstance = { fields: {}, id: 'cred-1', name: 'My bot', vendor: TELEGRAM_VENDOR };
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

describe('DocumentToolProvider', () => {
  it('create_document creates a function document and returns its id', () => {
    const { createDocument, store } = buildStore();
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(call('create_document', { name: 'myFunc', type: 'function' }));

    expect(createDocument).toHaveBeenCalledWith('function', 'myFunc', null);
    expect(parseOk(result)).toEqual({ documentId: 'new-doc-id' });
  });

  it('create_document and create_trigger_document reject a name already used by any document, case-insensitively', () => {
    const existing: WorkflowDocument = { folderId: null, id: 'd1', name: 'Order', type: 'objects-structure' };
    const { createDocument, createTriggerFunctionDocument, store } = buildStore([existing]);
    const provider = new DocumentToolProvider(store);

    const first = provider.execute(call('create_document', { name: 'order', type: 'function' }));
    expect(first).toMatchObject({ ok: false, error: expect.stringContaining('already exists') });
    const second = provider.execute(
      call('create_trigger_document', { name: 'order', triggerName: WEBHOOK_TRIGGER_NAME, vendor: WEBHOOK_VENDOR }),
    );
    expect(second).toMatchObject({ ok: false, error: expect.stringContaining('already exists') });
    expect(createDocument).not.toHaveBeenCalled();
    expect(createTriggerFunctionDocument).not.toHaveBeenCalled();
  });

  it('create_document rejects a function name that is not a camelCase English identifier', () => {
    const { createDocument, store } = buildStore();
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(call('create_document', { name: 'Мой бот', type: 'function' }));

    expect(result.ok).toBe(false);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('create_document creates an objects-structure document, passing folderId through', () => {
    const { createDocument, store } = buildStore([], fakeRegistry(), [
      ...SECTIONS,
      { id: 'f1', name: 'Models', parentId: 'sec-types' },
    ]);
    const provider = new DocumentToolProvider(store);

    provider.execute(call('create_document', { folderId: 'f1', name: 'My type', type: 'objects-structure' }));

    expect(createDocument).toHaveBeenCalledWith('objects-structure', 'My type', 'f1');
  });

  it('create_document defaults folderId to the type section root', () => {
    const { createDocument, store } = buildStore([], fakeRegistry(), SECTIONS);
    const provider = new DocumentToolProvider(store);

    provider.execute(call('create_document', { name: 'myFunc', type: 'function' }));
    provider.execute(call('create_document', { name: 'Shapes', type: 'objects-structure' }));

    expect(createDocument).toHaveBeenNthCalledWith(1, 'function', 'myFunc', 'sec-functions');
    expect(createDocument).toHaveBeenNthCalledWith(2, 'objects-structure', 'Shapes', 'sec-types');
  });

  it('create_document returns an error naming the right section for a folder outside the type section', () => {
    const { createDocument, store } = buildStore([], fakeRegistry(), SECTIONS);
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(
      call('create_document', { folderId: 'sec-types', name: 'myFunc', type: 'function' }),
    );
    const unknown = provider.execute(call('create_document', { folderId: 'nope', name: 'myFunc', type: 'function' }));

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain('Functions (id sec-functions)');
    expect(unknown.ok).toBe(false);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('create_trigger_document defaults to the Triggers section', () => {
    const { createTriggerFunctionDocument, store } = buildStore(withTelegramCredential(), fakeRegistry(), SECTIONS);
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(
      call('create_trigger_document', {
        credentialId: 'cred-1',
        name: 'onMessage',
        triggerName: TELEGRAM_TRIGGER_NAME,
        vendor: TELEGRAM_VENDOR,
      }),
    );

    expect(result.ok).toBe(true);
    expect(createTriggerFunctionDocument.mock.calls[0][2]).toBe('sec-triggers');
  });

  it('create_document tells the agent an objects-structure document only declares types and starts with placeholders', () => {
    const { store } = buildStore();
    const provider = new DocumentToolProvider(store);

    const result = parseOk(provider.execute(call('create_document', { name: 'GameTypes', type: 'objects-structure' })));

    expect(result.documentId).toBe('new-doc-id');
    expect(result.note).toContain('placeholder');
  });

  it('list_types lists project interfaces with their declaring document, plus types of vendors in use', () => {
    const registry = fakeRegistry([
      {
        id: 'thread-1',
        name: 'GameState',
        parentId: 'struct-root',
        properties: { score: { type: 'string' } },
        type: 'object',
      },
      { id: 'thread-x', name: 'Orphan', parentId: 'orphan-root', properties: {}, type: 'object' },
    ]);
    const structDoc: WorkflowDocument = {
      data: { id: 'struct-root', name: 'objects-structure', children: [] },
      folderId: null,
      id: 'struct-doc',
      name: 'GameTypes',
      type: 'objects-structure',
    };
    const { store } = buildStore([structDoc, ...withTelegramCredential()], registry);
    const provider = new DocumentToolProvider(store);

    const { types } = parseOk(provider.execute(call('list_types', {}))) as {
      types: { id: string; documentId?: string; vendor?: string }[];
    };

    expect(types).toContainEqual({
      documentId: 'struct-doc',
      id: 'thread-1',
      name: 'GameState',
      properties: { score: { type: 'string' } },
    });
    expect(types.some((type) => type.id === 'thread-x')).toBe(false);
    expect(types.some((type) => type.vendor === TELEGRAM_VENDOR)).toBe(true);
    // No instance of any big-catalog vendor (МойСклад, Ozon, …) — none of their types leak in. Every
    // credential-less vendor (`credentialFields: []`) counts as "in use" with no instance needed (see
    // ADR 0037 (private) §4) — `schedule` (`schedule/Fire`), `files`
    // (`files/File`, ADR 0038 (private)), `media`
    // (`media/MediaInfo`, ADR 0041 (private)), and `tasks`
    // (`tasks/Task`, ADR 0040 (private)) are the only four of those
    // that actually declare a struct type, so all four are expected here alongside Telegram.
    const ALWAYS_IN_USE_VENDORS = new Set([TELEGRAM_VENDOR, 'schedule', 'files', 'media', 'tasks']);
    expect(types.every((type) => !type.vendor || ALWAYS_IN_USE_VENDORS.has(type.vendor))).toBe(true);
  });

  it('create_document rejects an invalid type', () => {
    const { createDocument, store } = buildStore();
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(call('create_document', { name: 'x', type: 'trigger-function' }));

    expect(result.ok).toBe(false);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('create_trigger_document: happy path builds body data from the resolved descriptor', () => {
    const { createTriggerFunctionDocument, store } = buildStore(withTelegramCredential());
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(
      call('create_trigger_document', {
        credentialId: 'cred-1',
        name: 'onMessage',
        triggerName: TELEGRAM_TRIGGER_NAME,
        vendor: TELEGRAM_VENDOR,
      }),
    );

    expect(parseOk(result)).toEqual({ documentId: 'new-trigger-doc-id' });
    expect(createTriggerFunctionDocument).toHaveBeenCalledTimes(1);
    const [name, bodyData, folderId] = createTriggerFunctionDocument.mock.calls[0];
    expect(name).toBe('onMessage');
    expect(bodyData).toMatchObject({
      credentialId: 'cred-1',
      triggerName: TELEGRAM_TRIGGER_NAME,
      vendor: TELEGRAM_VENDOR,
    });
    expect(bodyData.scopeVariableName).toBeTruthy();
    expect(folderId).toBeNull();
  });

  it('create_trigger_document rejects a name that is not a camelCase English identifier', () => {
    const { createTriggerFunctionDocument, store } = buildStore(withTelegramCredential());
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(
      call('create_trigger_document', {
        credentialId: 'cred-1',
        name: 'Угадай личность',
        triggerName: TELEGRAM_TRIGGER_NAME,
        vendor: TELEGRAM_VENDOR,
      }),
    );

    expect(result.ok).toBe(false);
    expect(createTriggerFunctionDocument).not.toHaveBeenCalled();
  });

  it('create_trigger_document rejects an unknown vendor, without creating anything', () => {
    const { createTriggerFunctionDocument, store } = buildStore(withTelegramCredential());
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(
      call('create_trigger_document', {
        credentialId: 'cred-1',
        name: 'x',
        triggerName: TELEGRAM_TRIGGER_NAME,
        vendor: 'no-such-vendor',
      }),
    );

    expect(result.ok).toBe(false);
    expect(createTriggerFunctionDocument).not.toHaveBeenCalled();
  });

  it('create_trigger_document rejects an unknown triggerName for the vendor', () => {
    const { createTriggerFunctionDocument, store } = buildStore(withTelegramCredential());
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(
      call('create_trigger_document', {
        credentialId: 'cred-1',
        name: 'x',
        triggerName: 'no-such-trigger',
        vendor: TELEGRAM_VENDOR,
      }),
    );

    expect(result.ok).toBe(false);
    expect(createTriggerFunctionDocument).not.toHaveBeenCalled();
  });

  it('create_trigger_document rejects an unknown credentialId for the vendor', () => {
    const { createTriggerFunctionDocument, store } = buildStore(withTelegramCredential());
    const provider = new DocumentToolProvider(store);

    const result = provider.execute(
      call('create_trigger_document', {
        credentialId: 'no-such-credential',
        name: 'x',
        triggerName: TELEGRAM_TRIGGER_NAME,
        vendor: TELEGRAM_VENDOR,
      }),
    );

    expect(result.ok).toBe(false);
    expect(createTriggerFunctionDocument).not.toHaveBeenCalled();
  });

  // ADR 0037 (private) §4 — implicit targets for credential-less vendors.
  describe('create_trigger_document: credential-less vendor (implicit target)', () => {
    it('fills credentialId with the vendor id when omitted and the project has no explicit instance of it', () => {
      const { createTriggerFunctionDocument, store } = buildStore([]);
      const provider = new DocumentToolProvider(store);

      const result = provider.execute(
        call('create_trigger_document', {
          name: 'onRequest',
          triggerName: WEBHOOK_TRIGGER_NAME,
          vendor: WEBHOOK_VENDOR,
        }),
      );

      expect(parseOk(result)).toEqual({ documentId: 'new-trigger-doc-id' });
      const [, bodyData] = createTriggerFunctionDocument.mock.calls[0];
      expect(bodyData).toMatchObject({ credentialId: WEBHOOK_VENDOR, vendor: WEBHOOK_VENDOR });
    });

    it('accepts an explicitly-passed credentialId equal to the vendor id too', () => {
      const { createTriggerFunctionDocument, store } = buildStore([]);
      const provider = new DocumentToolProvider(store);

      provider.execute(
        call('create_trigger_document', {
          credentialId: WEBHOOK_VENDOR,
          name: 'onRequest',
          triggerName: WEBHOOK_TRIGGER_NAME,
          vendor: WEBHOOK_VENDOR,
        }),
      );

      expect(createTriggerFunctionDocument).toHaveBeenCalledTimes(1);
    });

    it('still requires an explicit credentialId once the project has an explicit instance of the vendor', () => {
      const webhookInstance: IIntegrationInstance = {
        fields: {},
        id: 'webhook-1',
        name: 'My webhook',
        vendor: WEBHOOK_VENDOR,
      };
      const documents: readonly WorkflowDocument[] = [
        {
          customData: { instances: [webhookInstance] },
          folderId: null,
          id: 'integrations-doc',
          name: 'integrations',
          pinned: true,
          type: INTEGRATIONS_DOCUMENT_TYPE,
        },
      ];
      const { createTriggerFunctionDocument, store } = buildStore(documents);
      const provider = new DocumentToolProvider(store);

      const result = provider.execute(
        call('create_trigger_document', {
          name: 'onRequest',
          triggerName: WEBHOOK_TRIGGER_NAME,
          vendor: WEBHOOK_VENDOR,
        }),
      );

      expect(result.ok).toBe(false);
      expect(createTriggerFunctionDocument).not.toHaveBeenCalled();

      const result2 = provider.execute(
        call('create_trigger_document', {
          credentialId: 'webhook-1',
          name: 'onRequest2',
          triggerName: WEBHOOK_TRIGGER_NAME,
          vendor: WEBHOOK_VENDOR,
        }),
      );
      expect(result2.ok).toBe(true);
    });
  });
});
