import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * A variable type expressed as a raw TypeScript type query rather than a structured `TVariableInfo`.
 * Used for scope variables derived from another field's expression — e.g. the item popped off an
 * array, or the array produced by a slice — where only a `typeof`-based type query is known
 * (see `array-element-type.ts`), not a persisted DTO type.
 */
export interface IRawVariableType {
  readonly type: 'raw';
  readonly expression: string;
  readonly constant?: boolean;
}

export type TScopeVariableType = TVariableInfo | IRawVariableType;

export interface IScopeVariable {
  readonly name: string;
  readonly type: TScopeVariableType;
}
