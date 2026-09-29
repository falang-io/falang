import type ts from 'typescript';

/**
 * True for `string` (and string-literal types, e.g. `"a" | "b"`). Goes through `typeToString` rather
 * than the flags bitmask (`ts.TypeFlags.StringLike`, which needs a `&` this repo's oxlint config
 * disallows) — good enough for the well-known scope types `variableInfoToTsType` ever produces, which
 * never include a bare string-literal type.
 */
export const isStringLikeType = (type: ts.Type, checker: ts.TypeChecker): boolean =>
  checker.typeToString(type) === 'string';

/**
 * True for `T[]`/`Array<T>`/`ReadonlyArray<T>`. `ts.TypeChecker` has no public `isArrayType` — this
 * goes through `typeToString` rather than reaching for the internal (unexported) checker API, which
 * is good enough for the well-known scope types `variableInfoToTsType` ever produces.
 */
export const isArrayLikeType = (type: ts.Type, checker: ts.TypeChecker): boolean => {
  const typeText = checker.typeToString(type);
  return typeText.endsWith('[]') || typeText.startsWith('Array<') || typeText.startsWith('ReadonlyArray<');
};
