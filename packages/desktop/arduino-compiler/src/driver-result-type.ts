import { int32Type } from '@falang/typescript-dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { TDriverResultType } from '@falang/desktop-arduino-dto';

/** Maps a driver action's `resultType` to the `TVariableInfo` its lowered `create-var` node declares — mirrors `lower-pin-nodes.ts`'s `int32Type` choice for `pin-read-*` (int32 for a real `int`, since the shared cpp compiler's own numeric-coercion handling — see ADR 0019 (private)'s Go/Rust note — is unrelated to cpp/Arduino, which never coerces). */
export const driverResultTypeToVariableType = (resultType: TDriverResultType): TVariableInfo => {
  switch (resultType) {
    case 'int': {
      return int32Type;
    }
    case 'float': {
      return { type: 'number', numberType: { type: 'float', floatType: 'float32' } };
    }
    case 'bool': {
      return { type: 'boolean' };
    }
    case 'string': {
      return { type: 'string' };
    }
    default: {
      throw new Error(`Unknown driver result type "${String(resultType)}"`);
    }
  }
};
