import { beforeEach, describe, expect, it } from 'vitest';
import { zod } from '@falang/dto';
import type { Scheme } from '@falang/scheme';
import { schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import type { ILlmToolCall } from './llm-client.js';
import { executeToolCall } from './tool-executor.js';
import { decodeJsonString, safeParseLenient } from './tool-result.js';

const call = (name: string, input: unknown): ILlmToolCall => ({ id: 'call-1', input, name });

describe('decodeJsonString / safeParseLenient', () => {
  it('decodes a JSON-encoded object/array string and leaves everything else alone', () => {
    expect(decodeJsonString(' {"a":1} ')).toEqual({ a: 1 });
    expect(decodeJsonString('[1,2]')).toEqual([1, 2]);
    expect(decodeJsonString('x > 0')).toBe('x > 0');
    expect(decodeJsonString('{ not json')).toBe('{ not json');
    expect(decodeJsonString(42)).toBe(42);
  });

  it('only decodes when the raw value fails the schema', () => {
    const objectSchema = zod.object({ chatId: zod.string() });
    expect(safeParseLenient(objectSchema, '{"chatId":"message.chat.id"}')).toMatchObject({
      data: { chatId: 'message.chat.id' },
      success: true,
    });
    // A string-typed field keeps a string that merely looks like JSON.
    expect(safeParseLenient(zod.string(), '{"a":1}')).toMatchObject({ data: '{"a":1}', success: true });
    // A double failure reports the original value's error.
    const failed = safeParseLenient(objectSchema, 'plain text');
    expect(failed.success).toBe(false);
  });
});

describe('executeToolCall accepts JSON-encoded object arguments', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  beforeEach(() => {
    scheme = schemeFactory({ document: { ...getTestEmptyDoc(), type: 'function' }, infra: getTestInfrastructure() });
    if (!scheme.rootNode) throw new Error('Root not set');
    bodyId = scheme.rootNode.children[1].id;
  });

  it('insert_nodes with `node` (and a nested child) sent as JSON strings', () => {
    const node = JSON.stringify({
      children: [
        JSON.stringify({ children: [{ data: 'then', name: 'action' }], name: 'if-child' }),
        { children: [], name: 'if-child' },
      ],
      data: 'x > 0',
      name: 'if',
    });

    const result = executeToolCall(call('insert_nodes', { index: 0, node, parentId: bodyId }), scheme);

    expect(result.ok).toBe(true);
    const ifNode = scheme.nodes.getNode(bodyId).children[0];
    expect(ifNode.name).toBe('if');
    expect(ifNode.children[0].children[0].data).toBe('then');
  });

  it('set_meta with `meta` sent as a JSON string', () => {
    const inserted = executeToolCall(
      call('insert_node', { data: 'x = 1', index: 0, name: 'action', parentId: bodyId }),
      scheme,
    );
    if (!inserted.ok) throw new Error(inserted.error);
    const { insertedId } = JSON.parse(inserted.content) as { insertedId: string };

    const result = executeToolCall(call('set_meta', { id: insertedId, meta: '{"width":300}' }), scheme);

    expect(result.ok).toBe(true);
    expect(scheme.nodes.getNode(insertedId).meta).toMatchObject({ width: 300 });
  });

  // A real 2026-09-28 chat: the whole subtree arrived JSON-encoded inside `node.name`.
  it("insert_nodes with the whole node JSON-encoded into `node.name` (and into a child's name)", () => {
    const encodedChild = JSON.stringify({ data: 'then', name: 'action' });
    // The real string also ended in one stray `]` after the object.
    const node = {
      name: `${JSON.stringify({
        children: [
          { children: [{ name: encodedChild }], name: 'if-child' },
          { children: [], name: 'if-child' },
        ],
        data: 'x > 0',
        name: 'if',
      })}]`,
    };

    const result = executeToolCall(call('insert_nodes', { index: 0, node, parentId: bodyId }), scheme);

    expect(result.ok).toBe(true);
    const ifNode = scheme.nodes.getNode(bodyId).children[0];
    expect(ifNode.name).toBe('if');
    expect(ifNode.children[0].children[0].data).toBe('then');
  });

  it('insert_node with a JSON-encoded node as `name` fails with a short, specific hint', () => {
    const name = JSON.stringify({ children: [{ data: 'x'.repeat(500), name: 'action' }], name: 'pseudo-cycle' });

    const result = executeToolCall(call('insert_node', { index: 0, name, parentId: bodyId }), scheme);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('is not a node kind');
    expect(result.error).toContain('insert_nodes');
    expect(result.error).not.toContain('is not allowed under');
    expect(result.error.length).toBeLessThan(400);
  });
});
