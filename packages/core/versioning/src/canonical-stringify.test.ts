import { assert, describe, it } from 'vitest';
import { canonicalStringify } from './canonical-stringify.js';

describe('canonicalStringify', () => {
  it('produces the same string regardless of object key order', () => {
    const a = canonicalStringify({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalStringify({ c: { y: 2, z: 1 }, a: 2, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it('keeps array order significant', () => {
    assert.notEqual(canonicalStringify([1, 2, 3]), canonicalStringify([3, 2, 1]));
    assert.equal(canonicalStringify([1, 2, 3]), '[1,2,3]');
  });

  it('drops undefined object properties, like JSON.stringify', () => {
    // oxlint-disable no-undefined -- the property under test must genuinely be `undefined`, not merely absent.
    assert.equal(canonicalStringify({ a: 1, b: undefined }), canonicalStringify({ a: 1 }));
    assert.equal(canonicalStringify({ a: 1, b: undefined }), '{"a":1}');
    // oxlint-enable no-undefined
  });

  it('renders no whitespace', () => {
    assert.equal(canonicalStringify({ a: [1, { b: 2 }] }), '{"a":[1,{"b":2}]}');
  });

  it('is stable for primitives and null', () => {
    assert.equal(canonicalStringify(null), 'null');
    // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- the input under test must genuinely be `undefined`.
    assert.equal(canonicalStringify(undefined), 'null');
    assert.equal(canonicalStringify('x'), '"x"');
    assert.equal(canonicalStringify(42), '42');
    assert.equal(canonicalStringify(true), 'true');
  });

  it('sorts keys recursively at every depth', () => {
    const value = { z: { d: 1, c: 2 }, a: { b: 4, a: 3 } };
    assert.equal(canonicalStringify(value), '{"a":{"a":3,"b":4},"z":{"c":2,"d":1}}');
  });
});
