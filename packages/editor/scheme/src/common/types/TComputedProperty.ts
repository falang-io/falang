
export type TComputedProperty<T extends string | number | boolean = number> = T | (() => T) | null;
export type TNumberComputed = TComputedProperty<number>;
export type TBooleanComputed = TComputedProperty<boolean>;
export type TStringComputed = TComputedProperty<string>;
