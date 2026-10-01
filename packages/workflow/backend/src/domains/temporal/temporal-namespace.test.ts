import { describe, expect, it } from 'vitest';
import { projectIdFromNamespace, temporalNamespaceFor } from './temporal-namespace.js';

describe('temporal namespace naming', () => {
  it('names a project namespace falang-<projectId>', () => {
    const projectId = '3f2b8c1e-0d4a-4f55-9a77-1c2d3e4f5a6b';

    expect(temporalNamespaceFor(projectId)).toBe('falang-3f2b8c1e-0d4a-4f55-9a77-1c2d3e4f5a6b');
    expect(temporalNamespaceFor(projectId)).toHaveLength(43);
  });

  it('gives different projects different namespaces', () => {
    expect(temporalNamespaceFor('a')).not.toBe(temporalNamespaceFor('b'));
  });

  it('maps a namespace back to its project id, and rejects anything that is not one of ours', () => {
    expect(projectIdFromNamespace('falang-abc')).toBe('abc');
    expect(projectIdFromNamespace('default')).toBeNull();
    expect(projectIdFromNamespace('temporal-system')).toBeNull();
    expect(projectIdFromNamespace('falang-')).toBeNull();
  });
});
