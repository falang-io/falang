import type { TVariableInfo } from '@falang/typescript-dto';
import { UnsupportedConstructError } from './language-adapter.js';

const INTEGER_GO_TYPES: Readonly<Record<string, string>> = {
  int8: 'int8',
  int16: 'int16',
  int32: 'int32',
  int64: 'int64',
};

const FLOAT_GO_TYPES: Readonly<Record<string, string>> = {
  float32: 'float32',
  float64: 'float64',
};

/**
 * Renders a `TVariableInfo` as a Go type name — the Go-target analogue of `cpp-type-name.ts`'s
 * `variableInfoToCppType`. Same "throw rather than fall back to `any`" posture: Go has no untyped
 * escape hatch a struct field or `var` declaration could fall back to either.
 */
export const variableInfoToGoType = (type: TVariableInfo, structNames: ReadonlyMap<string, string>): string => {
  switch (type.type) {
    case 'string': {
      return 'string';
    }
    case 'boolean': {
      return 'bool';
    }
    case 'void': {
      return 'void';
    }
    case 'number': {
      const { numberType } = type;
      if (numberType.type === 'integer') return INTEGER_GO_TYPES[numberType.integerType];
      if (numberType.type === 'float') return FLOAT_GO_TYPES[numberType.floatType];
      throw new UnsupportedConstructError(`Number type not portable to Go: ${numberType.type}`);
    }
    case 'struct': {
      const name = structNames.get(type.id);
      if (!name) throw new UnsupportedConstructError(`Unknown struct id for Go compilation: ${type.id}`);
      return name;
    }
    case 'array': {
      // Same "wrap N times" shape as `variableInfoToCppType` — `dimensions` wraps the single
      // `elementType` N times (Go's slice type is `[]T`, so N dimensions is `[][]...[]T`).
      let goType = variableInfoToGoType(type.elementType, structNames);
      for (let dimension = 0; dimension < type.dimensions; dimension += 1) goType = `[]${goType}`;
      return goType;
    }
    default: {
      throw new UnsupportedConstructError(`Type not portable to Go: ${type.type}`);
    }
  }
};
