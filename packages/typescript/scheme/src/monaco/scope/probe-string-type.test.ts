import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildStringTypeProbe } from './probe-string-type.js';

/** Type-checks the probe file with the real compiler — what Monaco's worker does in the browser. */
const probeTypeChecks = (scopeCode: string, typeExpression: string): boolean => {
  const fileName = '/probe.ts';
  const source = buildStringTypeProbe(scopeCode, typeExpression);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = (name) => (name === fileName ? source : readFile(name));
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion) =>
    name === fileName ? ts.createSourceFile(name, source, languageVersion) : getSourceFile(name, languageVersion);
  const program = ts.createProgram([fileName], options, host);
  const file = program.getSourceFile(fileName);
  return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)].length === 0;
};

describe('buildStringTypeProbe', () => {
  const scope = [
    'declare const names: string[];',
    'declare const counts: number[];',
    "declare const modes: ('a' | 'b')[];",
    'declare const anything: any[];',
    'declare const user: { tags: string[] };',
  ].join('\n');

  it('accepts string element types', () => {
    expect(probeTypeChecks(scope, 'typeof names[number]')).toBe(true);
    expect(probeTypeChecks(scope, "typeof user['tags'][number]")).toBe(true);
    expect(probeTypeChecks(scope, 'typeof modes[number]')).toBe(true);
  });

  it('rejects other, any and unresolvable types', () => {
    expect(probeTypeChecks(scope, 'typeof counts[number]')).toBe(false);
    expect(probeTypeChecks(scope, 'typeof anything[number]')).toBe(false);
    expect(probeTypeChecks(scope, 'typeof missing[number]')).toBe(false);
    expect(probeTypeChecks(scope, 'unknown')).toBe(false);
  });
});
