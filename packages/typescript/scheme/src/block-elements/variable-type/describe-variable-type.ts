import { describeVariableType, type TTypeInfo } from '@falang/typescript-dto';
import type { TNumberTypesMode } from '../../typescript-project-service/typescript-project.service.js';

/** What a block shows in a given mode: in `typescript` mode every number kind is plain `number`. */
export const describeVariableTypeForMode = (type: TTypeInfo, mode: TNumberTypesMode): string => {
  if (mode === 'typescript') {
    if (type.type === 'number') return 'number';
    if (type.type === 'array')
      return `${describeVariableTypeForMode(type.elementType, mode)}${'[]'.repeat(Math.max(1, type.dimensions))}`;
  }
  return describeVariableType(type);
};
