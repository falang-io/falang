import { describe, expect, it } from 'vitest';
import { createAction, createPiece, createTrigger, PieceAuth, Property } from '@activepieces/pieces-framework';
import { TriggerStrategy } from '@activepieces/shared';
import { normalizePiece } from './normalize.js';

/**
 * `normalizePiece` is a pure projection of a `Piece` — every fixture here is a throwaway
 * `createPiece()` built with the real `@activepieces/pieces-framework` API, never routed through
 * `PIECES_REGISTRY`. This covers the auth/property/trigger-strategy diversity the real allow-listed
 * pieces (`resend`, `wordpress`, `mock`) only exercise a slice of each — see
 * ADR 0014 (private).
 */

const noopAction = createAction({
  name: 'noop',
  displayName: 'Noop',
  description: 'test fixture',
  props: {},
  run: async () => undefined,
});

describe('normalizePiece: auth kinds', () => {
  it('maps SecretText auth to one secret field', () => {
    const piece = createPiece({
      displayName: 'Secret piece',
      logoUrl: '',
      authors: [],
      auth: PieceAuth.SecretText({ displayName: 'API key', required: true }),
      actions: [noopAction],
      triggers: [],
    });
    const normalized = normalizePiece('secret', piece);
    expect(normalized.auth).toEqual({
      type: 'SECRET_TEXT',
      displayName: 'API key',
      required: true,
      fields: [{ name: 'secret_text', kind: 'secret', displayName: 'API key' }],
    });
  });

  it('maps BasicAuth to a username text field and a password secret field', () => {
    const piece = createPiece({
      displayName: 'Basic piece',
      logoUrl: '',
      authors: [],
      auth: PieceAuth.BasicAuth({
        displayName: 'Login',
        required: true,
        username: { displayName: 'User' },
        password: { displayName: 'Pass' },
      }),
      actions: [noopAction],
      triggers: [],
    });
    const normalized = normalizePiece('basic', piece);
    expect(normalized.auth?.fields).toEqual([
      { name: 'username', kind: 'text', displayName: 'User' },
      { name: 'password', kind: 'secret', displayName: 'Pass' },
    ]);
  });

  it('maps CustomAuth sub-props by their own type — SecretText sub-props become secret, everything else text', () => {
    const piece = createPiece({
      displayName: 'Custom piece',
      logoUrl: '',
      authors: [],
      auth: PieceAuth.CustomAuth({
        displayName: 'Account',
        required: true,
        props: {
          workspace: Property.ShortText({ displayName: 'Workspace', required: true }),
          apiKey: PieceAuth.SecretText({ displayName: 'API key', required: true }),
        },
      }),
      actions: [noopAction],
      triggers: [],
    });
    const normalized = normalizePiece('custom', piece);
    expect(normalized.auth?.fields).toEqual([
      { name: 'workspace', kind: 'text', displayName: 'Workspace' },
      { name: 'apiKey', kind: 'secret', displayName: 'API key' },
    ]);
  });

  it('maps OAuth2 to client_id/client_secret + config-side props + hidden token fields, plus an oauth2 config block', () => {
    const piece = createPiece({
      displayName: 'OAuth2 piece',
      logoUrl: '',
      authors: [],
      auth: PieceAuth.OAuth2({
        displayName: 'Account',
        required: true,
        authUrl: 'https://vendor.test/authorize',
        tokenUrl: 'https://vendor.test/token',
        scope: ['profile', 'email'],
        pkce: true,
        pkceMethod: 'S256',
        props: {
          instanceUrl: Property.ShortText({ displayName: 'Instance URL', required: true }),
        },
      }),
      actions: [noopAction],
      triggers: [],
    });
    const normalized = normalizePiece('oauth', piece);
    expect(normalized.auth?.fields).toEqual([
      { name: 'client_id', kind: 'text', displayName: 'Client ID' },
      { name: 'client_secret', kind: 'secret', displayName: 'Client secret', secretProdOptional: true },
      { name: 'instanceUrl', kind: 'text', displayName: 'Instance URL' },
      { name: 'access_token', kind: 'secret', displayName: 'Access token', hidden: true, secretProdOptional: true },
      { name: 'refresh_token', kind: 'secret', displayName: 'Refresh token', hidden: true, secretProdOptional: true },
      { name: 'expires_at', kind: 'text', displayName: 'Expires at', hidden: true },
      { name: 'oauth_data', kind: 'text', displayName: 'OAuth data', hidden: true },
    ]);
    expect(normalized.auth?.oauth2).toEqual({
      authUrl: 'https://vendor.test/authorize',
      tokenUrl: 'https://vendor.test/token',
      scope: ['profile', 'email'],
      pkce: true,
      pkceMethod: 'S256',
      extra: { access_type: 'offline', prompt: 'consent' },
    });
  });

  it('merges a piece-declared OAuth2 `extra` over the ActivePieces defaults, keeping empty-string suppressions', () => {
    const piece = createPiece({
      displayName: 'OAuth2 extra piece',
      logoUrl: '',
      authors: [],
      auth: PieceAuth.OAuth2({
        displayName: 'Account',
        required: true,
        authUrl: 'https://vendor.test/authorize',
        tokenUrl: 'https://vendor.test/token',
        scope: [],
        // Dropbox's real shape (`token_access_type=offline`) plus sign-now's "suppress access_type" idiom.
        extra: { token_access_type: 'offline', access_type: '' },
      }),
      actions: [noopAction],
      triggers: [],
    });
    expect(normalizePiece('oauth-extra', piece).auth?.oauth2?.extra).toEqual({
      access_type: '',
      prompt: 'consent',
      token_access_type: 'offline',
    });
  });

  it('projects a multi-auth piece through the one method selectPieceAuth picks (first by default)', () => {
    const piece = createPiece({
      displayName: 'Multi-auth piece',
      logoUrl: '',
      authors: [],
      auth: [
        PieceAuth.OAuth2({
          displayName: 'Connection',
          required: true,
          authUrl: 'https://vendor.test/authorize',
          tokenUrl: 'https://vendor.test/token',
          scope: ['profile'],
        }),
        PieceAuth.SecretText({ displayName: 'API key', required: true }),
      ],
      actions: [noopAction],
      triggers: [],
    });
    const normalized = normalizePiece('multi', piece as unknown as Parameters<typeof normalizePiece>[1]);
    expect(normalized.auth?.type).toBe('OAUTH2');
    expect(normalized.auth?.oauth2?.authUrl).toBe('https://vendor.test/authorize');
  });

  it('leaves auth undefined for a piece with no auth at all', () => {
    const piece = createPiece({
      displayName: 'No-auth piece',
      logoUrl: '',
      authors: [],
      auth: PieceAuth.None(),
      actions: [noopAction],
      triggers: [],
    });
    expect(normalizePiece('none', piece as unknown as Parameters<typeof normalizePiece>[1]).auth).toBeUndefined();
  });
});

