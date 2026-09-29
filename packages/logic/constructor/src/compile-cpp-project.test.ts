import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { compileCppProject, CppProjectCompileError } from './compile-cpp-project.js';

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

/** A minimal `objects-structure` document with one struct thread — same shape `struct-registry.test.ts` uses. */
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

describe('compileCppProject', () => {
  it("compiles struct declarations before the functions that use them, and lets a function mutate a struct-typed local's field", () => {
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

    const code = compileCppProject({ documents: [struct, functionDocument('doc-main', 'main', main)] });

    expect(code.indexOf('struct ObjA')).toBeLessThan(code.indexOf('void main()'));
    expect(code).toContain('ObjA a{};');
    expect(code).toContain('a.x = 10;');
    expect(code).toContain('std::cout << "a.x is " << a.x << std::endl;');
  });

  it("resolves call-function across documents to the callee's C++ name and return type", () => {
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

    const code = compileCppProject({
      documents: [functionDocument('doc-callee', 'increment', callee), functionDocument('doc-caller', 'main', caller)],
    });

    expect(code).toContain('int increment(int n) {');
    expect(code).toContain('return n + 1;');
    expect(code).toContain('int result = increment(5);');
  });

  it('emits a real int main() calling the entry document when entryDocumentId is given', () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const code = compileCppProject({
      documents: [functionDocument('doc-entry', 'run', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(code.trim().endsWith('int main() {\n  run();\n  return 0;\n}')).toBe(true);
  });

  it('compiles an entry document literally named "main" under an internal alias, so it doesn\'t collide with the synthesized int main()', () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const code = compileCppProject({
      documents: [functionDocument('doc-entry', 'main', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(code).not.toMatch(/void main\(\)/);
    expect(code.trim().endsWith('int main() {\n  __falang_main_fn();\n  return 0;\n}')).toBe(true);
  });

  it('rejects an entry document that returns a non-void value', () => {
    const fn = functionNode({ id: 'doc-fn', returnValue: int32, body: [{ id: 'r', name: 'return', data: '1' }] });
    expect(() =>
      compileCppProject({ documents: [functionDocument('doc-fn', 'fn', fn)], entryDocumentId: 'doc-fn' }),
    ).toThrow(/must return void/);
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
        compileCppProject({ documents });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(caught).toBeInstanceOf(CppProjectCompileError);
    const compileError = caught as CppProjectCompileError;
    expect(compileError.errors).toHaveLength(1);
    expect(compileError.errors[0]?.documentId).toBe('doc-broken');
    expect(compileError.partialCode).toContain('void fine()');
  });
});
