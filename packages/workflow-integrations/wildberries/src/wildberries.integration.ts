import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { WILDBERRIES_CALL_METHOD_NAME, WILDBERRIES_VENDOR } from './constants.js';
import {
  WILDBERRIES_METHOD_OPTIONS,
  WILDBERRIES_METHOD_STRUCT_ID,
  WILDBERRIES_ROUTES,
  WILDBERRIES_STRUCT_TYPES,
} from './wildberries.generated.js';

export * from './constants.js';
export * from './wildberries.generated.js';

/**
 * Wildberries Seller API — marketplace, P1 in ADR 0017 (private).
 * Same "one icon, dynamically-typed `data` field" shape as `ozonIntegration` (see that package's own
 * doc comment for the mechanism itself — `IFieldConfig.expectedType`'s function form,
 * `IntegrationActionEditorStore.refreshDynamicExpressionTypes`), generated from
 * `wildberries.generated.ts` (`scripts/generate-openapi-integration.mjs`, never hand-edited).
 *
 * Spec source: `eslazarev/wildberries-sdk`'s 13 per-category YAML files (no official machine-readable
 * spec is fetchable — `dev.wildberries.ru`'s own swagger UI blocks automated fetches). Two files this
 * mirror ships were deliberately excluded from the generator config: `05-orders-dbs.yaml` (a stale
 * strict subset of `05-dbs.yaml` — every one of its 20 operationIds also appears in `05-dbs.yaml`,
 * which additionally has `postV3DbsOrdersFinalPrice`; including both would have collided 20
 * operationIds) and `14-wbd.yaml` (Wildberries' separate WBD "Цифровой" digital-goods API — a
 * different `securitySchemes` entry, and per ADR 0017's own vendor findings, `Bearer`-prefixed auth
 * unlike the Seller API's raw-token header below; out of scope for this package).
 *
 * Unlike Ozon's single `servers[0].url`, Wildberries declares `servers` **per path**, not once at the
 * document root, and even within one category file different paths point at different hosts (e.g.
 * `02-items.yaml` spans `content-api`/`discounts-prices-api`/`marketplace-api`) — the generator now
 * reads a path's own `servers[0].url` when present (see `build-vendor-integration.mjs`), falling back
 * to the doc's most common path-level host only for the handful of operations (9, across
 * `08-promotion.yaml`/`09-communications.yaml`) that declare no `servers` at all anywhere.
 *
 * Auth: `Authorization: <token>` — **the raw token, with no `Bearer` prefix**, unlike every other
 * vendor package in this repo and unlike Wildberries' own WBD API. Verified against
 * `dev.wildberries.ru`'s own docs (see ADR 0017's vendor findings). Tokens are generated per-scope in
 * the seller cabinet, valid 180 days with no refresh flow — expiry is a manual token-regeneration
 * operational concern, not a code path here, so `resolveWildberriesField` is a plain env-aware lookup
 * (dev/prod, mirroring `onecIntegration`/`ozonIntegration`'s own resolvers), not an OAuth2 one.
 *
 * Rate limits are hard per-method caps (e.g. statistics endpoints: 1 request/minute — exceeding it is
 * a guaranteed 429), surfaced via `X-Ratelimit-Limit`/`X-Ratelimit-Remaining`/`X-Ratelimit-Retry`
 * response headers. Deliberately not read/parsed here: `runner`'s Temporal-backed activity retry
 * (backoff policy configured on the node) already handles a 429-and-wait loop without any
 * vendor-specific header parsing — exactly the differentiation pillar ADR 0017 leads with.
 *
 * Known fidelity gaps from the generator (see `schema-to-variable-info.mjs`'s own doc comment, plus
 * this vendor's own multi-file wrinkles): OpenAPI string enums degrade to plain `string` (49 across
 * this spec), a handful of genuinely untyped schemas fall back to `any` (3), and 2 media-upload
 * operations (`postV1MediaFile`-style endpoints, `multipart/form-data` bodies with `X-Nm-Id`/
 * `X-Photo-Number` header params) have no body/header fields captured at all — the generator only ever
 * read `application/json` request bodies and path/query params, never `multipart/form-data` or
 * `in: header` operation parameters (true for Ozon too, just never exercised until this vendor's
 * media-upload methods). Real, new plumbing if ever needed — not fixed here, same "flag it, don't
 * guess" call this ADR's Т-Банк mTLS/1С CSRF sections already made for other vendors' gaps.
 */
