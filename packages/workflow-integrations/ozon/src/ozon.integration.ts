import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { OZON_CALL_METHOD_NAME, OZON_VENDOR } from './constants.js';
import { OZON_METHOD_OPTIONS, OZON_METHOD_STRUCT_ID, OZON_ROUTES, OZON_STRUCT_TYPES } from './ozon.generated.js';

export * from './constants.js';
export * from './ozon.generated.js';

/**
 * Ozon Seller API — marketplace, P1 in ADR 0017 (private).
 * Unlike every other vendor package in this repo (one node kind per API method), Ozon's ~470-method
 * surface is exposed as **one icon** — a generic "Call method" action whose `method` field is a
 * dropdown built from the vendor's own OpenAPI spec (`ozon.generated.ts`, produced by
 * `scripts/generate-openapi-integration.mjs`, never hand-edited), and whose `data` field is an
 * `expression` typed *dynamically*, retyped to the struct matching whichever `method` is currently
 * selected — see `IFieldConfig.expectedType`'s function form and
 * `IntegrationActionEditorStore.refreshDynamicExpressionTypes`, both added specifically to support
 * this shape (no existing vendor needed a field whose type depends on a sibling field before this).
 *
 * Auth: `Client-Id` + `Api-Key` headers (both obtained from the seller cabinet's API-integration
 * settings) — no `Bearer`/OAuth2 anywhere in the Seller API. Verified against
 * `docs.ozon.ru/api/seller` before this package was generated (see ADR 0017's "Wildberries/Ozon/
 * МойСклад implementation notes"); the OpenAPI spec itself (`servers[0].url`) confirms the single
 * `api-seller.ozon.ru` host used by every one of its 470 operations.
 *
 * `OZON_ROUTES` (per-method HTTP method/path/param routing, derived from the same spec) is embedded
 * verbatim into `activityCode` via `JSON.stringify` — a plain object literal in the compiled call
 * site, not a runtime import — the same "inline object literal in the compiled call site" pattern
 * `openaiIntegration`'s `call-ai-choice` already uses for a JSON Schema, since `activities.ts` is a
 * self-contained concatenation of every vendor's `activityCode` strings with no access to this
 * package's own module graph at runtime (see `compileActivities`).
 *
 * Known fidelity gaps from the generator (see `schema-to-variable-info.mjs`'s own doc comment):
 * OpenAPI string enums degrade to plain `string` (13 across this spec), and a handful of genuinely
 * untyped/free-form schemas fall back to `any` (4) — both flagged, not silently wrong.
 */
