import { describe, expect, it } from 'vitest';
import { emitCppStructDeclarations } from './emit-cpp-struct-declarations.js';
import type { IStructDefinition } from './struct-definition.js';

const int32 = { type: 'integer' as const, integerType: 'int32' as const };

describe('emitCppStructDeclarations', () => {
  it('emits one struct per registry entry with its fields typed', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-a', { name: 'ObjA', properties: { x: { type: 'number', numberType: int32 } } }],
    ]);

    expect(emitCppStructDeclarations(definitions, new Map([['obj-a', 'ObjA']]))).toBe('struct ObjA {\n  int x;\n};');
  });

  it('declares a struct nested by value after the struct it depends on, regardless of registry insertion order', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-c', { name: 'ObjC', properties: { z: { type: 'struct', id: 'obj-a' } } }],
      ['obj-a', { name: 'ObjA', properties: { x: { type: 'number', numberType: int32 } } }],
    ]);
    const structNames = new Map([
      ['obj-c', 'ObjC'],
      ['obj-a', 'ObjA'],
    ]);

    const code = emitCppStructDeclarations(definitions, structNames);
    expect(code.indexOf('struct ObjA')).toBeLessThan(code.indexOf('struct ObjC'));
    expect(code).toContain('struct ObjC {\n  ObjA z;\n};');
  });

  it('throws on a circular struct dependency instead of infinite-looping', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-a', { name: 'ObjA', properties: { b: { type: 'struct', id: 'obj-b' } } }],
      ['obj-b', { name: 'ObjB', properties: { a: { type: 'struct', id: 'obj-a' } } }],
    ]);
    const structNames = new Map([
      ['obj-a', 'ObjA'],
      ['obj-b', 'ObjB'],
    ]);

    expect(() => emitCppStructDeclarations(definitions, structNames)).toThrow(/Circular struct dependency/);
  });
});
