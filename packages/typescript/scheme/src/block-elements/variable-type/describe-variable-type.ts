import type { TTypeInfo } from '@falang/typescript-dto';
import type { TNumberTypesMode } from '../../typescript-project-service/typescript-project.service.js';

/**
 * Full text of a type as a block shows it: `int32`, `uint8`, `float64`, `decimal(10,2)`, `number` (a number of no
 * particular kind), `T[]`. Same contract as ADR 0069's `describeVariableType`.
 */
// TODO(ADR 0069): replace with describeVariableType from @falang/typescript-dto
export const describeVariableType = (type: TTypeInfo): string => {
  switch (type.type) {
    case 'number': {
      const detail = type.numberType;
      switch (detail.type) {
        case 'integer': {
          return detail.integerType;
        }
        case 'float': {
          return detail.floatType;
        }
        case 'decimal': {
          return `decimal(${detail.digits},${detail.decimals})`;
        }
        default: {
          return 'number';
        }
      }
    }
    case 'array': {
      return `${describeVariableType(type.elementType)}${'[]'.repeat(Math.max(1, type.dimensions))}`;
    }
    case 'union': {
      return type.unionTypes.map(describeVariableType).join(' | ');
    }
    default: {
      return type.type;
    }
  }
};

/** What a block shows in a given mode: in `typescript` mode every number kind is plain `number`. */
export const describeVariableTypeForMode = (type: TTypeInfo, mode: TNumberTypesMode): string => {
  if (mode === 'typescript') {
    if (type.type === 'number') return 'number';
    if (type.type === 'array')
      return `${describeVariableTypeForMode(type.elementType, mode)}${'[]'.repeat(Math.max(1, type.dimensions))}`;
  }
  return describeVariableType(type);
};
