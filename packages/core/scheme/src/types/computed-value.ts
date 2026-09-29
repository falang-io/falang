export type TComputedProperty<T extends string | number | boolean = number> = () => T;
export type TNumberComputed = TComputedProperty<number>;
export const DEFAULT_NUMBER_COMPUTED: TNumberComputed = (): number => 0;
export type TBooleanComputed = TComputedProperty<boolean>;
export type TStringComputed = TComputedProperty<string>;
