import type { IFieldSelectOption, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { GIGACHAT_CALL_TEXT_NAME, GIGACHAT_VENDOR } from './constants.js';

export * from './constants.js';

const GIGACHAT_SCOPE_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'GIGACHAT_API_PERS', label: 'Personal (GIGACHAT_API_PERS)' },
  { value: 'GIGACHAT_API_B2B', label: 'Business, prepaid (GIGACHAT_API_B2B)' },
  { value: 'GIGACHAT_API_CORP', label: 'Business, pay-as-you-go (GIGACHAT_API_CORP)' },
];

/**
 * GigaChat (Сбер) — LLM, P1 in ADR 0017 (private). Deliberately
 * does **not** declare `IWorkflowIntegration.oauth2` — unlike amoCRM's 3-legged authorization-code
 * flow, GigaChat authenticates via OAuth2 `client_credentials`: no user consent redirect, no
 * `refresh_token`, just a server-side exchange of a pre-issued "Authorization key" (`authKey`, already
 * `Base64(client_id:client_secret)` as issued by Sber's dev cabinet — see
 * https://developers.sber.ru/docs/ru/gigachat/quickstart/ind-using-api) for a short-lived (30-minute)
 * access token, re-fetched whenever the cached one is stale. `IOAuth2Config`/`oauth2.controller.ts`'s
 * "Connect" popup exists specifically for the 3-legged case and would be actively misleading UI for a
 * vendor with no consent step at all, so this credential is a plain secret set (same shape as OpenAI's
 * `apiKey`) with a caching token-fetch helper in `sharedActivityCode` instead.
 *
 * Verified against Sber's own developer docs and independently cross-checked against
 * `ai-forever/gigachat`/`ai-forever/gigachat-js` (2026-09-16): token endpoint
 * `https://ngw.devices.sberbank.ru:9443/api/v2/oauth` (`Authorization: Basic <authKey>`, a mandatory
 * `RqUID` UUID4 header, form-urlencoded `scope`), response `{ access_token, expires_at }` where
 * `expires_at` — unlike every RFC 6749 vendor's `expires_in` seconds-delta — is already an absolute
 * Unix-ms timestamp, so no delta math is needed before caching it. Chat completions are OpenAI-shaped
 * (`POST https://api.giga.chat/v1/chat/completions`, `choices[0].message.content`), hence this
 * action mirrors `openaiIntegration`'s `call-ai-text` closely — MVP-scoped to plain-text output (no
 * `result-type`/structured-output field, no `model` dropdown via `loadOptions`, both of which would
 * need their own token-fetch since `loadOptions` runs on the backend, not inside this activity code).
 */
