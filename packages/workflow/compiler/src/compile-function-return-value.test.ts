import type { INode } from '@falang/dto';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileFunction, withAutoReturnValue } from './compile-function.js';

const functionWith = (returnValue: unknown, children: INode[]): INode => ({
  id: 'fn',
  name: 'function',
  children: [
    { id: 'header', name: 'function-header', data: '' },
    {
      id: 'body',
      name: 'function-body',
      data: { parameters: [{ name: 'count', type: { type: 'number' } }], ...(returnValue ? { returnValue } : {}) },
      children,
    },
    { id: 'footer', name: 'function-footer', data: '' },
  ],
});

/** Type-checks one compiled function on its own (no imports needed: it only uses its own locals). */
const typeErrors = (source: string): string[] => {
  const fileName = '/fn.ts';
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion) =>
    name === fileName ? ts.createSourceFile(name, source, languageVersion) : getSourceFile(name, languageVersion);
  const program = ts.createProgram([fileName], options, host);
  const file = program.getSourceFile(fileName);
  return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)].map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
};

describe('withAutoReturnValue', () => {
  it('leaves a body that never mentions returnValue, or a void function, unchanged', () => {
    expect(withAutoReturnValue('return 1;', 'number')).toBe('return 1;');
    expect(withAutoReturnValue('returnValue = 1;', null)).toBe('returnValue = 1;');
  });

  it('declares returnValue and returns it at the end unless the body already does', () => {
    expect(withAutoReturnValue('returnValue = 1;', 'number')).toBe(
      'let returnValue!: number;\nreturnValue = 1;\nreturn returnValue;',
    );
    expect(withAutoReturnValue('returnValue = 1;\nreturn returnValue;', 'number')).toBe(
      'let returnValue!: number;\nreturnValue = 1;\nreturn returnValue;',
    );
  });
});

describe('compileFunction with returnValue', () => {
  it('compiles a function that assigns and returns returnValue into valid TypeScript', () => {
    const source = compileFunction(
      functionWith({ type: 'boolean' }, [
        { id: 'a1', name: 'action', data: 'returnValue = count > 0' },
        {
          id: 'a2',
          name: 'action',
          data: 'count = count + 1',
          out: { id: 'r1', name: 'return', data: 'returnValue' },
        },
      ]),
      'isPositive',
    );
    expect(source).toContain('let returnValue!: boolean;');
    expect(typeErrors(source)).toEqual([]);
  });

  it('keeps the output of a function that does not use returnValue byte-identical', () => {
    const source = compileFunction(
      functionWith({ type: 'number' }, [{ id: 'a1', name: 'action', data: 'return count' }]),
      'identity',
    );
    expect(source).not.toContain('returnValue');
  });
});
