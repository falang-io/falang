import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { compileRustProject, RustProjectCompileError } from './compile-rust-project.js';

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
  documentName: string,
  threadId: string,
  name: string,
  properties: Record<string, unknown>,
): IProjectDocument => ({
  id: documentId,
  type: OBJECTS_STRUCTURE_NAME,
  name: documentName,
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

describe('compileRustProject', () => {
  it('emits one file per objects-structure document (pub struct, pub fields, Clone/Default/Debug, unchanged field names), one per function document, falang_global.rs, and mod.rs wiring them all up', () => {
    const struct = structDocument('doc-obj', 'ObjA', 'thread-objA', 'ObjA', { x: int32, y: int32 });
    const structType = { type: 'struct', id: 'thread-objA' };

    const main = functionNode({
      id: 'doc-main',
      body: [
        { id: 'cv', name: 'create-var', data: { name: 'a', variableType: structType } },
        { id: 'act', name: 'action', data: 'a.x = 10' },
        { id: 'log', name: 'log', data: 'a.x is ${a.x}' },
      ],
    });

    const { files } = compileRustProject({ documents: [struct, functionDocument('doc-main', 'main', main)] });

    expect(Object.keys(files).toSorted()).toEqual(['ObjA.rs', 'falang_global.rs', 'main.rs', 'mod.rs']);
    expect(files['ObjA.rs']).toContain(
      '#[derive(Clone, Default, Debug)]\npub struct ObjA {\n  pub x: i32,\n  pub y: i32,\n}',
    );
    expect(files['main.rs']).toContain('let mut a: crate::falang::ObjA::ObjA = Default::default();');
    expect(files['main.rs']).toContain('a.x = 10;');
    expect(files['main.rs']).toContain('println!("a.x is {}", a.x);');
    expect(files['main.rs']).toContain('pub fn main(_apis: &mut dyn crate::falang::falang_global::Apis) {');
    expect(files['falang_global.rs']).toBe('pub trait Apis {\n}');
    expect(files['mod.rs']).toBe(
      [
        '#![allow(non_snake_case, unused_mut, unused_variables, dead_code, unused_must_use, unreachable_code)]',
        'pub mod falang_global;\npub mod ObjA;\npub mod main;',
      ].join('\n\n'),
    );
  });

  it("resolves call-function across documents to the callee's fully-qualified crate::falang::<Doc>::<fn> path, passing _apis last", () => {
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

    const { files } = compileRustProject({
      documents: [functionDocument('doc-callee', 'increment', callee), functionDocument('doc-caller', 'main', caller)],
    });

    expect(files['increment.rs']).toContain(
      'pub fn increment(mut n: i32, _apis: &mut dyn crate::falang::falang_global::Apis) -> i32 {',
    );
    expect(files['increment.rs']).toContain('return n + 1;');
    expect(files['main.rs']).toContain('let mut result = crate::falang::increment::increment(5, _apis);');
  });

  it('passes struct/array-typed call-function arguments as & references, not clones — the callee borrows', () => {
    const structType = { type: 'struct', id: 'thread-objA' };
    const struct = structDocument('doc-obj', 'ObjA', 'thread-objA', 'ObjA', { x: int32 });
    const callee = functionNode({
      id: 'doc-callee',
      parameters: [{ name: 'o', type: structType }],
      body: [{ id: 'l', name: 'log', data: 'o.x is ${o.x}' }],
    });
    const caller = functionNode({
      id: 'doc-caller',
      body: [
        { id: 'cv', name: 'create-var', data: { name: 'obj', variableType: structType } },
        { id: 'c', name: 'call-function', data: { schemeId: 'doc-callee', parameters: ['obj'], returnVariable: '' } },
      ],
    });

    const { files } = compileRustProject({
      documents: [
        struct,
        functionDocument('doc-callee', 'inspect', callee),
        functionDocument('doc-caller', 'main', caller),
      ],
    });

    expect(files['inspect.rs']).toContain(
      'pub fn inspect(o: &crate::falang::ObjA::ObjA, _apis: &mut dyn crate::falang::falang_global::Apis) {',
    );
    expect(files['main.rs']).toContain('crate::falang::inspect::inspect(&(obj), _apis);');
  });

  it("re-exports the entry document's own function as falang_entry in mod.rs when entryDocumentId is given", () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const { files } = compileRustProject({
      documents: [functionDocument('doc-entry', 'run', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(files['mod.rs']).toContain('pub use self::run::run as falang_entry;');
  });

  it('compiles an entry document literally named "main" with no aliasing needed — module+fn "main" don\'t collide, since there is no longer a synthesized top-level fn main()', () => {
    const entry = functionNode({ id: 'doc-entry', body: [{ id: 'l', name: 'log', data: 'hello' }] });
    const { files } = compileRustProject({
      documents: [functionDocument('doc-entry', 'main', entry)],
      entryDocumentId: 'doc-entry',
    });
    expect(files['main.rs']).toContain('pub fn main(_apis');
    expect(files['mod.rs']).toContain('pub use self::main::main as falang_entry;');
  });

  it('rejects an entry document that returns a non-void value', () => {
    const fn = functionNode({ id: 'doc-fn', returnValue: int32, body: [{ id: 'r', name: 'return', data: '1' }] });
    expect(() =>
      compileRustProject({ documents: [functionDocument('doc-fn', 'fn', fn)], entryDocumentId: 'doc-fn' }),
    ).toThrow(/must return void/);
  });

  it('needs no forward-declaration pass, unlike the cpp target — a function may call one compiled/declared later in the documents list', () => {
    const caller = functionNode({
      id: 'doc-caller',
      body: [{ id: 'c', name: 'call-function', data: { schemeId: 'doc-callee', parameters: [], returnVariable: '' } }],
    });
    const callee = functionNode({ id: 'doc-callee', body: [{ id: 'l', name: 'log', data: 'called' }] });

    const { files } = compileRustProject({
      documents: [functionDocument('doc-caller', 'caller', caller), functionDocument('doc-callee', 'callee', callee)],
    });
    expect(files['caller.rs']).toContain('crate::falang::callee::callee(_apis);');
    expect(files['callee.rs']).toContain('pub fn callee(_apis');
  });

  it("auto-declares returnValue (Default::default()) and unconditionally appends a trailing `return returnValue;` for every non-void function — satisfying Rust's static terminating-statement check the same way Go's own needsTrailingPanic fix once did, now fully subsumed by this mechanism (ADR 0019 (private)'s \"Rust target — old-app layout\"). Also exercises the real gap this closes: a body whose only return lives inside a loop, never reaching the function's own top level", () => {
    const fn = functionNode({
      id: 'doc-fn',
      returnValue: int32,
      body: [{ id: 'w', name: 'while', data: 'true', children: [{ id: 'r', name: 'return', data: '1' }] }],
    });
    const { files } = compileRustProject({ documents: [functionDocument('doc-fn', 'fn', fn)] });
    expect(files['fn.rs']).toContain('let mut returnValue: i32 = Default::default();');
    expect(files['fn.rs']).toContain('return 1;');
    expect(files['fn.rs']).toMatch(/return returnValue;\s*\n\}$/);
  });

  it("still emits the trailing `return returnValue;` (dead code, suppressed by unreachable_code) even when the body already ends in an explicit return — matching the TS target's identical RETURN_VALUE_NAME convention", () => {
    const fn = functionNode({ id: 'doc-fn', returnValue: int32, body: [{ id: 'r', name: 'return', data: '1' }] });
    const { files } = compileRustProject({ documents: [functionDocument('doc-fn', 'fn', fn)] });
    expect(files['fn.rs']).toContain('let mut returnValue: i32 = Default::default();');
    expect(files['fn.rs']).toContain('return 1;');
    expect(files['fn.rs']).toMatch(/return returnValue;\s*\n\}$/);
  });

  it('declares no returnValue local at all for a void function', () => {
    const fn = functionNode({ id: 'doc-fn', body: [{ id: 'l', name: 'log', data: 'hi' }] });
    const { files } = compileRustProject({ documents: [functionDocument('doc-fn', 'fn', fn)] });
    expect(files['fn.rs']).not.toContain('returnValue');
  });

  it("collects a per-document compile error without losing the other documents' compiled files", () => {
    const broken = functionNode({
      id: 'doc-broken',
      body: [{ id: 'a', name: 'unknown-node-kind' } as unknown as INode],
    });
    const fine = functionNode({ id: 'doc-fine', body: [{ id: 'l', name: 'log', data: 'ok' }] });
    const documents = [functionDocument('doc-broken', 'broken', broken), functionDocument('doc-fine', 'fine', fine)];

    const caught: unknown = ((): unknown => {
      try {
        compileRustProject({ documents });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(caught).toBeInstanceOf(RustProjectCompileError);
    const compileError = caught as RustProjectCompileError;
    expect(compileError.errors).toHaveLength(1);
    expect(compileError.errors[0]?.documentId).toBe('doc-broken');
    expect(compileError.partialFiles['fine.rs']).toContain('pub fn fine');
    expect(compileError.partialFiles['broken.rs']).toBeUndefined();
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

      const { files } = compileRustProject({ documents: [functionDocument('doc-sum', 'sum', objCSum)] });

      expect(files['sum.rs']).toContain(
        'pub fn sum(mut a: i32, mut b: f32, _apis: &mut dyn crate::falang::falang_global::Apis) -> i32 {',
      );
      expect(files['sum.rs']).toContain('return ((a) as f32 + b) as i32;');
    },
  );

  it('also narrows a plain int32-looking-literal assignment into a float32 struct field — a second, independent gap the Docker build&run harness found (rustc rejects `x.y = 50;` when y is float32)', () => {
    const struct = structDocument('doc-obj', 'Obj', 'thread-obj', 'Obj', {
      y: { type: 'number', numberType: { type: 'float', floatType: 'float32' } },
    });
    const structType = { type: 'struct', id: 'thread-obj' };
    const main = functionNode({
      id: 'doc-main',
      body: [
        { id: 'cv', name: 'create-var', data: { name: 'o', variableType: structType } },
        { id: 'act', name: 'action', data: 'o.y = 50' },
      ],
    });

    const { files } = compileRustProject({ documents: [struct, functionDocument('doc-main', 'main', main)] });

    expect(files['main.rs']).toContain('o.y = (50) as f32;');
  });
});
