import { NodesStack } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { EXTERNAL_API_STRUCTURE_NAME, externalApiStructureNodes } from './external-api-structure-nodes.js';

describe('externalApiStructureNodes', () => {
  it('builds a NodesStack without configuration errors', () => {
    expect(() => new NodesStack([externalApiStructureNodes])).not.toThrow();
  });

  it('factory produces a default tree that round-trips through parseNode', () => {
    const stack = new NodesStack([externalApiStructureNodes]);
    const root = stack.factory(EXTERNAL_API_STRUCTURE_NAME);
    expect(() => stack.parseNode(root)).not.toThrow();
    const [, body] = root.children ?? [];
    const [thread] = body?.children ?? [];
    expect(thread?.name).toBe(`${EXTERNAL_API_STRUCTURE_NAME}-thread`);
    expect(thread?.data).toEqual({ name: 'api1' });
    const [item] = thread?.children ?? [];
    expect(item?.name).toBe(`${EXTERNAL_API_STRUCTURE_NAME}-child`);
    expect(item?.data).toEqual({ name: 'endpoint1', parameters: [] });
  });
});
