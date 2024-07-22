export const GeneralTypes = ['number', 'string', 'boolean', 'array', 'struct', 'union', 'never', 'void', 'enum', 'any'] as const;
export type TGeneralType = typeof GeneralTypes[number];

export const NumberTypes = ['integer', 'decimal', 'float', 'any'] as const;
export type TNumberType = typeof NumberTypes[number];

export const ScalarOptionTypes = ['integer', 'float', 'decimal', 'string', 'boolean', 'enum'] as const;
export type TScalarOptionType = typeof ScalarOptionTypes[number];

export const SelectOptionTypes = ['integer', 'float', 'decimal', 'string', 'boolean', 'array', 'struct', 'void', 'enum'] as const;
export type TSelectOptionType = typeof SelectOptionTypes[number];

export const IntegerTypes = ['int8', 'int16', 'int32', 'int64'] as const;
export type TIntegerType = typeof IntegerTypes[number];

export const FloatTypes = ['float32', 'float64'] as const;
export type TFloatType = typeof FloatTypes[number];

export interface ITypeInfoBase {
  readonly type: TGeneralType,
}

export interface INumberTypeInfo extends ITypeInfoBase {
  readonly type: 'number',
  readonly numberType: TNumberType
};

export interface IAnyTypeInfo extends ITypeInfoBase {
  readonly type: 'any',
};

export interface IVoidTypeInfo extends ITypeInfoBase {
  readonly type: 'void',
}

export interface IAnyNumberTypeInfo extends INumberTypeInfo {
  readonly numberType: 'any'
};

export interface IIntegerTypeInfo extends INumberTypeInfo {
  readonly numberType: 'integer'
  readonly integerType: TIntegerType
}

export interface IFloatTypeInfo extends INumberTypeInfo {
  readonly numberType: 'float'
  readonly floatType: TFloatType
}

export interface IDecimalTypeInfo extends INumberTypeInfo {
  readonly numberType: 'decimal'
  readonly digits: number
  readonly decimals: number
}

export type TNumberTypeInfo = IIntegerTypeInfo | IFloatTypeInfo | IDecimalTypeInfo | IAnyNumberTypeInfo;

export interface IBooleanTypeInfo extends ITypeInfoBase {
  readonly type: 'boolean'
}

export interface IStringTypeInfo extends ITypeInfoBase {
  readonly type: 'string'
}

export interface INeverTypeInfo extends ITypeInfoBase {
  readonly type: 'never'
}

export interface IArrayTypeInfo extends ITypeInfoBase {
  readonly type: 'array'
  readonly elementType: TTypeInfo
  readonly dimensions: number;
}

export interface IEnumTypeInfo extends ITypeInfoBase {
  readonly type: 'enum'
  readonly schemeId: string
  readonly iconId: string
}

export interface IUnionTypeInfo extends ITypeInfoBase {
  readonly type: 'union'
  readonly unionTypes: ReadonlyArray<TTypeInfo>
}

export type TTypeInfo = IArrayTypeInfo | IBooleanTypeInfo | IStringTypeInfo | TNumberTypeInfo | IObjectTypeInfo | IUnionTypeInfo | INeverTypeInfo | IVoidTypeInfo | IEnumTypeInfo | IAnyTypeInfo;

export type TVariableInfo = {
  readonly optional?: boolean
  readonly constant?: boolean
} & TTypeInfo;

export interface IObjectTypeInfo extends ITypeInfoBase {
  readonly type: 'struct'
  readonly schemeId: string
  readonly iconId: string
  readonly name: string
}

export type TObjectProperties = Record<string, TVariableInfo>;

export interface IObjectInfo {
  readonly properties: TObjectProperties
}

export const ExpressionTypes = ['create', 'assign', 'boolean', 'string', 'number', 'array', 'scalar', 'value', 'newName'] as const;
export type TExpressionType = typeof ExpressionTypes[number];

export type TContext = Record<string, TVariableInfo>;

export const EnumValueTypeVariants = ['string', 'number'] as const;
export type TEnumTypeVariant = typeof EnumValueTypeVariants[number];


export interface IExpressionFunction {
  name: string
}

export const ExpressionFunctionsNames = ['sin', 'random'] as const;
export type TExpressionFunctionName = typeof ExpressionFunctionsNames[number];
export const isExpressionFunctionName = (name: any): name is TExpressionFunctionName => {
  return ExpressionFunctionsNames.includes(name)
}

export type IExpressionFunctionsHash = Record<TExpressionFunctionName, IExpressionFunctionData>;

export interface IExpressionFunctionData {
  readonly signatures: ReadonlyArray<IExpressionFunctionSignature>
}

export interface IExpressionFunctionSignature {
  readonly parameters: ReadonlyArray<TVariableInfo>;
  readonly returnType: TVariableInfo;
}

export const expressionFunctions = {
  sin: {
    signatures: [{
      parameters: [{
        type: 'number',
        numberType: 'any',
      }],
      returnType: {
        type: 'number',
        numberType: 'float',
        floatType: 'float64',
      }
    }],
  },
  random: {
    signatures: [{
      parameters: [],
      returnType: {
        type: 'number',
        numberType: 'float',
        floatType: 'float64',
      }
    }],
  }
} as const satisfies IExpressionFunctionsHash;

export type TExpressionRealizations = Record<TExpressionFunctionName, string>;

export const int32Type: TTypeInfo = {
  type: 'number',
  numberType: 'integer',
  integerType: 'int32',
};