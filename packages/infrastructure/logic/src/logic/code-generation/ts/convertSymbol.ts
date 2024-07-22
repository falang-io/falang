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
      return `${expression}`
    }
    case 'integer': {
      return `Math.round(${expression})`
    }
  }
  throw new Error(`Cant convert type: ${JSON.stringify(typeTo)}`);
}

const convertSymbolToInteger = (params: IConvertSymbolParams, typeTo: IIntegerTypeInfo): string => {
  const { typeFrom, expression } = params;
  if (typeFrom.type === 'number' && typeFrom.numberType === 'integer') {
    return `${expression}`;
  }
  if(typeFrom.type === 'number') {
    return `Math.round(${expression})`;
  }
  throw getConversionError(params);
}

export const floatConverter: Record<TFloatType, string> = {
  float32: 'f32',
  float64: 'f64',
}

const convertSymbolToFloat = (params: IConvertSymbolParams, typeTo: IFloatTypeInfo): string => {
  const { typeFrom, expression } = params;
  return `${expression}`;
}

const getConversionError = ({ typeFrom, typeTo, expression }: IConvertSymbolParams): Error => {
  return new Error(`cant convert expression ${expression}: ${JSON.stringify(typeFrom)} to ${JSON.stringify(typeTo)}`);
}