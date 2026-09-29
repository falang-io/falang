import { describe, expect, it } from 'vitest';
import { TypesRegistryStore } from '../../typescript-project-service/types-registry.store.js';
import type { IScopeVariable } from '@falang/typescript-common';
import { buildHiddenScopeCode } from './build-hidden-scope-code.js';

describe('buildHiddenScopeCode', () => {
  it('returns an empty string when there are no variables', () => {
    expect(buildHiddenScopeCode([], null)).toBe('');
  });

  it('declares scalar variables without a registry', () => {
    const variables: IScopeVariable[] = [
      { name: 'a', type: { type: 'string' } },
      { name: 'n', type: { type: 'number', numberType: { type: 'any' } } },
    ];

    expect(buildHiddenScopeCode(variables, null)).toBe('declare var a: string;\ndeclare var n: number;\n');
  });

  it('emits an interface per struct and resolves nested struct properties', () => {
    const registry = new TypesRegistryStore();
    registry.updateTypesByParent('structure', [
      {
        type: 'object',
        id: 'addr-id',
        parentId: 'structure',
        name: 'Address',
        properties: { city: { type: 'string' } },
      },
      {
        type: 'object',
        id: 'person-id',
        parentId: 'structure',
        name: 'Person',
        properties: {
          name: { type: 'string' },
          address: { type: 'struct', id: 'addr-id' },
        },
      },
    ]);

    const variables: IScopeVariable[] = [
      { name: 'p', type: { type: 'struct', id: 'person-id' } },
      { name: 'people', type: { type: 'array', elementType: { type: 'struct', id: 'person-id' }, dimensions: 1 } },
    ];

    const code = buildHiddenScopeCode(variables, registry);

    expect(code).toContain('interface Address {\n  city: string;\n}');
    expect(code).toContain('interface Person {\n  name: string;\n  address: Address;\n}');
    expect(code).toContain('declare var p: Person;');
    expect(code).toContain('declare var people: Person[];');
  });

  it('declares a raw-typed variable using its type query verbatim, without touching the struct registry', () => {
    const variables: IScopeVariable[] = [
      { name: 'popped', type: { type: 'raw', expression: "typeof items[number]['values'][number]", constant: true } },
    ];

    expect(buildHiddenScopeCode(variables, null)).toBe(
      "declare const popped: typeof items[number]['values'][number];\n",
    );
  });

  it('deduplicates variables with the same name, keeping the last declaration', () => {
    const variables: IScopeVariable[] = [
      { name: 'x', type: { type: 'string' } },
      { name: 'x', type: { type: 'number', numberType: { type: 'any' } } },
    ];

    expect(buildHiddenScopeCode(variables, null)).toBe('declare var x: number;\n');
  });
});
