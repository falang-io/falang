export const GeneralTypes = [
  'number',
  'string',
  'boolean',
  'array',
  'struct',
  'union',
  'never',
  'void',
  'enum',
  'any',
] as const;
export type TGeneralType = (typeof GeneralTypes)[number];

export const NumberTypes = ['integer', 'decimal', 'float', 'any'] as const;
export type TNumberType = (typeof NumberTypes)[number];

export const ScalarOptionTypes = ['integer', 'float', 'decimal', 'string', 'boolean', 'enum'] as const;
export type TScalarOptionType = (typeof ScalarOptionTypes)[number];

export const SelectOptionTypes = [
  'integer',
  'float',
  'decimal',
  'string',
  'boolean',
  'array',
  'struct',
  'void',
  'enum',
] as const;
export type TSelectOptionType = (typeof SelectOptionTypes)[number];

export const IntegerTypes = ['int8', 'int16', 'int32', 'int64'] as const;
export type TIntegerType = (typeof IntegerTypes)[number];

export const FloatTypes = ['float32', 'float64'] as const;
export type TFloatType = (typeof FloatTypes)[number];

export interface ITypeInfoBase {
  readonly type: TGeneralType;
}

export interface IAnyTypeInfo extends ITypeInfoBase {
  readonly type: 'any';
}

export interface IVoidTypeInfo extends ITypeInfoBase {
  readonly type: 'void';
}

export interface IAnyNumberTypeDetail {
  readonly type: 'any';
}

export interface IIntegerTypeDetail {
  readonly type: 'integer';
  readonly integerType: TIntegerType;
}

export interface IFloatTypeDetail {
  readonly type: 'float';
  readonly floatType: TFloatType;
}

export interface IDecimalTypeDetail {
  readonly type: 'decimal';
  readonly digits: number;
  readonly decimals: number;
}

export type TNumberTypeDetail = IAnyNumberTypeDetail | IIntegerTypeDetail | IFloatTypeDetail | IDecimalTypeDetail;

export interface INumberTypeInfo extends ITypeInfoBase {
  readonly type: 'number';
  readonly numberType: TNumberTypeDetail;
}

export interface IBooleanTypeInfo extends ITypeInfoBase {
  readonly type: 'boolean';
}

export interface IStringTypeInfo extends ITypeInfoBase {
  readonly type: 'string';
}

export interface INeverTypeInfo extends ITypeInfoBase {
  readonly type: 'never';
}

export interface IArrayTypeInfo extends ITypeInfoBase {
  readonly type: 'array';
  readonly elementType: TTypeInfo;
  readonly dimensions: number;
}

export interface IEnumTypeInfo extends ITypeInfoBase {
  readonly type: 'enum';
  readonly schemeId: string;
  readonly iconId: string;
}

export interface IUnionTypeInfo extends ITypeInfoBase {
  readonly type: 'union';
  readonly unionTypes: readonly TTypeInfo[];
}

export type TTypeInfo =
  | IArrayTypeInfo
  | IBooleanTypeInfo
  | IStringTypeInfo
  | INumberTypeInfo
  | IObjectTypeInfo
  | IUnionTypeInfo
  | INeverTypeInfo
  | IVoidTypeInfo
  | IEnumTypeInfo
  | IAnyTypeInfo;

export type TVariableInfo = {
  readonly optional?: boolean;
  readonly constant?: boolean;
} & TTypeInfo;

export interface IObjectTypeInfo extends ITypeInfoBase {
  readonly type: 'struct';
  readonly id: string;
}

export type TObjectProperties = Record<string, TVariableInfo>;

export interface IObjectInfo {
  readonly properties: TObjectProperties;
}

export const ExpressionTypes = [
  'create',
  'assign',
  'boolean',
  'string',
  'number',
  'array',
  'scalar',
  'value',
  'newName',
] as const;
export type TExpressionType = (typeof ExpressionTypes)[number];

