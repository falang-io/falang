// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { TTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import { FloatTypes, IntegerTypes } from '@falang/typescript-dto';
import ts from 'typescript';
import type { ITypeNames } from './types.js';

/**
 * The projection's own ambient type names (declared in `falang.d.ts`, see `FALANG_LIB_DECLARATIONS`). They keep the
 * number details of `TVariableInfo` that plain `number` would lose, so `tree → code → tree` stays lossless, and give
 * unresolved struct/enum ids a printable form.
 */
export const NUMBER_ALIASES = [...IntegerTypes, ...FloatTypes] as readonly string[];
const UNRESOLVED_STRUCT = 'Struct';
const UNRESOLVED_ENUM = 'Enum';
const DECIMAL = 'decimal';

export const TYPE_LIB_DECLARATIONS = [
  ...NUMBER_ALIASES.map((name) => `type ${name} = number;`),
  `type ${DECIMAL}<Digits extends number, Decimals extends number> = number;`,
  `type ${UNRESOLVED_STRUCT}<Id extends string> = any;`,
  `type ${UNRESOLVED_ENUM}<SchemeId extends string, IconId extends string> = any;`,
].join('\n');

const needsParens = (text: string): boolean => /[|&]/.test(text) && !/^\(.*\)$/s.test(text);

const renderTypeInfo = (type: TTypeInfo, names: ITypeNames): string => {
  switch (type.type) {
    case 'string':
    case 'boolean':
    case 'void':
    case 'never':
    case 'any': {
      return type.type;
    }
    case 'number': {
      const detail = type.numberType;
      if (detail.type === 'integer') return detail.integerType;
      if (detail.type === 'float') return detail.floatType;
      if (detail.type === 'decimal') return `${DECIMAL}<${detail.digits}, ${detail.decimals}>`;
      return 'number';
    }
    case 'struct': {
      return names.structName(type.id) ?? `${UNRESOLVED_STRUCT}<${JSON.stringify(type.id)}>`;
    }
    case 'enum': {
      return (
        names.enumName(type.schemeId, type.iconId) ??
        `${UNRESOLVED_ENUM}<${JSON.stringify(type.schemeId)}, ${JSON.stringify(type.iconId)}>`
      );
    }
    case 'array': {
      const element = renderTypeInfo(type.elementType, names);
      return `${needsParens(element) ? `(${element})` : element}${'[]'.repeat(type.dimensions)}`;
    }
    case 'union': {
      return type.unionTypes.map((member) => renderTypeInfo(member, names)).join(' | ');
    }
    default: {
      return 'any';
    }
  }
};

/** `TVariableInfo` → TS type text. `optional` becomes `| undefined`; `constant` is the caller's business (`const`). */
export const renderType = (type: TVariableInfo, names: ITypeNames): string => {
  const base = renderTypeInfo(type, names);
  return type.optional ? `${needsParens(base) ? `(${base})` : base} | undefined` : base;
};

export class TypeTextError extends Error {
  readonly node: ts.Node;

  constructor(node: ts.Node, message: string) {
    super(message);
    this.node = node;
  }
}

const stringLiteralArg = (node: ts.TypeNode | undefined): string | undefined =>
  node && ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal) ? node.literal.text : undefined;

const numberLiteralArg = (node: ts.TypeNode | undefined): number | undefined =>
  node && ts.isLiteralTypeNode(node) && ts.isNumericLiteral(node.literal) ? Number(node.literal.text) : undefined;

const typeNameText = (name: ts.EntityName): string =>
  ts.isIdentifier(name) ? name.text : `${typeNameText(name.left)}.${name.right.text}`;

const UNSUPPORTED_TYPE_HINT =
  'Supported types: string, number (or int8/int16/int32/int64/float32/float64/decimal<D, S>), boolean, any, void, ' +
  'arrays (T[]), unions (A | B), `T | undefined`, and interface names declared in types.ts or vendors.d.ts.';

