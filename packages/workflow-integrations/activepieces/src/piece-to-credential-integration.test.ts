import { describe, expect, it } from 'vitest';
import type { IActivepiecesPieceCatalogEntry } from './catalog-types.js';
import { pieceToCredentialIntegration } from './piece-to-credential-integration.js';

const catalogEntry = (overrides: Partial<IActivepiecesPieceCatalogEntry> = {}): IActivepiecesPieceCatalogEntry => ({
  pieceName: 'mock',
  displayName: 'Mock',
  auth: {
    type: 'CUSTOM_AUTH',
    displayName: 'Account',
    required: true,
    fields: [
      { name: 'workspace', kind: 'text', displayName: 'Workspace' },
      { name: 'apiKey', kind: 'secret', displayName: 'API key' },
    ],
  },
  actions: [],
  triggers: [],
  ...overrides,
});

describe('pieceToCredentialIntegration', () => {
  it('maps vendor and credentialFields straight from the catalog auth entry', () => {
    const integration = pieceToCredentialIntegration(catalogEntry());
    expect(integration.vendor).toBe('activepieces-mock');
    expect(integration.label).toBe('Mock');
    expect(integration.credentialFields).toEqual([
      { name: 'workspace', label: 'Workspace', kind: 'text' },
      { name: 'apiKey', label: 'API key', kind: 'secret' },
    ]);
  });

  it('passes hidden/secretProdOptional flags through into credentialFields, and the oauth2 config block', () => {
    const integration = pieceToCredentialIntegration(
      catalogEntry({
        auth: {
          type: 'OAUTH2',
          displayName: 'Account',
          required: true,
          fields: [
            { name: 'client_id', kind: 'text', displayName: 'Client ID' },
            {
              name: 'access_token',
              kind: 'secret',
              displayName: 'Access token',
              hidden: true,
              secretProdOptional: true,
            },
          ],
          oauth2: {
            authUrl: 'https://vendor.test/authorize',
            tokenUrl: 'https://vendor.test/token',
            scope: ['profile'],
            extra: { access_type: 'offline', prompt: 'consent' },
          },
        },
      }),
    );
    expect(integration.credentialFields).toEqual([
      { name: 'client_id', label: 'Client ID', kind: 'text' },
      { name: 'access_token', label: 'Access token', kind: 'secret', hidden: true, secretProdOptional: true },
    ]);
    expect(integration.oauth2).toEqual({
      authUrl: 'https://vendor.test/authorize',
      tokenUrl: 'https://vendor.test/token',
      scope: ['profile'],
      extra: { access_type: 'offline', prompt: 'consent' },
    });
  });

  it('has no credentialFields for a piece with no auth', () => {
    // oxlint-disable-next-line no-undefined -- `auth` is a required key typed `X | undefined` (a piece may genuinely have none); exercising that contract needs the literal value.
    const integration = pieceToCredentialIntegration(catalogEntry({ auth: undefined }));
    expect(integration.credentialFields).toEqual([]);
  });

  it('always maps actions to an empty array — activepieces-action is a generic node, not IActionDescriptor-based', () => {
    const integration = pieceToCredentialIntegration(
      catalogEntry({ actions: [{ name: 'create_item', displayName: 'Create item', description: '', props: [] }] }),
    );
    expect(integration.actions).toEqual([]);
  });

  it('maps each POLLING trigger to a vendor-qualified ITriggerDescriptor with scopeType any and downgraded text contextFields', () => {
    const integration = pieceToCredentialIntegration(
      catalogEntry({
        triggers: [
          {
            name: 'new_item',
            displayName: 'New item',
            description: '',
            props: [{ name: 'folder', type: 'SHORT_TEXT', displayName: 'Folder', required: false }],
          },
        ],
      }),
    );
    expect(integration.triggers).toEqual([
      {
        name: 'mock-new_item',
        label: 'New item',
        notes: expect.stringContaining('New item') as unknown as string,
        scopeType: { type: 'any' },
        scopeVariableName: 'item',
        signalName: 'mock-new_item',
        webhookPath: '/webhooks/activepieces-mock/:projectId/:credentialId/:env',
        contextFields: [{ name: 'folder', label: 'Folder', kind: 'text' }],
      },
    ]);
  });

  // `notes` is required on `ITriggerDescriptor` (no hand-written per-piece-trigger prose exists, or
  // ever could at this catalog's scale) — composed from the catalog's own real `displayName`/
  // `description` text instead of being left blank. See ADR 0034 (private)'s "third real chat" note.
  it("composes notes from the catalog trigger's own displayName/description, with or without a description", () => {
    const withDescription = pieceToCredentialIntegration(
      catalogEntry({
        triggers: [{ name: 'new_item', displayName: 'New item', description: 'Fires on a new item.', props: [] }],
      }),
    );
    expect(withDescription.triggers[0]?.notes).toContain('Fires on a new item.');
    expect(withDescription.triggers[0]?.notes).not.toMatch(/: {2}| {2}Payload/);

    const withoutDescription = pieceToCredentialIntegration(
      catalogEntry({ triggers: [{ name: 'new_item', displayName: 'New item', description: '', props: [] }] }),
    );
    expect(withoutDescription.triggers[0]?.notes).toContain('New item');
    expect(withoutDescription.triggers[0]?.notes).not.toMatch(/: {2}| {2}Payload/);
  });

  it('leaves contextFields undefined for a trigger with no props', () => {
    const integration = pieceToCredentialIntegration(
      catalogEntry({ triggers: [{ name: 'new_item', displayName: 'New item', description: '', props: [] }] }),
    );
    expect(integration.triggers[0]?.contextFields).toBeUndefined();
  });

  it('sets registerBackend only when the piece has at least one (POLLING) trigger', () => {
    expect(pieceToCredentialIntegration(catalogEntry({ triggers: [] })).registerBackend).toBeUndefined();
    const withTrigger = pieceToCredentialIntegration(
      catalogEntry({ triggers: [{ name: 'new_item', displayName: 'New item', description: '', props: [] }] }),
    );
    expect(withTrigger.registerBackend).toBeInstanceOf(Function);
  });
});
