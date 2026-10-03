import type { TVariableInfo } from '@falang/typescript-dto';
import type { IOAuth2Config, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { AMOCRM_CREATE_LEAD_NAME, AMOCRM_VENDOR } from './constants.js';

export * from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/**
 * amoCRM's OAuth2 flow deviates from the plain RFC 6749 shape every other vendor in this repo
 * follows in three ways — see `IOAuth2Config`'s doc comment and
 * ADR 0017 (private)'s "OAuth2 credential-kind gap":
 * (1) the token endpoint lives at the connecting account's own subdomain, echoed back on the OAuth2
 * callback's `referer` query param; (2) the token request body is JSON, not form-urlencoded;
 * (3) the refresh grant also validates `redirect_uri`. Verified against amoCRM's own developer docs
 * and the `amocrm/amocrm-oauth-client` reference client (2026-09-16) — amoCRM does not use a `scope`
 * parameter, hence the empty array.
 */
const amocrmOAuth2Config: IOAuth2Config = {
  authUrl: 'https://www.amocrm.ru/oauth',
  tokenUrl: 'https://{accountDomain}/oauth2/access_token',
  scope: [],
  tokenRequestFormat: 'json',
  accountDomainCallbackParam: 'referer',
  // amoCRM account hosts: `<sub>.amocrm.ru` / `<sub>.amocrm.com` (+ Kommo, the international rebrand, `<sub>.kommo.com`).
  accountDomainSuffixes: ['.amocrm.ru', '.amocrm.com', '.kommo.com'],
  includeRedirectUriOnRefresh: true,
};

/** The subset of `amocrmOAuth2Config` the runner-side activity code actually needs at runtime — serialized via `JSON.stringify` below so the emitted literal can never drift from the descriptor above. */
const amocrmOAuth2RuntimeConfig = {
  tokenUrl: amocrmOAuth2Config.tokenUrl,
  tokenRequestFormat: amocrmOAuth2Config.tokenRequestFormat,
  accountDomainCallbackParam: amocrmOAuth2Config.accountDomainCallbackParam,
  includeRedirectUriOnRefresh: amocrmOAuth2Config.includeRedirectUriOnRefresh,
};

/**
 * amoCRM — CRM/portal, P0 in ADR 0017 (private). MVP scope:
 * one action ("Create lead") to prove the OAuth2 flow (including the account-domain/JSON-body/
 * redirect-uri-on-refresh deviations above) works end to end against a real amoCRM account; more
 * actions (contacts, tasks, notes, …) are a straightforward follow-up once this is verified live —
 * see the ADR's P0 table.
 */
export const amocrmIntegration: IWorkflowIntegration = {
  vendor: AMOCRM_VENDOR,
  label: 'amoCRM',
  notes: 'amoCRM — CRM / sales pipeline: create leads (deals) in an amoCRM account via OAuth2.',
  oauth2: amocrmOAuth2Config,
  credentialFields: [
    { name: 'client_id', label: 'Client ID', kind: 'text' },
    { name: 'client_secret', label: 'Client secret', kind: 'secret' },
    { name: 'access_token', label: 'Access token', kind: 'secret', hidden: true },
    { name: 'refresh_token', label: 'Refresh token', kind: 'secret', hidden: true },
    { name: 'expires_at', label: 'Expires at', kind: 'text', hidden: true },
    { name: 'account_domain', label: 'Account domain', kind: 'text', hidden: true },
  ],
  triggers: [],
  actions: [
    {
      name: AMOCRM_CREATE_LEAD_NAME,
      label: 'amoCRM: Create lead',
      fields: [
        { name: 'credentialId', label: 'Account', kind: 'credential-ref', vendor: AMOCRM_VENDOR },
        { name: 'name', label: 'Lead name', kind: 'template-string' },
        { name: 'price', label: 'Price', kind: 'expression', expectedType: anyNumber },
      ],
      emit: (fields) => `await amocrmCreateLead(${fields.credentialId}, ${fields.name}, ${fields.price});`,
      activitySignature: 'amocrmCreateLead(credentialId: string, name: string, price: number): Promise<{ id: number }>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const amocrmCreateLead = async (',
        '  credentialId: string,',
        '  name: string,',
        '  price: number,',
        '): Promise<{ id: number }> => {',
        '  const [accessToken, accountDomain] = await Promise.all([',
        '    resolveAmoCrmAccessToken(credentialId),',
        "    resolveAmoCrmField(credentialId, 'account_domain'),",
        '  ]);',
        '  const response = await fetch(`https://${accountDomain}/api/v4/leads`, {',
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },",
        '    body: JSON.stringify([{ name, price }]),',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`amoCRM create lead failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as { _embedded: { leads: { id: number }[] } };',
        '  const lead = data._embedded.leads[0];',
        "  if (!lead) throw new Error('amoCRM create lead: no lead returned');",
        '  return { id: lead.id };',
        '};',
      ].join('\n'),
    },
  ],
  // Shared by every amoCRM activity — emitted once by `compileActivities` (see
  // `IWorkflowIntegration.sharedActivityCode`) so it isn't redeclared per activity, which would
  // collide once concatenated into one activities.ts module.
  sharedActivityCode: [
    "import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';",
    '',
    // `as const` keeps `tokenRequestFormat` narrowed to `'json'` instead of widening to `string`
    // — without it, `resolveOAuth2AccessToken`'s `IOAuth2RuntimeConfig` parameter type rejects this
    // object on every single build (found live: any project build fails `typeCheckProject`
    // regardless of whether it actually uses amoCRM, since every registered integration's activity
    // code compiles unconditionally — see `compileProject`'s `buildWorkflowPreamble`).
    `const AMOCRM_OAUTH2_CONFIG = ${JSON.stringify(amocrmOAuth2RuntimeConfig)} as const;`,
    '',
    "// The native-path OAuth2 refresh helper (see ADR 0017 (private)) — handles amoCRM's",
    '// account-domain/JSON-body/redirect-uri-on-refresh deviations from plain RFC 6749.',
    'const resolveAmoCrmAccessToken = (credentialId: string): Promise<string> =>',
    "  resolveOAuth2AccessToken('amocrm', credentialId, AMOCRM_OAUTH2_CONFIG);",
    '',
    '// Resolves a plain (non-OAuth2) credentialId+field -> real value, same mechanism as',
    "// telegram.integration.ts's resolveTelegramBotToken / openai.integration.ts's resolveOpenAiField.",
    'const resolveAmoCrmField = async (credentialId: string, field: string): Promise<string> => {',
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    '  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    "    body: JSON.stringify({ credentialId, vendor: 'amocrm', field, projectId, env: 'dev' }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve amoCRM credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
  ].join('\n'),
};
