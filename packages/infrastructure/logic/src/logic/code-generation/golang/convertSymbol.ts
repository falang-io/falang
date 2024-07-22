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
  int8: 'int8',
  int16: 'int16',
  int32: 'int32',
  int64: 'int64',
}

export const castToNumber = (typeTo: TNumberTypeInfo, expression: string): string => {
  switch (typeTo.numberType) {
    case 'float': {
      return `${floatConverter[typeTo.floatType]}(${expression})`
    }
    case 'integer': {
      return `${intConverter[typeTo.integerType]}(${expression})`
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
    //if (indexFrom > indexTo) throw getConversionError(params);
    return `${intConverter[typeTo.integerType]}(${expression})`;
  }
  if(typeTo.type === 'number') {
    return castToNumber(typeTo, expression);
  }
  throw getConversionError(params);
}

export const floatConverter: Record<TFloatType, string> = {
  float32: 'float32',
  float64: 'float64',
}

const convertSymbolToFloat = (params: IConvertSymbolParams, typeTo: IFloatTypeInfo): string => {
  //console.log({params, typeTo});
  const { typeFrom, expression } = params;
  if (typeFrom.type === 'number' && typeFrom.numberType === 'float') {
    const indexFrom = FloatTypes.indexOf(typeFrom.floatType);
    const indexTo = FloatTypes.indexOf(typeTo.floatType);
    if (indexFrom === indexTo) return expression;
    // if (indexFrom > indexTo) throw getConversionError(params);
    return `${floatConverter[typeTo.floatType]}(${expression})`;
  }
  if(typeFrom.type === 'number') {
    return `${floatConverter[typeTo.floatType]}(${expression})`;
  }
  throw getConversionError(params);
}

const getConversionError = ({ typeFrom, typeTo, expression }: IConvertSymbolParams): Error => {
  return new Error(`cant convert expression ${expression}: ${JSON.stringify(typeFrom)} to ${JSON.stringify(typeTo)}`);
}