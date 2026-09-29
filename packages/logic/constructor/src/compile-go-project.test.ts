import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { compileGoProject, GoProjectCompileError } from './compile-go-project.js';

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

describe('compileGoProject', () => {
  it("compiles struct declarations (capitalized fields) and lets a function mutate a struct-typed local's field", () => {
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

    const code = compileGoProject({ documents: [struct, functionDocument('doc-main', 'main', main)] });

    expect(code).toContain('package main');
    expect(code).toContain('type ObjA struct {\n  X int32\n  Y int32\n}');
    expect(code).toContain('var a ObjA;');
    expect(code).toContain('a.X = 10;');
    expect(code).toContain('fmt.Println("a.x is " + fmt.Sprint(a.X));');
    expect(code).toContain('import (\n  "fmt"\n)');
  });

  it("resolves call-function across documents to the callee's Go name and return type", () => {
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

    const code = compileGoProject({
      documents: [functionDocument('doc-callee', 'increment', callee), functionDocument('doc-caller', 'main', caller)],
    });

    expect(code).toContain('func increment(n int32) int32 {');
    expect(code).toContain('return n + 1;');
    expect(code).toContain('result := increment(5);');
  });

  it('emits a real func main() calling the entry document when entryDocumentId is given', () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const code = compileGoProject({
      documents: [functionDocument('doc-entry', 'run', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(code.trim().endsWith('func main() {\n  run()\n}')).toBe(true);
  });

  it('compiles an entry document literally named "main" under an internal alias, so it doesn\'t collide with the synthesized func main()', () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const code = compileGoProject({
      documents: [functionDocument('doc-entry', 'main', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(code).not.toMatch(/func main\(\) \{\n\s*fmt\.Println/);
    expect(code.trim().endsWith('func main() {\n  __falang_main_fn()\n}')).toBe(true);
  });

  it('rejects an entry document that returns a non-void value', () => {
    const fn = functionNode({ id: 'doc-fn', returnValue: int32, body: [{ id: 'r', name: 'return', data: '1' }] });
    expect(() =>
      compileGoProject({ documents: [functionDocument('doc-fn', 'fn', fn)], entryDocumentId: 'doc-fn' }),
    ).toThrow(/must return void/);
  });

  it('needs no forward-declaration pass, unlike the cpp target — a function may call one compiled later in the file', () => {
    const caller = functionNode({
      id: 'doc-caller',
      body: [{ id: 'c', name: 'call-function', data: { schemeId: 'doc-callee', parameters: [], returnVariable: '' } }],
    });
    const callee = functionNode({ id: 'doc-callee', body: [{ id: 'l', name: 'log', data: 'called' }] });

    // `doc-caller` (which calls `doc-callee`) is compiled first in document order, before `doc-callee`
    // itself appears later in the file — Go resolves this fine with no prototype needed up front.
    const code = compileGoProject({
      documents: [functionDocument('doc-caller', 'caller', caller), functionDocument('doc-callee', 'callee', callee)],
    });
    expect(code.indexOf('func caller()')).toBeLessThan(code.indexOf('func callee()'));
    expect(code).toContain('callee();');
  });

  it('omits both fmt and math imports when neither is used', () => {
    const fn = functionNode({
      id: 'doc-fn',
      body: [
        { id: 'cv', name: 'create-var', data: { name: 'x', variableType: int32, value: '1' } },
        { id: 'a', name: 'action', data: 'x = x + 1' },
      ],
    });
    const code = compileGoProject({ documents: [functionDocument('doc-fn', 'fn', fn)] });
    expect(code).not.toContain('import');
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
        compileGoProject({ documents });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(caught).toBeInstanceOf(GoProjectCompileError);
    const compileError = caught as GoProjectCompileError;
    expect(compileError.errors).toHaveLength(1);
    expect(compileError.errors[0]?.documentId).toBe('doc-broken');
    expect(compileError.partialCode).toContain('func fine()');
  });

  it(
    "casts a mixed int32/float32 sum's binary operands AND narrows the result back to the declared " +
      "int32 return type — objects' own ObjCSum shape (ADR 0019 (private)'s numeric-coercion follow-up)",
    () => {
      const float32 = { type: 'number', numberType: { type: 'float', floatType: 'float32' } };
      const objCSum = functionNode({
        id: 'doc-sum',
        parameters: [
          { name: 'a', type: int32 },
          { name: 'b', type: float32 },
        ],
        returnValue: int32,
        body: [{ id: 'r', name: 'return', data: 'a + b' }],
      });

      const code = compileGoProject({ documents: [functionDocument('doc-sum', 'sum', objCSum)] });

      expect(code).toContain('func sum(a int32, b float32) int32 {');
      expect(code).toContain('return int32(float32(a) + b);');
    },
  );
});