export const wildberriesIntegration: IWorkflowIntegration = {
  vendor: WILDBERRIES_VENDOR,
  label: 'Wildberries Seller API',
  notes:
    'Wildberries Seller API — marketplace / e-commerce seller account: call any Wildberries seller API method (products/cards, stocks, prices, orders, supplies, statistics, feedback).',
  credentialFields: [{ name: 'apiToken', label: 'API-токен', kind: 'secret' }],
  triggers: [],
  types: WILDBERRIES_STRUCT_TYPES,
  actions: [
    {
      name: WILDBERRIES_CALL_METHOD_NAME,
      label: 'Wildberries: Call method',
      editorType: 'sidebar',
      fields: [
        { name: 'credentialId', label: 'Account', kind: 'credential-ref', vendor: WILDBERRIES_VENDOR },
        { name: 'method', label: 'Method', kind: 'select', options: WILDBERRIES_METHOD_OPTIONS },
        {
          name: 'data',
          label: 'Data',
          kind: 'expression',
          expectedType: (fields) => {
            const structId = WILDBERRIES_METHOD_STRUCT_ID[fields.method ?? ''];
            if (!structId) return;
            return { type: 'struct', id: structId };
          },
        },
        { name: 'resultVariable', label: 'Result variable', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const call = `await wildberriesCallMethod(${fields.credentialId}, ${fields.method}, ${fields.data})`;
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature:
        'wildberriesCallMethod(credentialId: string, method: string, data: Record<string, unknown>): Promise<unknown>',
      // These strings are TypeScript source emitted verbatim into activities.ts, not code executed
      // here — the `${...}` template placeholders below are meant to survive as literal text and
      // interpolate when that emitted file runs, not now.
      activityCode: [
        'export const wildberriesCallMethod = async (',
        '  credentialId: string,',
        '  method: string,',
        '  data: Record<string, unknown>,',
        '): Promise<unknown> => {',
        '  const route = WILDBERRIES_ROUTES[method];',
        '  if (!route) throw new Error(`Unknown Wildberries method: ${method}`);',
        "  const apiToken = await resolveWildberriesField(credentialId, 'apiToken');",
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
        "    headers: { 'Content-Type': 'application/json', Authorization: apiToken },",
        '    body: hasBody ? JSON.stringify(bodyPayload) : undefined,',
        '  });',
        '  if (!response.ok) {',
        '    throw new Error(`Wildberries API call (${method}) failed: ${response.status} ${await response.text()}`);',
        '  }',
        "  const contentType = response.headers.get('content-type') ?? '';",
        "  return contentType.includes('application/json') ? await response.json() : await response.text();",
        '};',
      ].join('\n'),
    },
  ],
  sharedActivityCode: [
    '// Resolves a plain (non-OAuth2) credentialId+field -> real value, env-aware like',
    "// onec.integration.ts's resolveOnecField / ozon.integration.ts's resolveOzonField — a seller's",
    '// API token commonly differs between a dev and a prod Wildberries account.',
    'const resolveWildberriesField = async (credentialId: string, field: string): Promise<string> => {',
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
    "    body: JSON.stringify({ credentialId, vendor: 'wildberries', field, projectId, env }),",
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Failed to resolve Wildberries credential ${credentialId}/${field}: ${response.status} ${await response.text()}`);',
    '  }',
    '  const data = (await response.json()) as { value: string };',
    '  return data.value;',
    '};',
    '',
    "// Per-method HTTP routing, generated from Wildberries' own OpenAPI spec — see wildberries.generated.ts.",
    '// Explicitly typed as a Record (not inferred from the object-literal below, which TS would',
    '// otherwise narrow to its exact ~266 literal keys) — `WILDBERRIES_ROUTES[method]` below indexes',
    '// with an arbitrary runtime string, which only type-checks against a real index signature.',
    'const WILDBERRIES_ROUTES: Record<',
    '  string,',
    '  {',
    '    httpMethod: string;',
    '    path: string;',
    '    baseUrl: string;',
    '    pathParams: string[];',
    '    queryParams: string[];',
    "    bodyMode: 'spread' | 'whole';",
    '  }',
    `> = ${JSON.stringify(WILDBERRIES_ROUTES)};`,
  ].join('\n'),
};
