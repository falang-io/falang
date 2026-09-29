import { container as diContainer } from '@falang/di';
import { ACTIVEPIECES_ACTION_NAME, type TActivepiecesActionData } from '@falang/workflow-dto';
import type { IActivepiecesPieceCatalogEntry } from '@falang/workflow-integrations-activepieces';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import {
  TOKEN_ACTIVEPIECES_CATALOG_PROVIDER,
  TOKEN_ACTIVEPIECES_PICKER,
  TOKEN_CREDENTIALS_PROVIDER,
} from '../../registry/di-tokens.js';
import { ActivepiecesPickerModule } from './activepieces-picker.module.js';

const catalog: readonly IActivepiecesPieceCatalogEntry[] = [
  {
    pieceName: 'slack',
    displayName: 'Slack',
    actions: [{ name: 'send-message', displayName: 'Send message', description: '', props: [] }],
  },
  {
    pieceName: 'github',
    displayName: 'GitHub',
    actions: [{ name: 'create-issue', displayName: 'Create issue', description: '', props: [] }],
  },
  // `auth` (required key, `X | undefined`-typed) intentionally omitted rather than set to a literal
  // `undefined` (oxlint's `no-undefined`) — the cast reads it back as `undefined`, same as writing it out.
] as unknown as readonly IActivepiecesPieceCatalogEntry[];

const configuredInstances: readonly IIntegrationInstance[] = [
  { id: 'cred-1', vendor: 'activepieces-slack', name: 'My Slack', fields: {} },
];

/** Minimal fake `Scheme` — enough for `ActivepiecesPickerStore`'s DI resolution and `ActivepiecesPickerModule`'s wiring, same lightweight-fake style `integrations.module.test.ts` uses. */
const buildFakeScheme = () => {
  const container = diContainer.createChildContainer();
  container.register(TOKEN_ACTIVEPIECES_CATALOG_PROVIDER, { useValue: { getPieces: () => Promise.resolve(catalog) } });
  container.register(TOKEN_CREDENTIALS_PROVIDER, { useValue: { getInstances: () => configuredInstances } });
  const registeredListeners: ((payload: unknown) => boolean)[] = [];
  const scheme = {
    container,
    commands: {
      registerCommand: vi.fn((_command: unknown, listener: (payload: unknown) => boolean) => {
        registeredListeners.push(listener);
      }),
      dispatchCommand: vi.fn(),
    },
    extraView: { registerCoreSchemeLayer: vi.fn() },
    infra: {
      structure: {
        factory: vi.fn((name: string) => ({
          id: 'new-node-id',
          name,
          data: { pieceName: '', actionName: '', credentialId: '', propsValue: {} } satisfies TActivepiecesActionData,
        })),
      },
    },
  };
  return { scheme, registeredListeners };
};

describe('ActivepiecesPickerModule', () => {
  it('vetoes CMD_INSERT_NODE for a fresh activepieces-action node and opens the picker', async () => {
    const { scheme, registeredListeners } = buildFakeScheme();
    // oxlint-disable-next-line no-explicit-any
    new ActivepiecesPickerModule().initialize(scheme as any);
    const insertListener = registeredListeners[0];

    const vetoed = insertListener({
      index: 0,
      parentId: 'body-1',
      node: {
        id: 'n1',
        name: ACTIVEPIECES_ACTION_NAME,
        data: { pieceName: '', actionName: '', credentialId: '', propsValue: {} },
      },
    });
    expect(vetoed).toBe(true);

    // oxlint-disable-next-line no-explicit-any
    const store = scheme.container.resolve(TOKEN_ACTIVEPIECES_PICKER as any) as any;
    expect(store.opened).toBe(true);
    await vi.waitFor(() => expect(store.catalogLoading).toBe(false));
    // Only `slack` has a configured credential instance (`activepieces-slack`) — `github` is filtered out.
    expect(store.options).toEqual([
      { value: 'slack::send-message', label: 'Slack: Send message', pieceName: 'slack', actionName: 'send-message' },
    ]);
  });

  it('lets an already-resolved node through (no veto)', () => {
    const { scheme, registeredListeners } = buildFakeScheme();
    // oxlint-disable-next-line no-explicit-any
    new ActivepiecesPickerModule().initialize(scheme as any);
    const insertListener = registeredListeners[0];

    const vetoed = insertListener({
      index: 0,
      parentId: 'body-1',
      node: {
        id: 'n1',
        name: ACTIVEPIECES_ACTION_NAME,
        data: { pieceName: 'slack', actionName: 'send-message', credentialId: '', propsValue: {} },
      },
    });
    expect(vetoed).toBe(false);
  });

  it('ignores other node kinds', () => {
    const { scheme, registeredListeners } = buildFakeScheme();
    // oxlint-disable-next-line no-explicit-any
    new ActivepiecesPickerModule().initialize(scheme as any);
    const insertListener = registeredListeners[0];

    const vetoed = insertListener({ index: 0, parentId: 'body-1', node: { id: 'n1', name: 'action', data: '' } });
    expect(vetoed).toBe(false);
  });

  it('confirm() re-dispatches CMD_INSERT_NODE with the picked piece/action and closes the picker', async () => {
    const { scheme, registeredListeners } = buildFakeScheme();
    // oxlint-disable-next-line no-explicit-any
    new ActivepiecesPickerModule().initialize(scheme as any);
    const insertListener = registeredListeners[0];
    insertListener({
      index: 2,
      parentId: 'body-1',
      node: {
        id: 'n1',
        name: ACTIVEPIECES_ACTION_NAME,
        data: { pieceName: '', actionName: '', credentialId: '', propsValue: {} },
      },
    });

    // oxlint-disable-next-line no-explicit-any
    const store = scheme.container.resolve(TOKEN_ACTIVEPIECES_PICKER as any) as any;
    await vi.waitFor(() => expect(store.catalogLoading).toBe(false));
    store.select('slack::send-message');
    store.confirm();

    expect(scheme.commands.dispatchCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        index: 2,
        parentId: 'body-1',
        node: expect.objectContaining({
          data: { pieceName: 'slack', actionName: 'send-message', credentialId: '', propsValue: {} },
        }),
      }),
    );
    expect(store.opened).toBe(false);
  });
});
