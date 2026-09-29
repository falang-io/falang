import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { MOYSKLAD_CALL_METHOD_NAME, MOYSKLAD_VENDOR } from './constants.js';
import {
  MOYSKLAD_METHOD_OPTIONS,
  MOYSKLAD_METHOD_STRUCT_ID,
  MOYSKLAD_ROUTES,
  MOYSKLAD_STRUCT_TYPES,
} from './moysklad.generated.js';

export * from './constants.js';
export * from './moysklad.generated.js';

/**
 * МойСклад (`api.moysklad.ru/api/remap/1.2`) — inventory, P1 in
 * ADR 0017 (private). Same "one icon, dynamically-typed `data`
 * field" shape as `ozonIntegration`/`wildberriesIntegration` (see `ozonIntegration`'s own doc comment
 * for the mechanism itself), generated from `moysklad.generated.ts`
 * (`scripts/generate-openapi-integration.mjs`, never hand-edited) — the best case of the three vendors
 * this ADR section named: the vendor's own GitHub Releases (`moysklad/api-remap-1.2-openapi-specification`,
 * tag `0.28.0`) publish a fully `$ref`-resolved single-file `openapi.json` built with `redocly bundle`,
 * so no YAML/multi-file handling was needed the way Wildberries required — just download and point the
 * existing generator at it. 1230 operations, every one with an `operationId` (0 skipped), 1968
 * generated struct types.
 *
 * Building this spec at 1230 operations (nearly 3x Ozon's 470) hit a real generator bug Ozon's single,
 * shallower doc never exercised: a cyclic `allOf` chain (МойСклад's schemas lean on
 * `allOf: [{$ref: someWrapper}, {properties: {...}}]` for inheritance far more than Ozon's spec did)
 * recursed the generator's own schema walker until the call stack overflowed, since the `allOf`-merge
 * path recomputed a fresh id on every visit instead of reusing a stable one the way a named `$ref`
 * already did. Fixed in `schema-to-variable-info.mjs` (a `WeakMap<schema, id>` keyed by the `allOf`
 * schema object's own identity, registered before merging/recursing) — see that file's own comment.
 *
 * Auth: `Authorization: Bearer <token>` — a long-lived access token generated in the МойСклад web UI
 * (Basic auth with login/password also works per the vendor's own docs, but they recommend Bearer for
 * server-side/production use, so that's what this package exposes). Issuing a new token **revokes the
 * previous one for that user** — a real "swap the credential value, don't run both old and new
 * workflows at once" operational concern, not a code path. `resolveMoyskladField` is a plain env-aware
 * lookup (dev/prod, mirroring `wildberriesIntegration`/`ozonIntegration`'s own resolvers), not OAuth2 —
 * there's no refresh flow, just a static token the user pastes in.
 *
 * Rate limit: 45 requests per 3-second sliding window, 429 with `X-Lognex-Retry-After` (milliseconds —
 * the one vendor in this ADR with that unit, everyone else's retry-after is seconds) plus
 * `X-RateLimit-Limit`/`X-RateLimit-Remaining`. Deliberately not read/parsed here, same call as
 * Wildberries/Ozon above — `runner`'s Temporal-backed activity retry already handles a 429-and-wait
 * loop without vendor-specific header parsing.
 *
 * Known fidelity gaps from the generator (see `schema-to-variable-info.mjs`'s own doc comment):
 * OpenAPI string enums degrade to plain `string` (98 across this spec — the largest count of any
 * vendor here, matching how heavily МойСклад's domain model leans on enumerated fields), and `allOf`
 * composition is approximated by merging every branch's properties into one flat object (394 merges —
 * again the largest count here, this vendor's own inheritance-heavy schema style).
 */
export const moyskladIntegration: IWorkflowIntegration = {
  vendor: MOYSKLAD_VENDOR,
  label: 'МойСклад',
  notes:
    'MoySklad (МойСклад) — inventory / warehouse / trade management (ERP): call any MoySklad JSON API method (products, stock, counterparties, customer orders, sales, purchases, documents).',
  credentialFields: [{ name: 'accessToken', label: 'Access token', kind: 'secret' }],
  triggers: [],
  types: MOYSKLAD_STRUCT_TYPES,
  actions: [
    {
      name: MOYSKLAD_CALL_METHOD_NAME,
      label: 'МойСклад: Call method',
      editorType: 'sidebar',
      fields: [
        { name: 'credentialId', label: 'Account', kind: 'credential-ref', vendor: MOYSKLAD_VENDOR },
        { name: 'method', label: 'Method', kind: 'select', options: MOYSKLAD_METHOD_OPTIONS },
        {
          name: 'data',
          label: 'Data',
          kind: 'expression',
          expectedType: (fields) => {
            const structId = MOYSKLAD_METHOD_STRUCT_ID[fields.method ?? ''];
            if (!structId) return;
            return { type: 'struct', id: structId };
          },
        },
        { name: 'resultVariable', label: 'Result variable', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await moyskladCallMethod(${fields.credentialId}, ${fields.method}, ${fields.data})`;
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature:
        'moyskladCallMethod(credentialId: string, method: string, data: Record<string, unknown>): Promise<unknown>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const moyskladCallMethod = async (',
        '  credentialId: string,',
        '  method: string,',
        '  data: Record<string, unknown>,',
        '): Promise<unknown> => {',
        '  const route = MOYSKLAD_ROUTES[method];',
        '  if (!route) throw new Error(`Unknown МойСклад method: ${method}`);',
        "  const accessToken = await resolveMoyskladField(credentialId, 'accessToken');",
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
        "    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },",
        '    body: hasBody ? JSON.stringify(bodyPayload) : undefined,',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`МойСклад API call (${method}) failed: ${response.status} ${await response.text()}`);',
        '  }',
        "  const contentType = response.headers.get('content-type') ?? '';",
        "  return contentType.includes('application/json') ? await response.json() : await response.text();",
        '};',
      ].join('\n'),
    },
  ],
  sharedActivityCode: [
    '// Resolves a plain (non-OAuth2) credentialId+field -> real value, env-aware like',
    "// wildberries.integration.ts's resolveWildberriesField / ozon.integration.ts's resolveOzonField —",
    '// an access token commonly differs between a dev and a prod МойСклад account.',
    'const resolveMoyskladField = async (credentialId: string, field: string): Promise<string> => {',
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
    "    body: JSON.stringify({ credentialId, vendor: 'moysklad', field, projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve МойСклад credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
    '',
    "// Per-method HTTP routing, generated from МойСклад's own OpenAPI spec — see moysklad.generated.ts.",
    '// Explicitly typed as a Record (not inferred from the object-literal below, which TS would',
    '// otherwise narrow to its exact ~1230 literal keys) — `MOYSKLAD_ROUTES[method]` below indexes',
    '// with an arbitrary runtime string, which only type-checks against a real index signature.',
    'const MOYSKLAD_ROUTES: Record<',
    '  string,',
    '  {',
    '    httpMethod: string;',
    '    path: string;',
    '    baseUrl: string;',
    '    pathParams: string[];',
    '    queryParams: string[];',
    "    bodyMode: 'spread' | 'whole';",
    '  }',
    `> = ${JSON.stringify(MOYSKLAD_ROUTES)};`,
  ].join('\n'),
};