export const gigachatIntegration: IWorkflowIntegration = {
  vendor: GIGACHAT_VENDOR,
  label: 'GigaChat',
  notes: 'GigaChat by Sber — Russian AI / LLM / neural network: generate text from a prompt.',
  credentialFields: [
    { name: 'authKey', label: 'Authorization key', kind: 'secret' },
    { name: 'scope', label: 'Scope', kind: 'select', options: GIGACHAT_SCOPE_OPTIONS },
    { name: 'access_token', label: 'Access token', kind: 'secret', hidden: true },
    { name: 'expires_at', label: 'Expires at', kind: 'text', hidden: true },
  ],
  triggers: [],
  actions: [
    {
      name: GIGACHAT_CALL_TEXT_NAME,
      label: 'GigaChat: Chat completion',
      editorType: 'sidebar',
      fields: [
        { name: 'credentialId', label: 'Account', kind: 'credential-ref', vendor: GIGACHAT_VENDOR },
        { name: 'model', label: 'Model', kind: 'text' },
        { name: 'prompt', label: 'Prompt', kind: 'template-string' },
        { name: 'resultVariable', label: 'Result variable', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await gigachatCallText(${fields.credentialId}, ${fields.model}, ${fields.prompt})`;
        // `resultVariable` is a bare identifier — empty only for a node created but never edited yet,
        // in which case the call is still emitted, just without capturing its result anywhere. Same
        // convention as `openaiIntegration`'s `call-ai-text`.
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature: 'gigachatCallText(credentialId: string, model: string, prompt: string): Promise<string>',
      // `activitySignature` above always resolves to a plain `string` — same reasoning as
      // `yandexgptIntegration`'s own `resultType`.
      resultType: { type: 'string', constant: true },
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const gigachatCallText = async (credentialId: string, model: string, prompt: string): Promise<string> => {',
        '  const accessToken = await getGigaChatAccessToken(credentialId);',
        "  const response = await fetch('https://api.giga.chat/v1/chat/completions', {",
        "    method: 'POST',",
        "    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },",
        "    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),",
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`GigaChat chat completion failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as { choices: { message: { content: string } }[] };',
        "  return data.choices[0]?.message.content ?? '';",
        '};',
      ].join('\n'),
    },
  ],
  // Shared by every GigaChat activity — emitted once by `compileActivities` (see
  // `IWorkflowIntegration.sharedActivityCode`) so it isn't redeclared per activity, which would
  // collide once concatenated into one activities.ts module.
  sharedActivityCode: [
    "// Resolves credentialId+field -> real value via @falang/workflow-backend's internal endpoint —",
    "// same mechanism as telegram.integration.ts's resolveTelegramBotToken / openai.integration.ts's",
    '// resolveOpenAiField.',
    'const resolveGigaChatField = async (credentialId: string, field: string): Promise<string> => {',
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (!backendUrl || !internalProjectToken || !projectId) {',
    "    throw new Error('BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');",
    '  }',
    '  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    "    body: JSON.stringify({ credentialId, vendor: 'gigachat', field, projectId, env: 'dev' }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve GigaChat credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
    '',
    "// Returns a cached access token if it's not within 60s of `expires_at`, otherwise exchanges",
    "// `authKey` (client_credentials, no user consent step — see this file's own doc comment) for a",
    '// fresh one and best-effort persists it for reuse by later activity invocations. `expires_at` in',
    "// GigaChat's own token response is already an absolute Unix-ms timestamp (unlike RFC 6749's",
    '// `expires_in` seconds-delta), so it can be cached and compared as-is.',
    'const getGigaChatAccessToken = async (credentialId: string): Promise<string> => {',
    '  const [cachedToken, cachedExpiresAtRaw] = await Promise.all([',
    "    resolveGigaChatField(credentialId, 'access_token').catch(() => ''),",
    "    resolveGigaChatField(credentialId, 'expires_at').catch(() => ''),",
    '  ]);',
    '  const cachedExpiresAt = Number(cachedExpiresAtRaw) || 0;',
    '  if (cachedToken && Date.now() < cachedExpiresAt - 60_000) return cachedToken;',
    '',
    '  const [authKey, scope] = await Promise.all([',
    "    resolveGigaChatField(credentialId, 'authKey'),",
    "    resolveGigaChatField(credentialId, 'scope'),",
    '  ]);',
    "  const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {",
    "    method: 'POST',",
    '    headers: {',
    "      'Content-Type': 'application/x-www-form-urlencoded',",
    "      Accept: 'application/json',",
    '      RqUID: crypto.randomUUID(),',
    '      Authorization: `Basic ${authKey}`,',
    '    },',
    '    body: new URLSearchParams({ scope }),',
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`GigaChat token request failed: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { access_token: string; expires_at: number };',
    '',
    '  const backendUrl = process.env.BACKEND_INTERNAL_URL;',
    '  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;',
    '  const projectId = process.env.PROJECT_ID;',
    '  if (backendUrl && internalProjectToken && projectId) {',
    '    try {',
    '      await fetch(`${backendUrl}/internal/credentials/oauth2-refresh`, {',
    "        method: 'POST',",
    "        headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },",
    '        body: JSON.stringify({',
    '          credentialId,',
    "          vendor: 'gigachat',",
    '          projectId,',
    '          accessToken: data.access_token,',
    '          expiresAt: String(data.expires_at),',
    '        }),',
    '      });',
    '    } catch {',
    '      // Best-effort cache persist — the fresh token is still used for this call either way.',
    '    }',
    '  }',
    '  return data.access_token;',
    '};',
  ].join('\n'),
};
