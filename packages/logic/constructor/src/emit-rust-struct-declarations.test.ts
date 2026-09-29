import { describe, expect, it } from 'vitest';
import { emitRustStructDeclarationsForDocument } from './emit-rust-struct-declarations.js';
import type { IStructDefinition } from './struct-definition.js';

const int32 = { type: 'integer' as const, integerType: 'int32' as const };

describe('emitRustStructDeclarationsForDocument', () => {
  it('emits one pub struct per given thread id, deriving Clone/Default/Debug, pub fields, with field names left as-is (no Go-style capitalization)', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-a', { name: 'ObjA', properties: { x: { type: 'number', numberType: int32 } } }],
    ]);

    expect(emitRustStructDeclarationsForDocument(['obj-a'], definitions, new Map([['obj-a', 'ObjA']]), new Map())).toBe(
      '#[derive(Clone, Default, Debug)]\npub struct ObjA {\n  pub x: i32,\n}',
    );
  });

  it('needs no dependency ordering, unlike the cpp target — a struct nested by value may reference one declared later, and fully-qualifies a cross-document field type via structDocuments', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-c', { name: 'ObjC', properties: { z: { type: 'struct', id: 'obj-a' } } }],
      ['obj-a', { name: 'ObjA', properties: { x: { type: 'number', numberType: int32 } } }],
    ]);
    const structNames = new Map([
      ['obj-c', 'ObjC'],
      ['obj-a', 'ObjA'],
    ]);
    const structDocuments = new Map([
      ['obj-c', 'Doc'],
      ['obj-a', 'Doc'],
    ]);

    // Only obj-c is requested here (as if it were compiled into its own document's file) — obj-a's
    // own declaration lives in a different generated file, referenced by its fully-qualified path.
    const code = emitRustStructDeclarationsForDocument(['obj-c'], definitions, structNames, structDocuments);
    expect(code).toBe('#[derive(Clone, Default, Debug)]\npub struct ObjC {\n  pub z: crate::falang::Doc::ObjA,\n}');
  });

  it('returns an empty string for an empty thread id list', () => {
    expect(emitRustStructDeclarationsForDocument([], new Map(), new Map(), new Map())).toBe('');
  });
});
