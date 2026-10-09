import type { TVariableInfo } from '@falang/typescript-dto';
import type {
  IActionDescriptor,
  IFieldSelectOption,
  IIntegrationStructType,
} from '@falang/workflow-integrations-common';
import { AMOCRM_METHODS, type IAmoCrmMethod } from './amocrm-methods.js';
import { AMOCRM_CALL_METHOD_NAME, AMOCRM_VENDOR } from './constants.js';

const toPascalCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/** The struct the `data` field of `amocrm-call-method` is typed against when `method` is `methodId`. */
export const amocrmMethodParamsStructId = (methodId: string): string => `amocrm/params/${methodId}`;

const methodParamsStruct = (method: IAmoCrmMethod): IIntegrationStructType => {
  const properties: Record<string, TVariableInfo> = {};
  for (const param of method.pathParams) properties[param.name] = { ...param.type, optional: false };
  for (const param of method.queryParams) {
    properties[param.name] = param.required ? param.type : { ...param.type, optional: true };
  }
  if (method.body) properties.body = method.body;
  return { id: amocrmMethodParamsStructId(method.id), name: `AmoCrm${toPascalCase(method.id)}Params`, properties };
};

/** One params struct per catalog method: path params (required), query params, and `body` when the method sends one. */
export const AMOCRM_METHOD_STRUCT_TYPES: readonly IIntegrationStructType[] = AMOCRM_METHODS.map((method) =>
  methodParamsStruct(method),
);

export const AMOCRM_METHOD_OPTIONS: readonly IFieldSelectOption[] = AMOCRM_METHODS.map((method) => ({
  value: method.id,
  label: `amocrm:method.${method.id}`,
}));

const METHOD_BY_ID = new Map(AMOCRM_METHODS.map((method) => [method.id, method]));

/** Per-method routing the runner needs — inlined as a literal into the activity code (activities.ts can't import this package's catalog at runtime by design: it is a concatenation of strings). */
export const AMOCRM_ROUTES: Readonly<
  Record<string, { httpMethod: string; path: string; pathParams: string[]; queryParams: string[]; hasBody: boolean }>
> = Object.fromEntries(
  AMOCRM_METHODS.map((method) => [
    method.id,
    {
      httpMethod: method.httpMethod,
      path: method.path,
      pathParams: method.pathParams.map((param) => param.name),
      queryParams: method.queryParams.map((param) => param.name),
      hasBody: Boolean(method.body),
    },
  ]),
);

/**
 * The generic "call any amoCRM API v4 method" action — the same "one icon, dynamically typed `data`"
 * shape as Ozon/МойСклад (see `ozonIntegration`'s doc comment), over a catalog written by hand from
 * the official PHP client (`amocrm-methods.ts`) instead of a generated OpenAPI spec (amoCRM publishes
 * none). `data` holds the path params, the query params (`filter`/`order` may be nested objects —
 * serialized PHP-style, `filter[id][0]=1`) and `body`. The result is the raw JSON answer (`null` for
 * HTTP 204, amoCRM's "nothing found"), so list methods return `{ _page, _links, _embedded: { … } }`.
 */
export const amocrmCallMethodAction: IActionDescriptor = {
  name: AMOCRM_CALL_METHOD_NAME,
  label: 'amocrm:action.callMethod',
  editorType: 'sidebar',
  fields: [
    { name: 'credentialId', label: 'amocrm:field.account', kind: 'credential-ref', vendor: AMOCRM_VENDOR },
    { name: 'method', label: 'amocrm:field.method', kind: 'select', options: AMOCRM_METHOD_OPTIONS },
    {
      name: 'data',
      label: 'amocrm:field.data',
      kind: 'expression',
      defaultValue: '{}',
      expectedType: (fields) => {
        const method = METHOD_BY_ID.get(fields.method ?? '');
        if (!method) return;
        return { type: 'struct', id: amocrmMethodParamsStructId(method.id) };
      },
    },
    { name: 'resultVariable', label: 'amocrm:field.resultVariable', kind: 'new-variable' },
  ],
  emit: (fields) => {
    const data = fields.data && fields.data.trim() !== '' ? fields.data : '{}';
    const call = `await amocrmCallMethod(${fields.credentialId}, ${fields.method}, ${data})`;
    return fields.resultVariable ? `const ${fields.resultVariable} = ${call};` : `${call};`;
  },
  activitySignature:
    'amocrmCallMethod(credentialId: string, method: string, data: Record<string, unknown>): Promise<any>',
  // TypeScript source emitted verbatim into activities.ts — the `${...}` placeholders interpolate there.
  activityCode: [
    '// Per-method routing of the amoCRM catalog — see amocrm-methods.ts. Typed as a Record so',
    '// `AMOCRM_ROUTES[method]` type-checks with an arbitrary runtime string.',
    'const AMOCRM_ROUTES: Record<',
    '  string,',
    '  { httpMethod: string; path: string; pathParams: string[]; queryParams: string[]; hasBody: boolean }',
    `> = ${JSON.stringify(AMOCRM_ROUTES)};`,
    '',
    'export const amocrmCallMethod = async (',
    '  credentialId: string,',
    '  method: string,',
    '  data: Record<string, unknown>,',
    '): Promise<any> => {',
    '  const route = AMOCRM_ROUTES[method];',
    "  if (!route) throw ApplicationFailure.nonRetryable(`Unknown amoCRM method: ${method}`, 'AMOCRM_INVALID_ARGUMENT');",
    '  const params = data ?? {};',
    '  let path = route.path;',
    '  for (const name of route.pathParams) {',
    '    const value = params[name];',
    "    const text = value === undefined || value === null ? '' : String(value);",
    '    if (!/^[A-Za-z0-9_-]+$/.test(text)) {',
    '      throw ApplicationFailure.nonRetryable(`amoCRM ${method}: invalid or missing "${name}"`, \'AMOCRM_INVALID_ARGUMENT\');',
    '    }',
    '    path = path.replace(`{${name}}`, text);',
    '  }',
    '  const query: Record<string, unknown> = {};',
    '  for (const name of route.queryParams) {',
    '    if (params[name] !== undefined) query[name] = params[name];',
    '  }',
    '  return amocrmRequest(credentialId, route.httpMethod, path, query, route.hasBody ? params.body : undefined);',
    '};',
  ].join('\n'),
  resultType: { type: 'any' },
};
