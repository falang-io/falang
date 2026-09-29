// Walks an OpenAPI 3.x schema object and produces a `TVariableInfo` (see
// packages/workflow-integrations/common/src/types.ts / packages/typescript/dto/src/dtos/types.ts),
// registering one `IIntegrationStructType` per object schema it encounters (named schemas keyed by
// their `$ref` name, deduplicated; inline/anonymous object schemas keyed by a synthesized hint path).
//
// Known, deliberate fidelity gaps (documented, not silently wrong):
// - OpenAPI string enums degrade to a plain `string` — `TVariableInfo`'s own `enum` variant needs a
//   `schemeId` pointing at a project-authored enum document and isn't even resolved by
//   `variableInfoToTsType` (renders `any` regardless), so there's nothing better to map to today.
// - `oneOf`/`anyOf` become `TVariableInfo`'s `union` (a real, working type in this system).
// - `allOf` is approximated by merging every branch's properties into one flat object — an
//   approximation of intersection via union-of-properties, not exact, but matches how `allOf` is
//   used in practice (composition/inheritance) far better than falling back to `any`.
// - Anything else unresolvable (raw `additionalProperties`-only maps, `not`, missing type/properties)
//   falls back to `any` rather than guessing wrong.

const identifierSafe = (value) => {
  const cleaned = String(value).replaceAll(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(cleaned) ? cleaned : `_${cleaned}`;
};

const refName = (ref) => ref.split('/').pop();

const resolveRef = (doc, ref) => {
  const parts = ref.replace(/^#\//, '').split('/');
  let node = doc;
  for (const part of parts) node = node?.[part];
  if (!node) throw new Error(`Unresolvable $ref: ${ref}`);
  return node;
};

const integerTypeInfo = (format) => ({
  type: 'number',
  numberType: { type: 'integer', integerType: format === 'int64' ? 'int64' : 'int32' },
});

const floatTypeInfo = (format) => ({
  type: 'number',
  numberType: { type: 'float', floatType: format === 'float' ? 'float32' : 'float64' },
});

const scalarTypeInfo = (schema, ctx) => {
  switch (schema.type) {
    case 'string': {
      return { type: 'string' };
    }
    case 'boolean': {
      return { type: 'boolean' };
    }
    case 'integer': {
      return integerTypeInfo(schema.format);
    }
    case 'number': {
      return floatTypeInfo(schema.format);
    }
    default: {
      ctx.stats.anyFallbacks += 1;
      return { type: 'any' };
    }
  }
};

// A named schema (`$ref`) is deduplicated globally across every doc passed to `buildVendorIntegration`
// by (name, shape) rather than by name alone — a multi-file vendor (Wildberries' 13 category specs)
// can genuinely define two different schemas under the same name in two different files (verified: 7
// of Wildberries' 54 cross-file name collisions have different property sets), and silently keeping
// only whichever doc's version was resolved first would mistype every operation in the other file that
// references that name. Same name + identical shape (47 of those 54 collisions) still dedupes to one
// struct, so shared/common schemas repeated verbatim across category files don't bloat the struct list.
const shapeSignature = (schema) => JSON.stringify(Object.keys(schema.properties ?? {}).toSorted());

const namedRefToVariableInfo = (schema, ctx) => {
  const name = refName(schema.$ref);
  const resolved = resolveRef(ctx.doc, schema.$ref);
  const signatureKey = JSON.stringify([name, shapeSignature(resolved)]);
  const existingId = ctx.structIdBySignature.get(signatureKey);
  if (existingId) return { type: 'struct', id: existingId };
  const isFirstShapeForName = !ctx.seenRefNames.has(name);
  ctx.seenRefNames.add(name);
  const id = isFirstShapeForName ? `${ctx.vendorPrefix}__${name}` : `${ctx.vendorPrefix}__${name}__${ctx.docLabel}`;
  ctx.structIdBySignature.set(signatureKey, id);
  return objectSchemaToStruct(resolved, ctx, id, name);
};

const mergeAllOfBranches = (doc, branches) => {
  const merged = { type: 'object', properties: {}, required: [] };
  for (const branch of branches) {
    const resolvedBranch = branch.$ref ? resolveRef(doc, branch.$ref) : branch;
    Object.assign(merged.properties, resolvedBranch.properties ?? {});
    merged.required.push(...(resolvedBranch.required ?? []));
  }
  return merged;
};

/**
 * @param {unknown} schema
 * @param {{
 *   doc: unknown,
 *   vendorPrefix: string,
 *   structsById: Map<string, { id: string; name: string; properties: Record<string, unknown> }>,
 *   structIdBySignature: Map<string, string>,
 *   seenRefNames: Set<string>,
 *   allOfIdBySchema: WeakMap<object, string>,
 *   docLabel: string,
 *   stats: { enumsDegraded: number; anyFallbacks: number; allOfMerged: number },
 * }} ctx
 * @param {string} hint
 * @returns {unknown} TVariableInfo
 */
export const schemaToVariableInfo = (schema, ctx, hint) => {
  if (!schema || typeof schema !== 'object') return { type: 'any' };
  if (schema.$ref) return namedRefToVariableInfo(schema, ctx);

  if (schema.oneOf || schema.anyOf) {
    const branches = schema.oneOf ?? schema.anyOf;
    return {
      type: 'union',
      unionTypes: branches.map((branch, index) => schemaToVariableInfo(branch, ctx, `${hint}_${index}`)),
    };
  }

  if (schema.allOf) {
    // Cycle guard for a self-referential `allOf` chain (МойСклад's `allOf: [{$ref: MetaWrapper}, …]`
    // inheritance pattern hits this for real — 707 paths in, first vendor spec to). Unlike a named
    // $ref (whose id is stable and registered in `structsById` before recursing into its properties,
    // so a cycle resolves to the placeholder), this branch used to compute a fresh hint-derived id on
    // every visit — a cyclic branch never re-derived the *same* id, so `objectSchemaToStruct`'s own
    // "already registered" guard never tripped, recursing until the call stack overflowed. Keyed by
    // the schema object itself (stable identity — the same parsed JSON node every time this exact
    // `allOf` schema is reached again, whether via a repeated $ref or a nested branch), registered
    // before merging/recursing so a cyclic re-entry resolves to the already-assigned id immediately.
    const cachedId = ctx.allOfIdBySchema.get(schema);
    if (cachedId) return { type: 'struct', id: cachedId };
    ctx.stats.allOfMerged += 1;
    const id = `${ctx.vendorPrefix}__${identifierSafe(hint)}`;
    ctx.allOfIdBySchema.set(schema, id);
    const merged = mergeAllOfBranches(ctx.doc, schema.allOf);
    return objectSchemaToStruct(merged, ctx, id, hint);
  }

  if (schema.type === 'array' || schema.items) {
    return { type: 'array', dimensions: 1, elementType: schemaToVariableInfo(schema.items, ctx, `${hint}Item`) };
  }

  if (schema.type === 'object' || schema.properties) {
    return objectSchemaToStruct(schema, ctx, `${ctx.vendorPrefix}__${identifierSafe(hint)}`, hint);
  }

  if (schema.enum && schema.type === 'string') {
    ctx.stats.enumsDegraded += 1;
    return { type: 'string' };
  }

  return scalarTypeInfo(schema, ctx);
};

const objectSchemaToStruct = (schema, ctx, id, name) => {
  if (ctx.structsById.has(id)) return { type: 'struct', id };
  // Register a placeholder first so a self-referential schema (a property that (transitively) points
  // back at this same object) resolves to `{type:'struct', id}` on the recursive call instead of
  // looping forever — then fill in the real properties in place.
  const entry = { id, name, properties: {} };
  ctx.structsById.set(id, entry);
  const required = new Set(schema.required);
  const properties = schema.properties ?? {};
  for (const [propName, propSchema] of Object.entries(properties)) {
    const propType = schemaToVariableInfo(propSchema, ctx, `${name}_${propName}`);
    entry.properties[propName] = required.has(propName) ? propType : { ...propType, optional: true };
  }
  return { type: 'struct', id };
};
