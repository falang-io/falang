import { NodesStack } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { ENUM_STRUCTURE_NAME, enumStructureNodes } from './enum-structure-nodes.js';

describe('enumStructureNodes', () => {
  it('builds a NodesStack without configuration errors', () => {
    expect(() => new NodesStack([enumStructureNodes])).not.toThrow();
  });

  it('factory produces a default tree that round-trips through parseNode', () => {
    const stack = new NodesStack([enumStructureNodes]);
    const root = stack.factory(ENUM_STRUCTURE_NAME);
    expect(() => stack.parseNode(root)).not.toThrow();
    expect(root.name).toBe(ENUM_STRUCTURE_NAME);
    const [header, body] = root.children ?? [];
    expect(header?.name).toBe(`${ENUM_STRUCTURE_NAME}-header`);
    expect(body?.name).toBe(`${ENUM_STRUCTURE_NAME}-body`);
    const [thread] = body?.children ?? [];
    expect(thread?.name).toBe(`${ENUM_STRUCTURE_NAME}-thread`);
    expect(thread?.data).toEqual({ name: 'enum1', valueType: 'string' });
    const [item] = thread?.children ?? [];
    expect(item?.name).toBe(`${ENUM_STRUCTURE_NAME}-child`);
    expect(item?.data).toEqual({ key: '', value: '' });
  });
});
