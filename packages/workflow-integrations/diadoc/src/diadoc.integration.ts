import type { IOAuth2Config, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { DIADOC_GET_DOCUMENTS_NAME, DIADOC_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * Диадок (СКБ Контур) — ЭДО, P0 in ADR 0017 (private).
 * Verified against Диадок's own developer docs (developer.kontur.ru/doc/diadoc-api,
 * 2026-09-16) before coding, same "check first, don't assume" pass every other vendor in this ADR
 * got. Unlike amoCRM/GigaChat, Диадок's current (non-deprecated) auth is plain OpenID
 * Connect Authorization Code + `offline_access` — no per-account token endpoint, no JSON body, no
 * extra `redirect_uri`-on-refresh requirement — so it needs **zero** of `IOAuth2Config`'s
 * amoCRM-shaped deviation fields. This is the first vendor in this repo to exercise the plain,
 * un-deviated RFC 6749 path through `resolveOAuth2AccessToken`/`buildOAuth2TokenRequest`.
 */
const diadocOAuth2Config: IOAuth2Config = {
  authUrl: 'https://identity.kontur.ru/connect/authorize',
  tokenUrl: 'https://identity.kontur.ru/connect/token',
  // offline_access is required to get a refresh_token back at all; Diadoc.PublicAPI scopes the
  // token to the Diadoc HTTP API specifically (not Kontur's other products behind the same identity
  // provider).
  scope: ['openid', 'profile', 'email', 'offline_access', 'Diadoc.PublicAPI'],
};

/**
 * Диадок (СКБ Контур) — ЭДО. MVP scope: **one read action, "Get documents"**, deliberately not a
 * send/sign action. Two things drove that cut, same "stop and flag, don't guess" reasoning the
 * ADR's Т-Банк mTLS and 1С write-action sections already use:
 * 1. Sending a document that requires a *recipient's* signature, or countersigning one that reached
 *    this box, needs a qualified electronic signature (УКЭП) — a real crypto-provider integration
 *    (a certificate + a signing service, e.g. Kontur's own Crypto API or a local CryptoPro
 *    installation) that nothing in this repo's `runner`/activity-code pipeline supports today. This
 *    is the same category of gap as Т-Банк's mTLS requirement: real, new plumbing that deserves its
 *    own design pass, not something to bolt onto an MVP action.
 * 2. Диадок's document status model (`DocflowStatus`/`InvoiceStatus`, а dozen+ named states across
 *    `Document`/`Invoice`/`DocflowV3`/`DocflowV4` contracts, see the ADR's own "Mechanism" column)
 *    doesn't reduce to a handful of typed fields the way amoCRM's lead or 1С's OData record does —
 *    exposing it meaningfully needs its own struct-type design, not a quick MVP guess.
 *
 * "Get documents" (`GetDocuments`, V4) sidesteps both: it only reads a box's document list/metadata
 * (never a document's binary content, which needs a separate `GetEntityContent` call and isn't
 * fetched here either), proving the OAuth2 connect/refresh path works end to end against a real
 * Диадок account, same MVP bar amoCRM's "Create lead" set.
 */
export const diadocIntegration: IWorkflowIntegration = {
  vendor: DIADOC_VENDOR,
  label: 'Диадок (ЭДО)',
  notes:
    'Kontur Diadoc (Диадок) — electronic document interchange (EDI, ЭДО): list and read incoming/outgoing documents (invoices, acts, UPD) in a Diadoc box.',
  oauth2: diadocOAuth2Config,
  credentialFields: [
    { name: 'client_id', label: 'Client ID', kind: 'text' },
    { name: 'client_secret', label: 'Client secret', kind: 'secret' },
    { name: 'access_token', label: 'Access token', kind: 'secret', hidden: true },
    { name: 'refresh_token', label: 'Refresh token', kind: 'secret', hidden: true },
    { name: 'expires_at', label: 'Expires at', kind: 'text', hidden: true },
    // Not part of the OAuth2 handshake — Диадок has no equivalent of amoCRM's account-domain
    // callback param, so this is a plain user-entered field (same shape ЮKassa's shop_id or
    // Bitrix24's application_token already are), not `hidden`.
    { name: 'box_id', label: 'Box ID (GUID Диадок-ящика организации)', kind: 'text' },
  ],
  triggers: [],
  actions: [
    {
      name: DIADOC_GET_DOCUMENTS_NAME,
      label: 'Диадок: Получить документы',
      fields: [
        { name: 'credentialId', label: 'Ящик Диадок', kind: 'credential-ref', vendor: DIADOC_VENDOR },
        { name: 'resultVariable', label: 'Сохранить результат в', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await diadocGetDocuments(${fields.credentialId})`;
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature: 'diadocGetDocuments(credentialId: string): Promise<unknown[]>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const diadocGetDocuments = async (credentialId: string): Promise<unknown[]> => {',
        '  const [accessToken, boxId] = await Promise.all([',
        '    resolveDiadocAccessToken(credentialId),',
        "    resolveDiadocField(credentialId, 'box_id'),",
        '  ]);',
        '  const response = await fetch(',
        '    `https://diadoc-api.kontur.ru/V4/GetDocuments?boxId=${encodeURIComponent(boxId)}`,',
        '    {',
        "      method: 'POST',",
        "      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },",
        '      body: JSON.stringify({ Count: 50 }),',
        '    },',
        '  );',
        '  if (!response.ok) {',
        '    throw new Error(`Diadoc GetDocuments failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as { Documents: unknown[] };',
        '  return data.Documents;',
        '};',
      ].join('\n'),
    },
  ],
  // Shared by every Диадок activity — emitted once by `compileActivities` (see
  // `IWorkflowIntegration.sharedActivityCode`) so it isn't redeclared per activity, which would
  // collide once concatenated into one activities.ts module.
  sharedActivityCode: [
    "import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';",
    '',
    `const DIADOC_OAUTH2_CONFIG = ${JSON.stringify({ tokenUrl: diadocOAuth2Config.tokenUrl })};`,
    '',
    '// The native-path OAuth2 refresh helper (see ADR 0017 (private)) — Диадок needs none of the',
    '// amoCRM-shaped deviations, so this is the plain RFC 6749 path.',
    'const resolveDiadocAccessToken = (credentialId: string): Promise<string> =>',
    "  resolveOAuth2AccessToken('diadoc', credentialId, DIADOC_OAUTH2_CONFIG);",
    '',
    '// Resolves a plain (non-OAuth2) credentialId+field -> real value, env-aware like',
    "// telegram.integration.ts's resolveTelegramBotToken / onec.integration.ts's resolveOnecField —",
    '// box_id is a plain field (not an OAuth2 token, which always lives in the dev slot only) and can',
    '// legitimately differ between a dev and a prod box.',
    'const resolveDiadocField = async (credentialId: string, field: string): Promise<string> => {',
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    "  const env = process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev';",
    '  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    "    body: JSON.stringify({ credentialId, vendor: 'diadoc', field, projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve Диадок credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
  ].join('\n'),
};