export type TContext = Record<string, TVariableInfo>;

export const EnumValueTypeVariants = ['string', 'number'] as const;
export type TEnumTypeVariant = (typeof EnumValueTypeVariants)[number];

export const int32Type: TTypeInfo = {
  type: 'number',
  numberType: {
    type: 'integer',
    integerType: 'int32',
  },
};

// ---- Zod schemas for shared types ----

import { zod } from '@falang/dto';

export const expressionTypeZod = zod.enum(ExpressionTypes);

export const enumValueTypeVariantZod = zod.enum(EnumValueTypeVariants);

const booleanTypeInfoZod = zod.object({ type: zod.literal('boolean') });
const stringTypeInfoZod = zod.object({ type: zod.literal('string') });
const neverTypeInfoZod = zod.object({ type: zod.literal('never') });
const voidTypeInfoZod = zod.object({ type: zod.literal('void') });
const anyTypeInfoZod = zod.object({ type: zod.literal('any') });
const enumTypeInfoZod = zod.object({ type: zod.literal('enum'), schemeId: zod.string(), iconId: zod.string() });
// The `describe()` is for LLM-facing JSON Schema (`@falang/mcp-core`'s `get_node_kinds`, see
// ADR 0034 (private)'s 2026-09-27 note) — an agent otherwise has no way to know what a struct id is.
const objectTypeInfoZod = zod.object({
  type: zod.literal('struct'),
  id: zod
    .string()
    .describe(
      'Id of the struct type — NOT its name. For an interface declared in an objects-structure document, the ' +
        'node id of its objects-structure-thread (from get_tree of that document); for a built-in vendor type ' +
        '(e.g. "telegram/Message"), the id list_types reports, where that tool is available.',
    ),
});
const numberTypeDetailZod = zod.discriminatedUnion('type', [
  zod.object({ type: zod.literal('any') }),
  zod.object({ type: zod.literal('integer'), integerType: zod.enum(IntegerTypes) }),
  zod.object({ type: zod.literal('float'), floatType: zod.enum(FloatTypes) }),
  zod.object({ type: zod.literal('decimal'), digits: zod.number(), decimals: zod.number() }),
]);

const numberTypeInfoZod = zod.object({ type: zod.literal('number'), numberType: numberTypeDetailZod });

// `.meta({ id })` names both shared type schemas in zod's global registry, so every JSON Schema generated
// from a node kind's `data` refers to them as `#/$defs/TypeInfo`/`#/$defs/VariableType` instead of an
// anonymous `__schemaN` — which lets `@falang/mcp-core`'s `describeNodeKinds` hoist one shared copy out of
// every kind that takes a type (ADR 0034 (private)'s 2026-09-27 "shared type schema" note).
export const typeInfoZod: zod.ZodType<TTypeInfo> = zod
  .lazy(() =>
    zod.discriminatedUnion('type', [
      booleanTypeInfoZod,
      stringTypeInfoZod,
      neverTypeInfoZod,
      voidTypeInfoZod,
      anyTypeInfoZod,
      enumTypeInfoZod,
      objectTypeInfoZod,
      numberTypeInfoZod,
      zod.object({ type: zod.literal('array'), elementType: typeInfoZod, dimensions: zod.number() }),
      zod.object({ type: zod.literal('union'), unionTypes: zod.array(typeInfoZod) }),
    ]),
  )
  .meta({ id: 'TypeInfo', description: 'A data type, discriminated by `type`.' });

export const variableInfoZod: zod.ZodType<TVariableInfo> = typeInfoZod
  .and(
    zod.object({
      optional: zod.boolean().optional(),
      constant: zod.boolean().optional(),
    }),
  )
  .meta({
    id: 'VariableType',
    description: 'Type of a variable, parameter or property: a TypeInfo plus optional `optional`/`constant` flags.',
  });

export const functionBodyParameterZod = zod.object({
  name: zod.string(),
  type: variableInfoZod,
});
