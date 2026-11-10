import { assert, describe, it } from 'vitest';
import { isObservable, observable } from 'mobx';
import { toPlainData } from './to-plain-data.js';

describe('toPlainData', () => {
  it('keeps primitives and null as they are', () => {
    assert.strictEqual(toPlainData('x'), 'x');
    assert.strictEqual(toPlainData(3), 3);
    assert.strictEqual(toPlainData(false), false);
    assert.isNull(toPlainData(null));
  });

  it('converts an observable deeply', () => {
    const source = observable({ a: { b: [1, { c: 2 }] } });
    const plain = toPlainData(source);
    assert.deepEqual(plain, { a: { b: [1, { c: 2 }] } });
    assert.isFalse(isObservable(plain));
    assert.isFalse(isObservable(plain.a.b));
    assert.doesNotThrow(() => structuredClone(plain));
  });

  it('converts observables nested inside plain objects and arrays, which MobX toJS leaves as they are', () => {
    const source = { list: [observable({ x: 1 })], inner: { o: observable([1, 2]) } };
    const plain = toPlainData(source);
    assert.deepEqual(plain, { list: [{ x: 1 }], inner: { o: [1, 2] } });
    assert.doesNotThrow(() => structuredClone(plain));
  });

  it('returns a copy, never the source object', () => {
    const source = { a: { b: 1 } };
    const plain = toPlainData(source);
    plain.a.b = 2;
    assert.equal(source.a.b, 1);
  });
});
