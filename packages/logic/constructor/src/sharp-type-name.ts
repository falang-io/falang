import type { TVariableInfo } from '@falang/typescript-dto';
import { UnsupportedConstructError } from './language-adapter.js';

/**
 * C#'s own fixed-width integer aliases. Deliberately *not* the old app's own mapping
 * (old `sharp/convertSymbol.ts`'s `intConverter` mapped both `int8` and `int16` to `short`) — that
 * widened an 8-bit value to 16 bits for no stated reason, and C# does have a real 8-bit signed type
 * (`sbyte`). Matches what every other statement-level target in this package already does
 * (`int8_t`/`int8`/`i8` for cpp/Go/Rust).
 */
const INTEGER_SHARP_TYPES: Readonly<Record<string, string>> = {
  int8: 'sbyte',
  int16: 'short',
  int32: 'int',
  int64: 'long',
};

const FLOAT_SHARP_TYPES: Readonly<Record<string, string>> = {
  float32: 'float',
  float64: 'double',
};

/**
 * Renders a `TVariableInfo` as a C# type name — the C#-target analogue of `variableInfoToCppType`/
 * `variableInfoToGoType`/`variableInfoToRustType`, with the same "throw rather than fall back to
 * `any`" posture (C# does have `object`/`dynamic`, but silently reaching for either would produce
 * code that compiles and then behaves differently from the other targets — see ADR 0019 (private)).
 *
 * An array is `System.Collections.Generic.List<T>`, not a raw C# array (`T[]`) — the same choice the
 * old app's own C# expression codegen made, and the reason `languages/sharp-adapter.ts` already maps
 * `.length` to `.Count` (array-only `.Length` would be wrong for a `List<T>`). A fixed-size `T[]`
 * couldn't express `arr-push`/`arr-pop` at all.
 */
export const variableInfoToSharpType = (type: TVariableInfo, structNames: ReadonlyMap<string, string>): string => {
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
      if (numberType.type === 'integer') return INTEGER_SHARP_TYPES[numberType.integerType];
      if (numberType.type === 'float') return FLOAT_SHARP_TYPES[numberType.floatType];
      throw new UnsupportedConstructError(`Number type not portable to C#: ${numberType.type}`);
    }
    case 'struct': {
      const name = structNames.get(type.id);
      if (!name) throw new UnsupportedConstructError(`Unknown struct id for C# compilation: ${type.id}`);
      return name;
    }
    case 'array': {
      // Same "wrap N times" shape as every other target's own type renderer — `dimensions` wraps the
      // single `elementType` N times.
      let sharpType = variableInfoToSharpType(type.elementType, structNames);
      for (let dimension = 0; dimension < type.dimensions; dimension += 1) sharpType = `List<${sharpType}>`;
      return sharpType;
    }
    default: {
      throw new UnsupportedConstructError(`Type not portable to C#: ${type.type}`);
    }
  }
};

/** The type one `List<>` layer in from an array type — `dimensions > 1` peels one dimension, `dimensions === 1` yields the array's own `elementType`. */
export const sharpArrayElementType = (type: Extract<TVariableInfo, { type: 'array' }>): TVariableInfo =>
  type.dimensions > 1 ? { ...type, dimensions: type.dimensions - 1 } : type.elementType;

/**
 * The value a C# declaration of `type` should be initialized to. Unlike C++'s `T name{}` (which
 * value-initializes every member recursively) and Go's zero value, C#'s own default for a *reference*
 * type (`List<T>`, and every generated struct — see `emit-sharp-struct-declarations.ts`, which emits
 * classes) is `null`, so leaving it implicit would turn the very first `x.z.x = 10` or `arr.Add(...)`
 * into a `NullReferenceException` at runtime instead of behaving like the other three targets.
 */
export const defaultSharpValue = (type: TVariableInfo, structNames: ReadonlyMap<string, string>): string => {
  switch (type.type) {
    case 'string': {
      return '""';
    }
    case 'boolean': {
      return 'false';
    }
    case 'number': {
      // A bare `0` literal is implicitly convertible to every numeric type C# declares here
      // (constant expressions in range convert implicitly, unlike a non-constant expression — see
      // `sharp-value.ts`'s `toSharpTypedValue`), so no cast is needed for a declaration's initializer.
      return '0';
    }
    default: {
      return `new ${variableInfoToSharpType(type, structNames)}()`;
    }
  }
};