const parseTypeInfo = (node: ts.TypeNode, names: ITypeNames): TTypeInfo => {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword: {
      return { type: 'string' };
    }
    case ts.SyntaxKind.BooleanKeyword: {
      return { type: 'boolean' };
    }
    case ts.SyntaxKind.NumberKeyword: {
      return { type: 'number', numberType: { type: 'any' } };
    }
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword: {
      return { type: 'any' };
    }
    case ts.SyntaxKind.VoidKeyword: {
      return { type: 'void' };
    }
    case ts.SyntaxKind.NeverKeyword: {
      return { type: 'never' };
    }
    default: {
      break;
    }
  }
  if (ts.isParenthesizedTypeNode(node)) return parseTypeInfo(node.type, names);
  if (ts.isArrayTypeNode(node)) {
    let dimensions = 1;
    let element: ts.TypeNode = node.elementType;
    while (ts.isArrayTypeNode(element)) {
      dimensions += 1;
      element = element.elementType;
    }
    return { type: 'array', elementType: parseTypeInfo(element, names), dimensions };
  }
  if (ts.isUnionTypeNode(node)) {
    return { type: 'union', unionTypes: node.types.map((member) => parseTypeInfo(member, names)) };
  }
  if (ts.isTypeReferenceNode(node)) {
    const name = typeNameText(node.typeName);
    const args = node.typeArguments ?? [];
    if ((IntegerTypes as readonly string[]).includes(name)) {
      return { type: 'number', numberType: { type: 'integer', integerType: name as (typeof IntegerTypes)[number] } };
    }
    if ((FloatTypes as readonly string[]).includes(name)) {
      return { type: 'number', numberType: { type: 'float', floatType: name as (typeof FloatTypes)[number] } };
    }
    if (name === DECIMAL) {
      const digits = numberLiteralArg(args[0]);
      const decimals = numberLiteralArg(args[1]);
      if (digits === undefined || decimals === undefined) {
        throw new TypeTextError(node, 'decimal needs two number literals: decimal<Digits, Decimals>');
      }
      return { type: 'number', numberType: { type: 'decimal', digits, decimals } };
    }
    if (name === 'Array' && args.length === 1) {
      const inner = parseTypeInfo(args[0], names);
      return inner.type === 'array'
        ? { type: 'array', elementType: inner.elementType, dimensions: inner.dimensions + 1 }
        : { type: 'array', elementType: inner, dimensions: 1 };
    }
    if (name === UNRESOLVED_STRUCT) {
      const id = stringLiteralArg(args[0]);
      if (id !== undefined) return { type: 'struct', id };
    }
    if (name === UNRESOLVED_ENUM) {
      const schemeId = stringLiteralArg(args[0]);
      const iconId = stringLiteralArg(args[1]);
      if (schemeId !== undefined && iconId !== undefined) return { type: 'enum', schemeId, iconId };
    }
    const resolved = names.resolve(name);
    if (resolved?.kind === 'struct') return { type: 'struct', id: resolved.id };
    if (resolved?.kind === 'enum') return { type: 'enum', schemeId: resolved.schemeId, iconId: resolved.iconId };
    throw new TypeTextError(node, `Unknown type "${name}". ${UNSUPPORTED_TYPE_HINT}`);
  }
  throw new TypeTextError(node, `Unsupported type "${node.getText()}". ${UNSUPPORTED_TYPE_HINT}`);
};

const isUndefinedType = (node: ts.TypeNode): boolean =>
  node.kind === ts.SyntaxKind.UndefinedKeyword ||
  (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.UndefinedKeyword);

/** TS type node → `TVariableInfo`; a top-level `| undefined` becomes `optional: true`. Throws `TypeTextError`. */
export const parseType = (node: ts.TypeNode, names: ITypeNames): TVariableInfo => {
  const inner = ts.isParenthesizedTypeNode(node) ? node.type : node;
  if (ts.isUnionTypeNode(inner) && inner.types.some(isUndefinedType)) {
    const rest = inner.types.filter((member) => !isUndefinedType(member));
    if (rest.length === 0) throw new TypeTextError(node, `A type can't be only "undefined". ${UNSUPPORTED_TYPE_HINT}`);
    const base: TTypeInfo =
      rest.length === 1
        ? parseTypeInfo(rest[0], names)
        : { type: 'union', unionTypes: rest.map((member) => parseTypeInfo(member, names)) };
    return { ...base, optional: true };
  }
  return parseTypeInfo(node, names);
};

/** Parses a standalone type text (used for inferred types printed by the checker, and for tests). */
export const parseTypeText = (text: string, names: ITypeNames): TVariableInfo => {
  const source = ts.createSourceFile('type.ts', `type __T = ${text};`, ts.ScriptTarget.ESNext, true);
  const statement = source.statements[0];
  if (!statement || !ts.isTypeAliasDeclaration(statement)) throw new Error(`Not a type: ${text}`);
  return parseType(statement.type, names);
};
