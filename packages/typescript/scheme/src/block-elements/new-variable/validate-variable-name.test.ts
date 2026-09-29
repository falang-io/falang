import { describe, expect, it } from 'vitest';
import { validateVariableName } from './validate-variable-name.js';

describe('validateVariableName', () => {
  it('accepts a plain identifier not present in scope', () => {
    expect(validateVariableName('userName', ['a', 'b'])).toBeNull();
  });

  it('accepts identifiers starting with "_" or "$"', () => {
    expect(validateVariableName('_private', [])).toBeNull();
    expect(validateVariableName('$el', [])).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(validateVariableName('', [])).not.toBeNull();
  });

  it('rejects a name starting with a digit', () => {
    expect(validateVariableName('1x', [])).not.toBeNull();
  });

  it('rejects a name containing invalid characters', () => {
    expect(validateVariableName('my-var', [])).not.toBeNull();
    expect(validateVariableName('my var', [])).not.toBeNull();
  });

  it('rejects reserved words', () => {
    expect(validateVariableName('class', [])).not.toBeNull();
    expect(validateVariableName('let', [])).not.toBeNull();
    expect(validateVariableName('await', [])).not.toBeNull();
  });

  it('allows TypeScript type-name identifiers, which are legal variable names', () => {
    expect(validateVariableName('string', [])).toBeNull();
    expect(validateVariableName('number', [])).toBeNull();
    expect(validateVariableName('any', [])).toBeNull();
    expect(validateVariableName('undefined', [])).toBeNull();
  });

  it('rejects a name already declared in the enclosing scope', () => {
    expect(validateVariableName('x', ['a', 'x', 'y'])).not.toBeNull();
  });
});
