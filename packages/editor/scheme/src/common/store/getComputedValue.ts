import { TComputedProperty } from '../types/TComputedProperty';

export const getComputedValue = <T extends string | number | boolean>(
  p : TComputedProperty<T>,
  defaultValue: T,
): T => {
  if(typeof p === 'function') {
    return p();
  }
  if(p === null) {
    return defaultValue;
  }
  return p;
}
