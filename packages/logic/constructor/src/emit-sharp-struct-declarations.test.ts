import { describe, expect, it } from 'vitest';
import { emitSharpStructDeclarations } from './emit-sharp-struct-declarations.js';
import type { IStructDefinition } from './struct-definition.js';

const int32 = { type: 'integer' as const, integerType: 'int32' as const };
const int32Type = { type: 'number' as const, numberType: int32 };

describe('emitSharpStructDeclarations', () => {
  it('emits a class (not a C# struct) with initialized fields and a generated Clone()', () => {
    const definitions = new Map<string, IStructDefinition>([['obj-a', { name: 'ObjA', properties: { x: int32Type } }]]);

    expect(emitSharpStructDeclarations(definitions, new Map([['obj-a', 'ObjA']]))).toBe(
      [
        'public class ObjA {',
        '  public int x = 0;',
        '  public ObjA Clone() {',
        '    return new ObjA() {',
        '      x = this.x,',
        '    };',
        '  }',
        '}',
      ].join('\n'),
    );
  });

  it('deep-copies a nested struct field and an array field in Clone(), so a cloned value shares nothing with its source', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-a', { name: 'ObjA', properties: { x: int32Type } }],
      [
        'obj-c',
        {
          name: 'ObjC',
          properties: {
            z: { type: 'struct', id: 'obj-a' },
            items: { type: 'array', elementType: int32Type, dimensions: 1 },
            objects: { type: 'array', elementType: { type: 'struct', id: 'obj-a' }, dimensions: 1 },
          },
        },
      ],
    ]);
    const structNames = new Map([
      ['obj-a', 'ObjA'],
      ['obj-c', 'ObjC'],
    ]);

    const code = emitSharpStructDeclarations(definitions, structNames);
    expect(code).toContain('public ObjA z = new ObjA();');
    expect(code).toContain('public List<int> items = new List<int>();');
    expect(code).toContain('z = (this.z).Clone(),');
    expect(code).toContain('items = new List<int>(this.items),');
    // An array of structs is copied element-wise, not shallow-copied the way old `logic_objects`'
    // generated Clone() did for an array of arrays.
    expect(code).toContain('objects = (this.objects).Select(_copy0 => (_copy0).Clone()).ToList(),');
  });

  it('rejects a circular struct dependency, which the emitted field initializers would otherwise recurse on forever at construction', () => {
    const definitions = new Map<string, IStructDefinition>([
      ['obj-a', { name: 'ObjA', properties: { other: { type: 'struct', id: 'obj-b' } } }],
      ['obj-b', { name: 'ObjB', properties: { other: { type: 'struct', id: 'obj-a' } } }],
    ]);
    const structNames = new Map([
      ['obj-a', 'ObjA'],
      ['obj-b', 'ObjB'],
    ]);

    expect(() => emitSharpStructDeclarations(definitions, structNames)).toThrow(/Circular struct dependency/);
  });
});
