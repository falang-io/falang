import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { ONEC_GET_RECORDS_NAME, ONEC_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * 1С (REST/OData) — ERP/учёт, P0 in ADR 0017 (private).
 * Talks to 1С:Предприятие's *standard* automatic OData interface (`.../odata/standard.odata/`,
 * available since platform 8.3.5 — OData v3.0, Basic auth against a regular 1С user account, entity
 * collections named `Catalog_X`/`Document_X`/… after the info base's own metadata objects).
 *
 * MVP scope: **one read action, "Get records"**, deliberately not a write. Two things drove that cut,
 * both verified against 1С's own docs and community write-ups before coding (2026-09-16), same
 * "check first, don't assume" pass every other vendor in this ADR got:
 * 1. This is exactly the case the ADR's "Mechanism" column already flags — OData's `$filter` query
 *    syntax (e.g. `Post eq true and Date ge datetime'2026-01-01T00:00:00'`) is nothing like this
 *    engine's TS-expression fields, so it needs to be typed as a raw string the workflow author
 *    builds by hand (a `template-string` field, same widget `http-request`'s `url` uses) rather than
 *    something the generic `http-request` action could express cleanly.
 * 2. Write operations (POST/PATCH/PUT/DELETE) on 1С's OData interface commonly need CSRF-token
 *    handling (get-a-token-then-echo-it-back, the same shape SAP's OData CSRF protection uses) —
 *    unlike the vendor's read side, this repo's available sources couldn't confirm 1С's exact
 *    behavior (whether standard.odata enforces it by default, and how to disable it per-publication)
 *    with the same confidence as everything else here. Rather than guess at security-relevant
 *    behavior, this is left for a write action's own follow-up pass — same "stop and flag, don't
 *    guess" call the ADR's Т-Банк mTLS section already made.
 */
export const onecIntegration: IWorkflowIntegration = {
  vendor: ONEC_VENDOR,
  label: '1С (OData)',
  notes:
    '1C:Enterprise (1С, OData interface) — accounting / ERP database: read records (catalogs, documents, registers) from a 1C information base.',
  credentialFields: [
    { name: 'base_url', label: 'OData base URL (…/odata/standard.odata)', kind: 'text' },
    { name: 'username', label: 'Username', kind: 'text' },
    { name: 'password', label: 'Password', kind: 'secret' },
  ],
  triggers: [],
  actions: [
    {
      name: ONEC_GET_RECORDS_NAME,
      label: '1С: Получить записи (OData)',
      // Multi-field editor (credential/entity/filter/result), same reasoning as call-ai-text/http-request.
      editorType: 'sidebar',
      fields: [
        { name: 'credentialId', label: 'Информационная база', kind: 'credential-ref', vendor: ONEC_VENDOR },
        { name: 'entity', label: 'Коллекция (напр. Catalog_Контрагенты)', kind: 'text' },
        {
          name: 'filter',
          label: 'OData $filter (необязательно, напр. Post eq true)',
          kind: 'template-string',
        },
        { name: 'resultVariable', label: 'Сохранить результат в', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await onecGetRecords(${fields.credentialId}, ${fields.entity}, ${fields.filter})`;
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature: 'onecGetRecords(credentialId: string, entity: string, filter: string): Promise<unknown[]>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const onecGetRecords = async (',
        '  credentialId: string,',
        '  entity: string,',
        '  filter: string,',
        '): Promise<unknown[]> => {',
        '  const [baseUrl, username, password] = await Promise.all([',
        "    resolveOnecField(credentialId, 'base_url'),",
        "    resolveOnecField(credentialId, 'username'),",
        "    resolveOnecField(credentialId, 'password'),",
        '  ]);',
        '  const queryParams = filter ? `$format=application/json;odata=nometadata&$filter=${encodeURIComponent(filter)}` : `$format=application/json;odata=nometadata`;',
        "  const url = `${baseUrl.replace(/\\/$/, '')}/${entity}?${queryParams}`;",
        '  const response = await fetch(url, {',
        "    headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },",
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`1С OData request failed: ${response.status} ${await response.text()}`);',
        '  }',
        '  const data = (await response.json()) as { value: unknown[] };',
        '  return data.value;',
        '};',
      ].join('\n'),
    },
  ],
  // Shared by every 1С activity — emitted once by `compileActivities` (see
  // `IWorkflowIntegration.sharedActivityCode`) so it isn't redeclared per activity, which would
  // collide once concatenated into one activities.ts module.
  sharedActivityCode: [
    '// Resolves a plain (non-OAuth2) credentialId+field -> real value, env-aware like',
    "// telegram.integration.ts's resolveTelegramBotToken (not amoCRM's resolveAmoCrmField, which",
    "// hardcodes `dev` — that's specific to OAuth2 tokens, which only ever live in the dev slot;",
    "// 1С's base_url/username/password are plain secrets that commonly do differ between a dev and a",
    '// prod info base, same as Telegram bot tokens).',
    'const resolveOnecField = async (credentialId: string, field: string): Promise<string> => {',
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
    "    body: JSON.stringify({ credentialId, vendor: 'onec', field, projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve 1С credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
  ].join('\n'),
};
