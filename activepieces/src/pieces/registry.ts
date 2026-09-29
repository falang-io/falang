import { activecampaign } from '@activepieces/piece-activecampaign';
import { airtable } from '@activepieces/piece-airtable';
import { amazonS3 } from '@activepieces/piece-amazon-s3';
import { asana } from '@activepieces/piece-asana';
import { box } from '@activepieces/piece-box';
import { calendly } from '@activepieces/piece-calendly';
import { clickup } from '@activepieces/piece-clickup';
import { close } from '@activepieces/piece-close';
import { discord } from '@activepieces/piece-discord';
import { docusign } from '@activepieces/piece-docusign';
import { dropbox } from '@activepieces/piece-dropbox';
import { freshdesk } from '@activepieces/piece-freshdesk';
import { github } from '@activepieces/piece-github';
import { gitlab } from '@activepieces/piece-gitlab';
import { gmail } from '@activepieces/piece-gmail';
import { googleCalendar } from '@activepieces/piece-google-calendar';
import { googleDrive } from '@activepieces/piece-google-drive';
import { googleForms } from '@activepieces/piece-google-forms';
import { googleSheets } from '@activepieces/piece-google-sheets';
import { hubspot } from '@activepieces/piece-hubspot';
import { imapPiece } from '@activepieces/piece-imap';
import { intercom } from '@activepieces/piece-intercom';
import { jiraCloud } from '@activepieces/piece-jira-cloud';
import { jotform } from '@activepieces/piece-jotform';
import { klaviyo } from '@activepieces/piece-klaviyo';
import { linear } from '@activepieces/piece-linear';
import { mailchimp } from '@activepieces/piece-mailchimp';
import { mattermost } from '@activepieces/piece-mattermost';
import { microsoftTeams } from '@activepieces/piece-microsoft-teams';
import { mixpanel } from '@activepieces/piece-mixpanel';
import { mongodb } from '@activepieces/piece-mongodb';
import { monday } from '@activepieces/piece-monday';
import { mysql } from '@activepieces/piece-mysql';
import { notion } from '@activepieces/piece-notion';
import { paddle } from '@activepieces/piece-paddle';
import { pandadoc } from '@activepieces/piece-pandadoc';
import { pipedrive } from '@activepieces/piece-pipedrive';
import { postgres } from '@activepieces/piece-postgres';
import { posthog } from '@activepieces/piece-posthog';
import { quickbooks } from '@activepieces/piece-quickbooks';
import { razorpay } from '@activepieces/piece-razorpay';
import { resend } from '@activepieces/piece-resend';
import { rssFeed } from '@activepieces/piece-rss';
import { salesforce } from '@activepieces/piece-salesforce';
import { sendgrid } from '@activepieces/piece-sendgrid';
import { sendinblue } from '@activepieces/piece-sendinblue';
import { shopify } from '@activepieces/piece-shopify';
import { slack } from '@activepieces/piece-slack';
import { smtp } from '@activepieces/piece-smtp';
import { stripe } from '@activepieces/piece-stripe';
import { todoist } from '@activepieces/piece-todoist';
import { trello } from '@activepieces/piece-trello';
import { twilio } from '@activepieces/piece-twilio';
import { typeform } from '@activepieces/piece-typeform';
import { woocommerce } from '@activepieces/piece-woocommerce';
import { wordpress } from '@activepieces/piece-wordpress';
import { wrike } from '@activepieces/piece-wrike';
import { xero } from '@activepieces/piece-xero';
import { youtube } from '@activepieces/piece-youtube';
import { zendesk } from '@activepieces/piece-zendesk';
import { zohoCrm } from '@activepieces/piece-zoho-crm';
import { zoom } from '@activepieces/piece-zoom';
import type { Piece } from '@activepieces/pieces-framework';
import { mockPiece } from './mock-piece.js';
import { mockBasicAuthPiece } from './mock-basic-auth-piece.js';
import { mockOAuth2Piece } from './mock-oauth2-piece.js';

/**
 * Curated allowlist of ActivePieces pieces this service will load/execute — see
 * ADR 0010 (private)'s "Scale and security" section and its
 * "Implementation notes (v1 allowlist)"/"Implementation notes (56-piece expansion)" for how this
 * list was chosen. Never accepts an arbitrary piece name from a caller; only entries registered
 * here are reachable.
 *
 * The key is the piece name every HTTP route, credential vendor slug (`activepieces-<key>`) and
 * stored `activepieces-action` node refers to — keep it equal to the npm package's own
 * `@activepieces/piece-<key>` suffix so the two never need a lookup table. Every entry was audited
 * the same way (`registry.test.ts` re-runs that audit on every test run): its selected auth method
 * (see `select-auth.ts`) is one this adapter supports, and `normalizePiece` yields at least one
 * usable action or `POLLING` trigger. Non-polling triggers are filtered out per piece by
 * `normalize.ts`, not by leaving the piece out; `DynamicProperties`-using actions/triggers are kept
 * and normalized as unconstrained (`any`) expression fields — see ADR 0025 (private).
 *
 * `mock`/`mockBasicAuth`/`mockOAuth2` are only ever added when `NODE_ENV=test` — they back the e2e
 * suite's exercise of the ActivePieces adapter (action + polling trigger, `CustomAuth`, `BasicAuth`,
 * and `OAuth2`) without a real vendor service. See ADR 0013 (private),
 * ADR 0014 (private), and ADR 0015 (private).
 */
export const PIECES_REGISTRY: Readonly<Record<string, Piece>> = {
  // Messaging
  slack,
  discord,
  mattermost,
  'microsoft-teams': microsoftTeams,
  // Google Workspace
  'google-sheets': googleSheets,
  gmail,
  'google-drive': googleDrive,
  'google-calendar': googleCalendar,
  'google-forms': googleForms,
  // Email & marketing
  smtp,
  imap: imapPiece,
  sendgrid,
  resend,
  mailchimp,
  activecampaign,
  klaviyo,
  sendinblue,
  // Project/task management & CRM
  notion,
  trello,
  'jira-cloud': jiraCloud,
  todoist,
  linear,
  clickup,
  hubspot,
  salesforce,
  pipedrive,
  'zoho-crm': zohoCrm,
  close,
  monday,
  asana,
  wrike,
  // Support/helpdesk
  zendesk,
  freshdesk,
  intercom,
  // Developer tools
  github,
  gitlab,
  // Data & storage
  airtable,
  postgres,
  mysql,
  'amazon-s3': amazonS3,
  dropbox,
  mongodb,
  box,
  // Forms & scheduling
  typeform,
  jotform,
  calendly,
  // Communication & video
  zoom,
  twilio,
  // E-commerce
  shopify,
  woocommerce,
  // Payments & accounting
  stripe,
  razorpay,
  paddle,
  quickbooks,
  xero,
  // Documents & eSignature
  docusign,
  pandadoc,
  // Analytics
  mixpanel,
  posthog,
  // Content & social
  wordpress,
  rss: rssFeed,
  youtube,
  ...(process.env.NODE_ENV === 'test'
    ? { mock: mockPiece, mockBasicAuth: mockBasicAuthPiece, mockOAuth2: mockOAuth2Piece }
    : {}),
};

export const getPiece = (pieceName: string): Piece => {
  const piece = PIECES_REGISTRY[pieceName];
  if (!piece) throw new Error(`Piece "${pieceName}" is not registered`);
  return piece;
};