describe('normalizePiece: property mapping', () => {
  const auth = PieceAuth.SecretText({ displayName: 'key', required: true });

  it('captures static options for StaticDropdown, and refreshers (not options) for a dynamic Dropdown', () => {
    const action = createAction({
      name: 'do_it',
      displayName: 'Do it',
      description: '',
      auth,
      props: {
        status: Property.StaticDropdown({
          displayName: 'Status',
          required: true,
          options: {
            options: [
              { label: 'Open', value: 'open' },
              { label: 'Closed', value: 'closed' },
            ],
          },
        }),
        assignee: Property.Dropdown({
          displayName: 'Assignee',
          required: false,
          auth,
          refreshers: ['status'],
          options: async () => ({ options: [] }),
        }),
      },
      run: async () => undefined,
    });
    const piece = createPiece({ displayName: 'p', logoUrl: '', authors: [], auth, actions: [action], triggers: [] });
    const [status, assignee] = normalizePiece('p', piece).actions[0]!.props;

    expect(status).toMatchObject({
      name: 'status',
      type: 'STATIC_DROPDOWN',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
      ],
    });
    expect(status!.refreshers).toBeUndefined();

    expect(assignee).toMatchObject({ name: 'assignee', type: 'DROPDOWN', refreshers: ['status'] });
    expect(assignee!.options).toBeUndefined();
  });

  it('projects plain kinds (ShortText/Number/Checkbox/Markdown) through verbatim, with no options/refreshers', () => {
    const action = createAction({
      name: 'do_it',
      displayName: 'Do it',
      description: '',
      auth,
      props: {
        title: Property.ShortText({ displayName: 'Title', required: true }),
        count: Property.Number({ displayName: 'Count', required: false }),
        flag: Property.Checkbox({ displayName: 'Flag', required: false }),
        note: Property.MarkDown({ value: 'some *markdown*' }),
      },
      run: async () => undefined,
    });
    const piece = createPiece({ displayName: 'p', logoUrl: '', authors: [], auth, actions: [action], triggers: [] });
    const props = normalizePiece('p', piece).actions[0]!.props;
    expect(props.map((p) => ({ name: p.name, type: p.type, options: p.options, refreshers: p.refreshers }))).toEqual([
      { name: 'title', type: 'SHORT_TEXT', options: undefined, refreshers: undefined },
      { name: 'count', type: 'NUMBER', options: undefined, refreshers: undefined },
      { name: 'flag', type: 'CHECKBOX', options: undefined, refreshers: undefined },
      { name: 'note', type: 'MARKDOWN', options: undefined, refreshers: undefined },
    ]);
  });
});

