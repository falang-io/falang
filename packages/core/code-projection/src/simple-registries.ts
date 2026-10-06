// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { IFunctionNames, ITypeNames, TNamedTypeRef } from './types.js';

/** `ITypeNames` over plain maps: struct id → name, and `schemeId/iconId` → enum name. Names must be unique. */
export const createTypeNames = (
  structs: ReadonlyMap<string, string> = new Map(),
  enums: ReadonlyMap<string, { readonly schemeId: string; readonly iconId: string; readonly name: string }> = new Map(),
): ITypeNames => {
  const byName = new Map<string, TNamedTypeRef>();
  for (const [id, name] of structs) byName.set(name, { id, kind: 'struct' });
  for (const entry of enums.values())
    byName.set(entry.name, { iconId: entry.iconId, kind: 'enum', schemeId: entry.schemeId });
  const enumKey = (schemeId: string, iconId: string): string => `${schemeId}/${iconId}`;
  return {
    enumName: (schemeId, iconId) => enums.get(enumKey(schemeId, iconId))?.name,
    resolve: (name) => byName.get(name),
    structName: (id) => structs.get(id),
  };
};

/** `IFunctionNames` over documents (`id`, `name`). */
export const createFunctionNames = (
  documents: readonly { readonly id: string; readonly name: string }[],
): IFunctionNames => {
  const byId = new Map(documents.map((doc) => [doc.id, doc.name]));
  const byName = new Map(documents.map((doc) => [doc.name, doc.id]));
  return { idOf: (name) => byName.get(name), nameOf: (id) => byId.get(id) };
};
