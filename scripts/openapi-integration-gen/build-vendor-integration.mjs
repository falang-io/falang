import { schemaToVariableInfo } from './schema-to-variable-info.mjs';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const resolveRefPlain = (doc, ref) => {
  const parts = ref.replace(/^#\//, '').split('/');
  let node = doc;
  for (const part of parts) node = node?.[part];
  return node;
};

const resolveParam = (doc, param) => (param.$ref ? resolveRefPlain(doc, param.$ref) : param);

const collectParams = (doc, pathItem, op, skipParamNames) => {
  const pathLevelParams = (pathItem.parameters ?? []).map((param) => resolveParam(doc, param));
  const opParams = (op.parameters ?? []).map((param) => resolveParam(doc, param));
  return [...pathLevelParams, ...opParams].filter((param) => param && !skipParamNames.includes(param.name));
};

const addParamProperties = (params, kind, properties, propertyOrigin, ctx, operationId) => {
  for (const param of params) {
    const type = schemaToVariableInfo(param.schema ?? { type: 'string' }, ctx, `${operationId}_${param.name}`);
    properties[param.name] = param.required || kind === 'path' ? type : { ...type, optional: true };
    propertyOrigin[param.name] = kind;
  }
};

const addRequestBodyProperties = (doc, op, properties, propertyOrigin, ctx, operationId) => {
  const requestBodySchema = op.requestBody?.content?.['application/json']?.schema;
  if (!requestBodySchema) return;
  const resolved = requestBodySchema.$ref ? resolveRefPlain(doc, requestBodySchema.$ref) : requestBodySchema;
  if (!resolved) return;

  if (resolved.type !== 'object' && !resolved.properties) {
    // Non-object body (an array, or a bare scalar) — can't flatten into named properties, so it's
    // passed through as a single `body` property holding the whole payload.
    properties.body = schemaToVariableInfo(requestBodySchema, ctx, `${operationId}_body`);
    propertyOrigin.body = 'wholeBody';
    return;
  }

  const required = new Set(resolved.required);
  for (const [propName, propSchema] of Object.entries(resolved.properties ?? {})) {
    if (propName in properties) continue;
    const type = schemaToVariableInfo(propSchema, ctx, `${operationId}_${propName}`);
    properties[propName] = required.has(propName) ? type : { ...type, optional: true };
    propertyOrigin[propName] = 'body';
  }
};

const buildOperationEntry = (doc, pathItem, path, httpMethod, op, ctx, options) => {
  const operationId = op.operationId;
  const allParams = collectParams(doc, pathItem, op, options.skipParamNames);
  const pathParams = allParams.filter((param) => param.in === 'path');
  const queryParams = allParams.filter((param) => param.in === 'query');

  const properties = {};
  const propertyOrigin = {};
  addParamProperties(pathParams, 'path', properties, propertyOrigin, ctx, operationId);
  addParamProperties(queryParams, 'query', properties, propertyOrigin, ctx, operationId);
  addRequestBodyProperties(doc, op, properties, propertyOrigin, ctx, operationId);

  const structId = `${options.vendorPrefix}__${operationId}__Params`;
  ctx.structsById.set(structId, { id: structId, name: `${operationId}Params`, properties });

  return {
    operationId,
    summary: op.summary || op.description?.split('\n')[0] || operationId,
    httpMethod: httpMethod.toUpperCase(),
    path,
    // A path-item's own `servers` (Wildberries declares these per-path, not once at the doc root —
    // and even within one category file, different paths can point at different hosts, e.g.
    // `02-items.yaml` spans `content-api`/`discounts-prices-api`/`marketplace-api`) wins over the
    // doc-wide default when present; the prod entry is always listed first, sandbox (when present)
    // second — verified against every path in Wildberries' 13 category specs.
    baseUrl: pathItem.servers?.[0]?.url ?? options.docBaseUrl,
    structId,
    pathParams: pathParams.map((param) => param.name),
    queryParams: queryParams.map((param) => param.name),
    bodyMode: propertyOrigin.body === 'wholeBody' ? 'whole' : 'spread',
  };
};

// A handful of Wildberries operations declare no `servers` at all, at either the path or the doc
// level (9 paths across `08-promotion.yaml`/`09-communications.yaml`, verified) — falls back to
// whichever host the rest of that same doc's paths overwhelmingly agree on (e.g. 26 of 34
// `08-promotion.yaml` paths point at `advert-api.wildberries.ru`) rather than leaving `baseUrl`
// undefined, which would silently break the emitted route.
const mostCommonPathServerUrl = (doc) => {
  const counts = new Map();
  for (const pathItem of Object.values(doc.paths ?? {})) {
    const url = pathItem.servers?.[0]?.url;
    if (!url) continue;
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].toSorted((a, b) => b[1] - a[1]);
  return ranked[0]?.[0];
};

const docLabelOf = (doc, index) => {
  const raw = typeof doc.info?.version === 'string' && doc.info.version ? doc.info.version : String(index);
  return raw.replaceAll(/[^a-zA-Z0-9_]/g, '_');
};

const buildDocMethods = (doc, ctx, options) => {
  const methods = [];
  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const httpMethod of HTTP_METHODS) {
      const op = pathItem[httpMethod];
      if (!op) continue;
      if (!op.operationId) {
        ctx.stats.skippedNoOperationId += 1;
        continue;
      }
      methods.push(buildOperationEntry(doc, pathItem, path, httpMethod, op, ctx, options));
      ctx.stats.operations += 1;
    }
  }
  return methods;
};

/**
 * Builds one vendor's worth of generated data from one or more already-parsed OpenAPI 3.x documents
 * (multiple documents for vendors like Wildberries that split their spec into several category
 * files, each with its own `paths`/`components`). Every operation across every document becomes one
 * flattened "params struct" (path params + query params + request-body's own top-level properties,
 * minus `skipParamNames`, e.g. the vendor's own auth headers) and one routing-table entry.
 *
 * @param {readonly unknown[]} docs
 * @param {{ vendorPrefix: string, skipParamNames: readonly string[], baseUrl?: string }} vendorOptions
 */
export const buildVendorIntegration = (docs, vendorOptions) => {
  const stats = {
    operations: 0,
    structs: 0,
    enumsDegraded: 0,
    anyFallbacks: 0,
    allOfMerged: 0,
    skippedNoOperationId: 0,
  };
  const structsById = new Map();
  const structIdBySignature = new Map();
  const seenRefNames = new Set();
  const allOfIdBySchema = new WeakMap();
  const ctx = { structsById, structIdBySignature, seenRefNames, allOfIdBySchema, stats };

  const methods = docs.flatMap((doc, docIndex) => {
    const docBaseUrl =
      vendorOptions.baseUrl ?? doc.servers?.[0]?.url?.replace(/^\/\//, 'https://') ?? mostCommonPathServerUrl(doc);
    const docCtx = { ...ctx, doc, vendorPrefix: vendorOptions.vendorPrefix, docLabel: docLabelOf(doc, docIndex) };
    return buildDocMethods(doc, docCtx, { ...vendorOptions, docBaseUrl });
  });

  stats.structs = structsById.size;
  return { methods, structs: [...structsById.values()], stats };
};
