import { type } from "os";
import { FloatTypes, IFloatTypeInfo, IIntegerTypeInfo, IntegerTypes, TNumberTypeInfo, TFloatType, TIntegerType, TTypeInfo } from "../../constants";

interface IConvertSymbolParams {
  typeFrom: TTypeInfo,
  typeTo: TTypeInfo,
  expression: string
}

export const convertSymbol = (params: IConvertSymbolParams): string => {
  const { typeFrom, typeTo, expression } = params;
  switch (typeTo.type) {
    case 'number': {
      if (typeFrom.type !== 'number') throw getConversionError(params);
      switch (typeTo.numberType) {
        case 'integer': return convertSymbolToInteger(params, typeTo);
        case 'float': return convertSymbolToFloat(params, typeTo);
      }
    }
    case 'array': 
    case 'struct':
      return `${expression}.clone()`
  }
  return expression;
}

export const intConverter: Record<TIntegerType, string> = {
  int8: 'i8',
  int16: 'i16',
  int32: 'i32',
  int64: 'i64',
}

export const castToNumber = (typeTo: TNumberTypeInfo, expression: string): string => {
  switch (typeTo.numberType) {
    case 'float': {
      return `(${expression}) as ${floatConverter[typeTo.floatType]}`
    }
    case 'integer': {
      return `(${expression}) as ${intConverter[typeTo.integerType]}`
    }
  }
  throw new Error(`Cant convert type: ${JSON.stringify(typeTo)}`);
}

const convertSymbolToInteger = (params: IConvertSymbolParams, typeTo: IIntegerTypeInfo): string => {
  const { typeFrom, expression } = params;
  if (typeFrom.type === 'number' && typeFrom.numberType === 'integer') {
    const indexFrom = IntegerTypes.indexOf(typeFrom.integerType);
    const indexTo = IntegerTypes.indexOf(typeTo.integerType);
    if (indexFrom === indexTo) return expression;
    if (indexFrom > indexTo) throw getConversionError(params);
    return `(${expression}) as ${intConverter[typeTo.integerType]}`;
  }
  if(typeFrom.type === 'number') {
    return `(${expression}) as ${intConverter[typeTo.integerType]}`;
  }
  throw getConversionError(params);
}

export const floatConverter: Record<TFloatType, string> = {
  float32: 'f32',
  float64: 'f64',
}

const convertSymbolToFloat = (params: IConvertSymbolParams, typeTo: IFloatTypeInfo): string => {
  const { typeFrom, expression } = params;
  if (typeFrom.type === 'number' && typeFrom.numberType === 'float') {
    const indexFrom = FloatTypes.indexOf(typeFrom.floatType);
    const indexTo = FloatTypes.indexOf(typeTo.floatType);
    if (indexFrom === indexTo) return expression;
    if (indexFrom < indexTo) throw getConversionError(params);
    return `${expression} as ${floatConverter[typeTo.floatType]}`;
  }
  if(typeFrom.type === 'number') {
    return `${expression} as ${floatConverter[typeTo.floatType]}`;
  }
  throw getConversionError(params);
}

const getConversionError = ({ typeFrom, typeTo, expression }: IConvertSymbolParams): Error => {
  return new Error(`cant convert expression ${expression}: ${JSON.stringify(typeFrom)} to ${JSON.stringify(typeTo)}`);
}