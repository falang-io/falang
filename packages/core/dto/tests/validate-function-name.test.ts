import { assert, describe, it } from 'vitest';
import { isValidFunctionName } from '../src';

describe('isValidFunctionName', () => {
  it('accepts a camelCase English identifier', () => {
    assert.isTrue(isValidFunctionName('myFunctionName'));
    assert.isTrue(isValidFunctionName('guessCelebrity'));
    assert.isTrue(isValidFunctionName('a'));
    assert.isTrue(isValidFunctionName('a1b2'));
  });

  it('rejects an empty or whitespace-only name', () => {
    assert.isFalse(isValidFunctionName(''));
    assert.isFalse(isValidFunctionName('   '));
  });

  it('rejects names with spaces or Cyrillic characters', () => {
    assert.isFalse(isValidFunctionName('угадай личность'));
    assert.isFalse(isValidFunctionName('guess personality'));
    assert.isFalse(isValidFunctionName('угадайЛичность'));
  });

  it('rejects PascalCase, snake_case, and a leading digit', () => {
    assert.isFalse(isValidFunctionName('MyFunctionName'));
    assert.isFalse(isValidFunctionName('my_function_name'));
    assert.isFalse(isValidFunctionName('1myFunction'));
  });

  it('rejects punctuation', () => {
    assert.isFalse(isValidFunctionName('my-function'));
    assert.isFalse(isValidFunctionName('my.function'));
  });
});
