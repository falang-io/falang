import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { TExportLanguage } from '@falang/logic-dto';
import { compileExpression } from './compile-expression.js';

const numberType: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const stringArrayType: TVariableInfo = { type: 'array', elementType: { type: 'string' }, dimensions: 1 };

describe('compileExpression', () => {
  it('ts target: emits the expression verbatim once it type-checks against the given scope', () => {
    const result = compileExpression({ expression: 'a + 1', scope: { a: numberType }, target: 'ts' });
    expect(result).toEqual({ ok: true, code: 'a + 1' });
  });

  it('js target: strips TypeScript-only syntax (type assertion) while keeping runtime semantics', () => {
    const result = compileExpression({ expression: '(a as number) + 1', scope: { a: numberType }, target: 'js' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.code).toBe('a + 1');
  });

  it('js target: leaves an already-plain expression unchanged', () => {
    const result = compileExpression({
      expression: 'items.filter((x) => x.length > 0)',
      scope: { items: stringArrayType },
      target: 'js',
    });
    expect(result).toEqual({ ok: true, code: 'items.filter((x) => x.length > 0)' });
  });

  it('reports a type-check diagnostic instead of throwing when the expression is not valid against the scope', () => {
    const result = compileExpression({ expression: 'a.notARealMethod()', scope: { a: numberType }, target: 'ts' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('notARealMethod'))).toBe(true);
  });

  it('reports a diagnostic for a reference to an undeclared variable', () => {
    const result = compileExpression({ expression: 'undeclaredVar + 1', scope: {}, target: 'ts' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('undeclaredVar'))).toBe(true);
  });

  it('throws for a target language not implemented yet', () => {
    // Every current `TExportLanguage` now has an implementation (`ts`/`js`/`cpp`/`golang`/`rust`/`sharp`)
    // — this cast exercises `IMPLEMENTED_LANGUAGES`'s own runtime guard, which stays load-bearing
    // defense-in-depth for whenever `TExportLanguage` grows a new value before its adapter lands.
    const target = 'cobol' as TExportLanguage;
    expect(() => compileExpression({ expression: 'a + 1', scope: { a: numberType }, target })).toThrow(
      /not implemented yet/,
    );
  });
});
