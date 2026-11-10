import { isObservable, toJS } from 'mobx';

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * A deep copy of node `data`/`meta` with every MobX observable replaced by plain objects and arrays.
 *
 * MobX's own `toJS` returns a non-observable value as it is without looking inside, so a plain object holding an
 * observable proxy (e.g. a document tree taken from a host's deep-observable `documents` array) stays a proxy — and
 * `structuredClone`/`postMessage`/IPC then throw "Proxy object could not be cloned". This walks plain containers too.
 * Non-plain objects (class instances, `Date`) are kept by reference.
 */
export const toPlainData = <T>(value: T): T => {
  const source: unknown = isObservable(value) ? toJS(value) : value;
  if (source === null || typeof source !== 'object') return source as T;
  if (Array.isArray(source)) return source.map((item: unknown) => toPlainData(item)) as T;
  if (!isPlainObject(source)) return source as T;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, toPlainData(item)])) as T;
};
