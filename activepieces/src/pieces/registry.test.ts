import { describe, expect, it, vi } from 'vitest';
import { normalizePiece } from './normalize.js';
import { PIECES_REGISTRY } from './registry.js';
import { PIECE_AUTH_METHODS } from './select-auth.js';

/**
 * Loads every *real* allow-listed piece (not fixtures) and re-runs the audit the allowlist was
 * chosen by — see ADR 0010 (private)'s "Implementation notes (v1
 * allowlist)". A piece package upgrade that renames its export, switches to an auth kind this
 * adapter can't map, renames an overridden multi-auth method, or drops every usable action/trigger
 * fails here rather than at the service's `GET /pieces` in a running stack.
 *
 * The three `mock*` entries are present because Vitest sets `NODE_ENV=test` — same condition the
 * e2e stack registers them under.
 */

const SUPPORTED_AUTH_TYPES = new Set(['SECRET_TEXT', 'BASIC_AUTH', 'CUSTOM_AUTH', 'OAUTH2']);

/** The auth method each piece ends up exposing — a deliberate choice per piece, so a drift is a real change worth noticing. */
const EXPECTED_AUTH_TYPE: Readonly<Record<string, string | undefined>> = {
  slack: 'CUSTOM_AUTH', // Bot Token (PIECE_AUTH_METHODS), not its OAuth2 method
  discord: 'SECRET_TEXT',
  mattermost: 'CUSTOM_AUTH',
  'google-sheets': 'OAUTH2',
  gmail: 'OAUTH2',
  'google-drive': 'OAUTH2',
  'google-calendar': 'OAUTH2',
  smtp: 'CUSTOM_AUTH',
  imap: 'CUSTOM_AUTH',
  sendgrid: 'SECRET_TEXT',
  resend: 'SECRET_TEXT',
  mailchimp: 'OAUTH2',
  notion: 'CUSTOM_AUTH', // Access Token (internal integration), not its OAuth2 method
  trello: 'BASIC_AUTH',
  'jira-cloud': 'CUSTOM_AUTH',
  todoist: 'OAUTH2',
  linear: 'SECRET_TEXT',
  clickup: 'OAUTH2',
  hubspot: 'CUSTOM_AUTH', // Private App Access Token, not its OAuth2 method
  github: 'SECRET_TEXT', // Personal Access Token, not its OAuth2/GitHub App methods
  gitlab: 'OAUTH2',
  airtable: 'SECRET_TEXT',
  postgres: 'CUSTOM_AUTH',
  mysql: 'CUSTOM_AUTH',
  'amazon-s3': 'CUSTOM_AUTH',
  dropbox: 'OAUTH2',
  stripe: 'SECRET_TEXT',
  wordpress: 'CUSTOM_AUTH',
  // oxlint-disable-next-line no-undefined -- documents that `rss` genuinely has no auth at all.
  rss: undefined,
  salesforce: 'OAUTH2',
  pipedrive: 'OAUTH2',
  'zoho-crm': 'OAUTH2',
  close: 'SECRET_TEXT',
  monday: 'SECRET_TEXT',
  asana: 'OAUTH2',
  wrike: 'OAUTH2',
  zendesk: 'CUSTOM_AUTH',
  freshdesk: 'CUSTOM_AUTH',
  intercom: 'CUSTOM_AUTH', // Access Token (PIECE_AUTH_METHODS), not its OAuth2 method
  activecampaign: 'CUSTOM_AUTH',
  klaviyo: 'SECRET_TEXT', // Private API Key is the multi-auth default (first-declared), not its OAuth2 method
  sendinblue: 'SECRET_TEXT',
  'google-forms': 'OAUTH2',
  zoom: 'OAUTH2',
  'microsoft-teams': 'OAUTH2',
  twilio: 'BASIC_AUTH',
  shopify: 'CUSTOM_AUTH',
  woocommerce: 'CUSTOM_AUTH',
  quickbooks: 'OAUTH2',
  xero: 'OAUTH2',
  razorpay: 'CUSTOM_AUTH',
  paddle: 'SECRET_TEXT',
  docusign: 'CUSTOM_AUTH',
  pandadoc: 'SECRET_TEXT',
  mongodb: 'CUSTOM_AUTH',
  mixpanel: 'SECRET_TEXT',
  posthog: 'CUSTOM_AUTH',
  youtube: 'OAUTH2',
  box: 'OAUTH2',
  typeform: 'OAUTH2',
  jotform: 'CUSTOM_AUTH',
  calendly: 'SECRET_TEXT',
  mock: 'CUSTOM_AUTH',
  mockBasicAuth: 'BASIC_AUTH',
  mockOAuth2: 'OAUTH2',
};

describe('PIECES_REGISTRY (real installed pieces)', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const normalized = Object.entries(PIECES_REGISTRY).map(([pieceName, piece]) => normalizePiece(pieceName, piece));
  warn.mockRestore();

  it('registers exactly the audited set of pieces', () => {
    expect(Object.keys(PIECES_REGISTRY).sort()).toEqual(Object.keys(EXPECTED_AUTH_TYPE).sort());
  });

  it('exposes the expected auth method for every piece (multi-auth overrides included)', () => {
    expect(Object.fromEntries(normalized.map((piece) => [piece.pieceName, piece.auth?.type]))).toEqual(
      EXPECTED_AUTH_TYPE,
    );
  });

  it('only registers pieces whose selected auth is a kind this adapter can resolve', () => {
    for (const piece of normalized) {
      if (piece.auth) expect(SUPPORTED_AUTH_TYPES.has(piece.auth.type), piece.pieceName).toBe(true);
    }
  });

  it('every piece contributes at least one usable action or POLLING trigger after filtering', () => {
    for (const piece of normalized) {
      expect(piece.actions.length + piece.triggers.length, piece.pieceName).toBeGreaterThan(0);
    }
  });

  it('every OAuth2 piece carries the ActivePieces default authorize-URL params (refresh_token issuance)', () => {
    for (const piece of normalized) {
      if (piece.auth?.type !== 'OAUTH2') continue;
      expect(piece.auth.oauth2?.extra, piece.pieceName).toMatchObject({ access_type: 'offline', prompt: 'consent' });
    }
  });

  it('every PIECE_AUTH_METHODS override names a registered piece', () => {
    for (const pieceName of Object.keys(PIECE_AUTH_METHODS)) {
      expect(PIECES_REGISTRY[pieceName], pieceName).toBeDefined();
    }
  });
});
