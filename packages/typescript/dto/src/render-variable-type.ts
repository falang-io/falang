import type { TVariableInfo } from './dtos/types.js';

/**
 * Renders a structured `TVariableInfo` as a TypeScript type expression. `structNames` maps a
 * struct's `id` to the interface name it should be printed as; struct/enum types not present in
 * the map render as `any` — the caller is responsible for resolving/registering struct names
 * (e.g. against a project's type registry) before calling this.
 */
export const variableInfoToTsType = (type: TVariableInfo, structNames = new Map<string, string>()): string => {
  switch (type.type) {
    case 'string':
    case 'boolean':
    case 'number':
    case 'void':
    case 'never':
    case 'any': {
      return type.type;
    }
    case 'enum': {
      return 'any';
    }
    case 'struct': {
      return structNames.get(type.id) ?? 'any';
    }
    case 'array': {
      const elementTsType = variableInfoToTsType(type.elementType, structNames);
      const bracketed = /[|&]/.test(elementTsType) ? `(${elementTsType})` : elementTsType;
      return `${bracketed}${'[]'.repeat(type.dimensions)}`;
    }
    case 'union': {
      return `(${type.unionTypes.map((unionType) => variableInfoToTsType(unionType, structNames)).join(' | ')})`;
    }
    default: {
      return 'any';
    }
  }
};
