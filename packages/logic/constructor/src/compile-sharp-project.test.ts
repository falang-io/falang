import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { compileSharpProject, SharpProjectCompileError } from './compile-sharp-project.js';

interface IFunctionNodeParams {
  readonly id: string;
  readonly parameters?: { name: string; type: unknown }[];
  readonly returnValue?: unknown;
  readonly body: INode[];
}

const functionNode = ({ id, parameters = [], returnValue, body }: IFunctionNodeParams): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters, returnValue }, children: body },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

const structDocument = (
  documentId: string,
  threadId: string,
  name: string,
  properties: Record<string, unknown>,
): IProjectDocument => ({
  id: documentId,
  type: OBJECTS_STRUCTURE_NAME,
  name: documentId,
  root: {
    id: 'root',
    name: OBJECTS_STRUCTURE_NAME,
    children: [
      { id: 'header', name: `${OBJECTS_STRUCTURE_NAME}-header`, data: '' },
      {
        id: 'body',
        name: `${OBJECTS_STRUCTURE_NAME}-body`,
        data: null,
        children: [
          {
            id: threadId,
            name: `${OBJECTS_STRUCTURE_NAME}-thread`,
            data: name,
            children: Object.entries(properties).map(([propertyName, variableType], index) => ({
              id: `${threadId}-child-${index}`,
              name: `${OBJECTS_STRUCTURE_NAME}-child`,
              data: { name: propertyName, variableType },
            })),
          },
        ],
      },
    ],
  },
});

const int32 = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('compileSharpProject', () => {
  it('emits the usings, one class per struct, and a single Program class holding every compiled function', () => {
    const struct = structDocument('doc-objA', 'thread-objA', 'ObjA', { x: int32, y: int32 });
    const structType = { type: 'struct', id: 'thread-objA' };

    const main = functionNode({
      id: 'doc-main',
      body: [
        { id: 'cv', name: 'create-var', data: { name: 'a', variableType: structType } },
        { id: 'act', name: 'action', data: 'a.x = 10' },
        { id: 'log', name: 'log', data: 'a.x is ${a.x}' },
      ],
    });

    const code = compileSharpProject({ documents: [struct, functionDocument('doc-main', 'main', main)] });

    expect(code.startsWith('using System;\nusing System.Collections.Generic;\nusing System.Linq;')).toBe(true);
    expect(code).toContain('public class ObjA {');
    expect(code).toContain('public static partial class Program {');
    expect(code).toContain('ObjA a = new ObjA();');
    expect(code).toContain('a.x = 10;');
    expect(code).toContain('Console.WriteLine("a.x is " + (a.x));');
  });

  it("resolves call-function across documents to the callee's C# name and return type", () => {
    const callee = functionNode({
      id: 'doc-callee',
      parameters: [{ name: 'n', type: int32 }],
      returnValue: int32,
      body: [{ id: 'r', name: 'return', data: 'n + 1' }],
    });
    const caller = functionNode({
      id: 'doc-caller',
      body: [
        {
          id: 'c',
          name: 'call-function',
          data: { schemeId: 'doc-callee', parameters: ['5'], returnVariable: 'result' },
        },
        { id: 'l', name: 'log', data: 'result: ${result}' },
      ],
    });

    const code = compileSharpProject({
      documents: [functionDocument('doc-callee', 'increment', callee), functionDocument('doc-caller', 'main', caller)],
    });

    expect(code).toContain('public static int increment(int n) {');
    expect(code).toContain('return (int)(n + 1);');
    expect(code).toContain('int result = increment((int)(5));');
  });

  it('emits a real Main() calling the entry document when entryDocumentId is given', () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const code = compileSharpProject({
      documents: [functionDocument('doc-entry', 'run', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(code).toContain('public static void Main() {\n    run();\n  }');
  });

  it('compiles an entry document named "main" under an internal alias, keeping it distinct from the synthesized Main()', () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const code = compileSharpProject({
      documents: [functionDocument('doc-entry', 'main', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(code).toContain('public static void __falang_main_fn() {');
    expect(code).toContain('public static void Main() {\n    __falang_main_fn();\n  }');
  });

  it('rejects an entry document that returns a non-void value', () => {
    const fn = functionNode({ id: 'doc-fn', returnValue: int32, body: [{ id: 'r', name: 'return', data: '1' }] });
    expect(() =>
      compileSharpProject({ documents: [functionDocument('doc-fn', 'fn', fn)], entryDocumentId: 'doc-fn' }),
    ).toThrow(/must return void/);
  });

  it('needs no forward-declaration pass, unlike the cpp target — a method may call one declared later in the class', () => {
    const caller = functionNode({
      id: 'doc-caller',
      body: [{ id: 'c', name: 'call-function', data: { schemeId: 'doc-callee', parameters: [], returnVariable: '' } }],
    });
    const callee = functionNode({ id: 'doc-callee', body: [{ id: 'l', name: 'log', data: 'called' }] });

    const code = compileSharpProject({
      documents: [functionDocument('doc-caller', 'caller', caller), functionDocument('doc-callee', 'callee', callee)],
    });
    expect(code.indexOf('void caller()')).toBeLessThan(code.indexOf('void callee()'));
    expect(code).toContain('callee();');
  });

  it("appends an unconditional throw when a non-void function's body doesn't end in return/throw, satisfying C#'s CS0161 check the same way the Go/Rust targets' trailing panic does", () => {
    const fn = functionNode({
      id: 'doc-fn',
      returnValue: int32,
      body: [{ id: 'w', name: 'while', data: 'true', children: [{ id: 'r', name: 'return', data: '1' }] }],
    });
    expect(compileSharpProject({ documents: [functionDocument('doc-fn', 'fn', fn)] })).toContain(
      'throw new Exception("unreachable");',
    );
  });

  it('does not append a trailing throw when the body already ends in return/throw', () => {
    const fn = functionNode({ id: 'doc-fn', returnValue: int32, body: [{ id: 'r', name: 'return', data: '1' }] });
    expect(compileSharpProject({ documents: [functionDocument('doc-fn', 'fn', fn)] })).not.toContain('unreachable');
  });

  it("collects a per-document compile error without losing the other documents' compiled output", () => {
    const broken = functionNode({
      id: 'doc-broken',
      body: [{ id: 'a', name: 'unknown-node-kind' } as unknown as INode],
    });
    const fine = functionNode({ id: 'doc-fine', body: [{ id: 'l', name: 'log', data: 'ok' }] });
    const documents = [functionDocument('doc-broken', 'broken', broken), functionDocument('doc-fine', 'fine', fine)];

    const caught: unknown = ((): unknown => {
      try {
        compileSharpProject({ documents });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(caught).toBeInstanceOf(SharpProjectCompileError);
    const compileError = caught as SharpProjectCompileError;
    expect(compileError.errors).toHaveLength(1);
    expect(compileError.errors[0]?.documentId).toBe('doc-broken');
    expect(compileError.partialCode).toContain('void fine()');
  });
});