describe('normalizePiece: DynamicProperties props (ADR 0025)', () => {
  const auth = PieceAuth.SecretText({ displayName: 'key', required: true });

  it('keeps an action that has a DynamicProperties prop, normalizing it like any other unconstrained prop', () => {
    const plainAction = createAction({
      name: 'plain',
      displayName: 'Plain',
      description: '',
      auth,
      props: { title: Property.ShortText({ displayName: 'Title', required: true }) },
      run: async () => undefined,
    });
    const dynamicAction = createAction({
      name: 'dynamic',
      displayName: 'Dynamic',
      description: '',
      auth,
      props: {
        extra: Property.DynamicProperties({
          displayName: 'Extra',
          required: false,
          auth,
          refreshers: [],
          props: async () => ({}),
        }),
      },
      run: async () => undefined,
    });
    const piece = createPiece({
      displayName: 'p',
      logoUrl: '',
      authors: [],
      auth,
      actions: [plainAction, dynamicAction],
      triggers: [],
    });

    const normalized = normalizePiece('p', piece);
    expect(normalized.actions.map((a) => a.name)).toEqual(['plain', 'dynamic']);
    const extraProp = normalized.actions.find((a) => a.name === 'dynamic')!.props[0]!;
    expect(extraProp).toEqual({
      name: 'extra',
      type: 'DYNAMIC',
      displayName: 'Extra',
      description: undefined,
      required: false,
      options: undefined,
      refreshers: undefined,
    });
  });

  it('keeps a POLLING trigger that has a DynamicProperties prop the same way', () => {
    const dynamicTrigger = createTrigger({
      name: 'on_dynamic',
      displayName: 'On dynamic',
      description: '',
      auth,
      props: {
        extra: Property.DynamicProperties({
          displayName: 'Extra',
          required: false,
          auth,
          refreshers: [],
          props: async () => ({}),
        }),
      },
      type: TriggerStrategy.POLLING,
      sampleData: {},
      onEnable: async () => {},
      onDisable: async () => {},
      run: async () => [],
    });
    const piece = createPiece({
      displayName: 'p',
      logoUrl: '',
      authors: [],
      auth,
      actions: [noopAction],
      triggers: [dynamicTrigger],
    });

    expect(normalizePiece('p', piece).triggers.map((t) => t.name)).toEqual(['on_dynamic']);
  });
});

describe('normalizePiece: trigger strategy filtering', () => {
  it('only surfaces POLLING triggers — a WEBHOOK ("callback") trigger never reaches the catalog', () => {
    const auth = PieceAuth.SecretText({ displayName: 'key', required: true });
    const pollingTrigger = createTrigger({
      name: 'new_item',
      displayName: 'New item',
      description: '',
      auth,
      props: {},
      type: TriggerStrategy.POLLING,
      sampleData: {},
      onEnable: async () => {},
      onDisable: async () => {},
      run: async () => [],
    });
    const webhookTrigger = createTrigger({
      name: 'on_callback',
      displayName: 'On callback',
      description: '',
      auth,
      props: {},
      type: TriggerStrategy.WEBHOOK,
      sampleData: {},
      onEnable: async () => {},
      onDisable: async () => {},
      run: async () => [],
    });
    const piece = createPiece({
      displayName: 'p',
      logoUrl: '',
      authors: [],
      auth,
      actions: [noopAction],
      triggers: [pollingTrigger, webhookTrigger],
    });

    expect(normalizePiece('p', piece).triggers.map((t) => t.name)).toEqual(['new_item']);
  });
});