export const ozonIntegration: IWorkflowIntegration = {
  vendor: OZON_VENDOR,
  label: 'Ozon Seller API',
  notes:
    'Ozon Seller API — marketplace / e-commerce seller account: call any Ozon Seller API method (products, stocks, prices, orders/postings, finance, analytics).',
  credentialFields: [
    { name: 'clientId', label: 'Client-Id', kind: 'text' },
    { name: 'apiKey', label: 'Api-Key', kind: 'secret' },
  ],
  triggers: [],
  types: OZON_STRUCT_TYPES,
  actions: [
    {
      name: OZON_CALL_METHOD_NAME,
      label: 'Ozon: Call method',
      editorType: 'sidebar',
      fields: [
        { name: 'credentialId', label: 'Account', kind: 'credential-ref', vendor: OZON_VENDOR },
        { name: 'method', label: 'Method', kind: 'select', options: OZON_METHOD_OPTIONS },
        {
          name: 'data',
          label: 'Data',
          kind: 'expression',
          expectedType: (fields) => {
            const structId = OZON_METHOD_STRUCT_ID[fields.method ?? ''];
            if (!structId) return;
            return { type: 'struct', id: structId };
          },
        },
        { name: 'resultVariable', label: 'Result variable', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await ozonCallMethod(${fields.credentialId}, ${fields.method}, ${fields.data})`;
        // `resultVariable` is a bare identifier — empty only for a node created but never edited yet,
        // in which case the call is still emitted, just without capturing its result anywhere. Same
        // convention as every other vendor's single-action `emit`.
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature:
        'ozonCallMethod(credentialId: string, method: string, data: Record<string, unknown>): Promise<unknown>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const ozonCallMethod = async (',
        '  credentialId: string,',
        '  method: string,',
        '  data: Record<string, unknown>,',
        '): Promise<unknown> => {',
        '  const route = OZON_ROUTES[method];',
        '  if (!route) throw new Error(`Unknown Ozon method: ${method}`);',
        '  const [clientId, apiKey] = await Promise.all([',
        "    resolveOzonField(credentialId, 'clientId'),",
        "    resolveOzonField(credentialId, 'apiKey'),",
        '  ]);',
        '  let path = route.path;',
        '  for (const paramName of route.pathParams) {',
        '    path = path.replace(`{${paramName}}`, encodeURIComponent(String(data[paramName])));',
        '  }',
        '  const query = new URLSearchParams();',
        '  for (const paramName of route.queryParams) {',
        '    const value = data[paramName];',
        '    if (value !== undefined) query.set(paramName, String(value));',
        '  }',
        '  const bodyKeys = Object.keys(data).filter((key) => !route.pathParams.includes(key) && !route.queryParams.includes(key));',
        "  const bodyPayload = route.bodyMode === 'whole' ? data.body : Object.fromEntries(bodyKeys.map((key) => [key, data[key]]));",
        "  const hasBody = route.bodyMode === 'whole' ? data.body !== undefined : bodyKeys.length > 0;",
        '  const queryString = query.toString();',
        "  const url = `${route.baseUrl}${path}${queryString ? `?${queryString}` : ''}`;",
        '  const response = await fetch(url, {',
        '    method: route.httpMethod,',
        "    headers: { 'Content-Type': 'application/json', 'Client-Id': clientId, 'Api-Key': apiKey },",
        '    body: hasBody ? JSON.stringify(bodyPayload) : undefined,',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`Ozon API call (${method}) failed: ${response.status} ${await response.text()}`);',
        '  }',
        "  const contentType = response.headers.get('content-type') ?? '';",
        "  return contentType.includes('application/json') ? await response.json() : await response.text();",
        '};',
      ].join('\n'),
    },
  ],
  // Shared by the single Ozon activity — emitted once by `compileActivities` (see
  // `IWorkflowIntegration.sharedActivityCode`), holding the credential resolver and the routing table
  // both re-declared here rather than per-action (there's only one action, but this is where every
  // other vendor package puts vendor-wide runtime constants).
  sharedActivityCode: [
    '// Resolves a plain (non-OAuth2) credentialId+field -> real value, env-aware like',
    "// telegram.integration.ts's resolveTelegramBotToken / onec.integration.ts's resolveOnecField —",
    '// Client-Id/Api-Key commonly differ between a dev and a prod Ozon seller account.',
    'const resolveOzonField = async (credentialId: string, field: string): Promise<string> => {',
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
    "    body: JSON.stringify({ credentialId, vendor: 'ozon', field, projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve Ozon credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
    '',
    "// Per-method HTTP routing, generated from Ozon's own OpenAPI spec — see ozon.generated.ts.",
    '// Explicitly typed as a Record (not inferred from the object-literal below, which TS would',
    '// otherwise narrow to its exact ~470 literal keys) — `OZON_ROUTES[method]` below indexes with an',
    '// arbitrary runtime string, which only type-checks against a real index signature.',
    'const OZON_ROUTES: Record<',
    '  string,',
    '  {',
    '    httpMethod: string;',
    '    path: string;',
    '    baseUrl: string;',
    '    pathParams: string[];',
    '    queryParams: string[];',
    "    bodyMode: 'spread' | 'whole';",
    '  }',
    `> = ${JSON.stringify(OZON_ROUTES)};`,
  ].join('\n'),
};
