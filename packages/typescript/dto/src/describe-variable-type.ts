import type { TVariableInfo } from './dtos/types.js';

/**
 * A short, human-readable type text for blocks: `int32`, `uint8`, `float64`, `decimal(10,2)`, `number` (for an
 * unspecified number kind), `string`, `T[]`/`T[][]`; a struct prints as its name from `structNames`, else `struct`.
 */
export const describeVariableType = (
  type: TVariableInfo,
  structNames: ReadonlyMap<string, string> = new Map(),
): string => {
  switch (type.type) {
    case 'number': {
      const { numberType } = type;
      if (numberType.type === 'integer') return numberType.integerType;
      if (numberType.type === 'float') return numberType.floatType;
      if (numberType.type === 'decimal') return `decimal(${numberType.digits},${numberType.decimals})`;
      return 'number';
    }
    case 'struct': {
      return structNames.get(type.id) ?? 'struct';
    }
    case 'array': {
      const element = describeVariableType(type.elementType, structNames);
      const bracketed = /[|&]/.test(element) ? `(${element})` : element;
      return `${bracketed}${'[]'.repeat(type.dimensions)}`;
    }
    case 'union': {
      return type.unionTypes.map((unionType) => describeVariableType(unionType, structNames)).join(' | ');
    }
    default: {
      return type.type;
    }
  }
};
