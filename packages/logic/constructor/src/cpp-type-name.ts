import type { TVariableInfo } from '@falang/typescript-dto';
import { UnsupportedConstructError } from './language-adapter.js';

const INTEGER_CPP_TYPES: Readonly<Record<string, string>> = {
  int8: 'int8_t',
  int16: 'int16_t',
  int32: 'int',
  int64: 'int64_t',
};

const FLOAT_CPP_TYPES: Readonly<Record<string, string>> = {
  float32: 'float',
  float64: 'double',
};

/**
 * Renders a `TVariableInfo` as a C++ type name — the cpp-target analogue of
 * `@falang/typescript-dto`'s `variableInfoToTsType`. Unlike that function's `any` fallback for an
 * unresolved struct/enum/union, C++ has no "any" type a struct field or variable declaration could
 * fall back to, so every unresolvable case throws `UnsupportedConstructError` (surfaced by callers
 * the same way an adapter's own unsupported-construct error is, rather than emitting invalid C++).
 */
export const variableInfoToCppType = (type: TVariableInfo, structNames: ReadonlyMap<string, string>): string => {
  switch (type.type) {
    case 'string': {
      return 'std::string';
    }
    case 'boolean': {
      return 'bool';
    }
    case 'void': {
      return 'void';
    }
    case 'number': {
      const { numberType } = type;
      if (numberType.type === 'integer') return INTEGER_CPP_TYPES[numberType.integerType];
      if (numberType.type === 'float') return FLOAT_CPP_TYPES[numberType.floatType];
      throw new UnsupportedConstructError(`Number type not portable to C++: ${numberType.type}`);
    }
    case 'struct': {
      const name = structNames.get(type.id);
      if (!name) throw new UnsupportedConstructError(`Unknown struct id for C++ compilation: ${type.id}`);
      return name;
    }
    case 'array': {
      // `dimensions` (like `variableInfoToTsType`'s own `'[]'.repeat(dimensions)`) wraps the single
      // `elementType` N times, rather than `elementType` itself being a nested array type.
      let cppType = variableInfoToCppType(type.elementType, structNames);
      for (let dimension = 0; dimension < type.dimensions; dimension += 1) cppType = `std::vector<${cppType}>`;
      return cppType;
    }
    default: {
      throw new UnsupportedConstructError(`Type not portable to C++: ${type.type}`);
    }
  }
};
