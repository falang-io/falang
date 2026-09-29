import { describe, expect, it } from 'vitest';
import { emitGoStructDeclarations } from './emit-go-struct-declarations.js';
import type { IStructDefinition } from './struct-definition.js';

const int32 = { type: 'integer' as const, integerType: 'int32' as const };

describe('emitGoStructDeclarations', () => {
  it('emits one struct per registry entry with capitalized field names', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-a', { name: 'ObjA', properties: { x: { type: 'number', numberType: int32 } } }],
    ]);

    expect(emitGoStructDeclarations(definitions, new Map([['obj-a', 'ObjA']]))).toBe(
      'type ObjA struct {\n  X int32\n}',
    );
  });

  it('needs no dependency ordering, unlike the cpp target — a struct nested by value may reference one declared later', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-c', { name: 'ObjC', properties: { z: { type: 'struct', id: 'obj-a' } } }],
      ['obj-a', { name: 'ObjA', properties: { x: { type: 'number', numberType: int32 } } }],
    ]);
    const structNames = new Map([
      ['obj-c', 'ObjC'],
      ['obj-a', 'ObjA'],
    ]);

    const code = emitGoStructDeclarations(definitions, structNames);
    // Emitted in registry (insertion) order, ObjC first — no reordering needed for Go to build.
    expect(code.indexOf('type ObjC')).toBeLessThan(code.indexOf('type ObjA'));
    expect(code).toContain('type ObjC struct {\n  Z ObjA\n}');
  });
});
