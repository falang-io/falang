import type { IFieldSelectOption, IWorkflowIntegration } from '@falang/workflow-integrations-common';

export const HTTP_REQUEST_VENDOR = 'http-request';
export const HTTP_REQUEST_ACTION_NAME = 'http-request';

const HTTP_METHOD_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
];

/** See ADR 0038 (private) §4's `http-request` row. `auto` (default) keeps today's
 *  content-type-sniffing behavior; `file` streams the response body straight into a `File` instead. */
const HTTP_RESPONSE_AS_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'file', label: 'File' },
];

/**
 * Generic outbound HTTP call — closes any integration gap that doesn't have (and may never get) a
 * bespoke vendor package. Deliberately credential-free (`credentialFields: []`): a workflow author
 * types auth directly into the `headers` expression (e.g. `{ Authorization: 'Bearer ' + token }`)
 * rather than going through the credential-ref/secret system — no external provider to encrypt a
 * secret *for*, and requiring an "add integration" step first would defeat the point of a node that
 * should work the moment it's dropped on the canvas.
 */
export const httpRequestIntegration: IWorkflowIntegration = {
  vendor: HTTP_REQUEST_VENDOR,
  label: 'http-request:label',
  notes:
    'Generic HTTP request (REST API call, fetch, GET/POST/PUT/DELETE to any URL) — the fallback for talking to any web service that has no dedicated integration. Needs no credentials.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: HTTP_REQUEST_ACTION_NAME,
      label: 'http-request:label',
      // Multi-field editor (method/url/headers/body/result), same reasoning as call-ai-text.
      editorType: 'sidebar',
      fields: [
        { name: 'method', label: 'http-request:field.method', kind: 'select', options: HTTP_METHOD_OPTIONS },
        { name: 'url', label: 'http-request:field.url', kind: 'template-string' },
        // No dedicated key-value-list/JSON field kind exists yet (see
        // `@falang/workflow-integrations-common`'s `TIntegrationFieldKind`), and `TVariableInfo` has no
        // generic record/dictionary type to constrain an `expectedType` with — a plain, unconstrained
        // TS object-literal expression is the closest fit today. Left empty, both resolve to `undefined`
        // at the call site (see `emit` below).
        { name: 'headers', label: 'http-request:field.headers', kind: 'expression' },
        { name: 'body', label: 'http-request:field.body', kind: 'expression' },
        {
          name: 'responseAs',
          label: 'http-request:field.responseAs',
          kind: 'select',
          options: HTTP_RESPONSE_AS_OPTIONS,
        },
        { name: 'resultVariable', label: 'http-request:field.result', kind: 'new-variable' },
      ],
      emit: (fields) => {
        const headers = fields.headers || 'undefined';
        const body = fields.body || 'undefined';
        // `resolveFieldExpression` JSON.stringifies every `select` value, so an unset field arrives
        // here as the literal 2-char string `'""'`, not `''` — a document saved before this field
        // existed has no `responseAs` key in `fields` at all (plain `undefined`). Both fall back to
        // `'auto'`, matching today's content-type-sniffing behavior exactly.
        const responseAs = fields.responseAs && fields.responseAs !== '""' ? fields.responseAs : "'auto'";
        const call = `await httpRequest(${fields.method}, ${fields.url}, ${headers}, ${body}, ${responseAs})`;
        // `resultVariable` is a bare identifier (see `resolveFieldExpression`'s `'new-variable'`
        // pass-through) — empty only for a node created but never edited yet, in which case the call is
        // still emitted, just without capturing its response anywhere.
        return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
      },
      activitySignature:
        'httpRequest(method: string, url: string, headers: Record<string, string> | undefined, body: unknown, responseAs: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }>',
      // The activity's real return shape (`{ status, headers, body }`) has no registered struct type
      // to point at — declared explicitly as `any` anyway (rather than left absent, which resolves to
      // the same default) so it's documented here as a deliberate choice, not an oversight. When
      // `responseAs: 'file'`, `body` is a `files/File` (see ADR 0038 (private) §4) — still `any`,
      // since `resultType` describes the whole `{ status, headers, body }` object, not just `body`.
      resultType: { type: 'any' },
      // Streams a request/response body through `@falang/workflow-integrations-files`'s helpers once
      // either side is (or should become) a `File` — a 50 MB+ transfer doesn't fit the SDK-default
      // local-activity timeout, hence `activityOptions` below (ADR 0038 (private) §3).
      activityOptions: { kind: 'regular', startToCloseTimeout: '10 minutes', heartbeatTimeout: '1 minute' },
      // Verbatim TS emitted into activities.ts — no credential resolution, unlike Telegram/OpenAI's
      // activities, since this vendor has no credentialFields to resolve. `FalangFiles` is imported as
      // a namespace (not named imports) in `sharedActivityCode` below so this never collides with
      // whatever names the `files` vendor's own `sharedActivityCode` imports from the same package —
      // both are always compiled into the same `activities.ts` module (see `compileActivities`).
      activityCode: [
        'export const httpRequest = async (',
        '  method: string,',
        '  url: string,',
        '  headers: Record<string, string> | undefined,',
        '  body: unknown,',
        '  responseAs: string,',
        '): Promise<{ status: number; headers: Record<string, string>; body: unknown }> => {',
        '  heartbeat();',
        '  const isFileRef = (',
        '    value: unknown,',
        '  ): value is { id: string; name: string; size: number; mime: string } =>',
        "    typeof value === 'object' &&",
        '    value !== null &&',
        "    typeof (value as Record<string, unknown>).id === 'string' &&",
        "    typeof (value as Record<string, unknown>).name === 'string' &&",
        "    typeof (value as Record<string, unknown>).size === 'number' &&",
        "    typeof (value as Record<string, unknown>).mime === 'string';",
        '  const requestHeaders: Record<string, string> = { ...headers };',
        '  let requestBody: BodyInit | undefined;',
        "  let duplex: 'half' | undefined;",
        '  if (isFileRef(body)) {',
        '    requestBody = await FalangFiles.openFileStream(body);',
        "    duplex = 'half';",
        "    if (!Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) {",
        "      requestHeaders['content-type'] = body.mime;",
        '    }',
        '  } else if (body !== undefined) {',
        "    requestBody = typeof body === 'string' ? body : JSON.stringify(body);",
        '  }',
        '  const fetchInit = { method, headers: requestHeaders, body: requestBody, duplex } as RequestInit & {',
        "    duplex?: 'half';",
        '  };',
        '  const response = await fetch(url, fetchInit);',
        '  const responseHeaders = Object.fromEntries(response.headers.entries());',
        "  if (responseAs === 'file') {",
        '    if (!response.body) throw new Error(`http-request: no response body for ${url}`);',
        "    const contentDisposition = response.headers.get('content-disposition') ?? '';",
        '    const dispositionMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);',
        "    const fallbackName = url.split('/').pop()?.split('?')[0] || 'file';",
        '    const name = dispositionMatch?.[1] || fallbackName;',
        "    const mime = response.headers.get('content-type') ?? 'application/octet-stream';",
        '    heartbeat();',
        '    const file = await FalangFiles.uploadFileFromStream(response.body, { name, mime });',
        '    return { status: response.status, headers: responseHeaders, body: file };',
        '  }',
        "  const contentType = response.headers.get('content-type') ?? '';",
        '  let responseBody: unknown;',
        "  if (responseAs === 'text') {",
        '    responseBody = await response.text();',
        "  } else if (responseAs === 'json') {",
        '    responseBody = await response.json();',
        '  } else {',
        "    responseBody = contentType.includes('application/json') ? await response.json() : await response.text();",
        '  }',
        '  return { status: response.status, headers: responseHeaders, body: responseBody };',
        '};',
      ].join('\n'),
    },
  ],
  // Real, exported functions of `@falang/workflow-integrations-files` — imported as a namespace
  // (see the action's own `activityCode` comment above), the same "import the shared package" shape
  // `files.integration.ts`'s own `sharedActivityCode` uses for its own helpers; a namespace import
  // (rather than named imports) never collides with whatever names the `files` vendor's own
  // `sharedActivityCode` imports from the same package, since both vendors are always compiled
  // together into one `activities.ts` module (see `@falang/workflow-compiler`'s `compileActivities`).
  sharedActivityCode: [
    "import { heartbeat } from '@temporalio/activity';",
    "import * as FalangFiles from '@falang/workflow-integrations-files';",
  ].join('\n'),
};
