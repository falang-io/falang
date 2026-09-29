import { describe, expect, it } from 'vitest';
import type { TLlmMessage } from './llm-client.js';
import { SUPERSEDED_RESULT, supersedeEarlierToolResults } from './supersede-tool-results.js';

const assistant = (...calls: [id: string, name: string, input?: Record<string, unknown>][]): TLlmMessage => ({
  content: '',
  role: 'assistant',
  toolCalls: calls.map(([id, name, input]) => ({ id, input: input ?? {}, name })),
});

const tool = (...results: [id: string, content: string, isError?: boolean][]): TLlmMessage => ({
  results: results.map(([toolCallId, content, isError]) => ({ content, isError: isError ?? false, toolCallId })),
  role: 'tool',
});

const contentOf = (messages: TLlmMessage[], toolCallId: string): string | null => {
  for (const message of messages) {
    if (message.role !== 'tool') continue;
    const found = message.results.find((result) => result.toolCallId === toolCallId);
    if (found) return found.content;
  }
  return null;
};

describe('supersedeEarlierToolResults', () => {
  it('replaces an earlier get_node_kinds result once get_node_kinds is called again', () => {
    const messages: TLlmMessage[] = [
      { content: 'build a bot', role: 'user' },
      assistant(['a', 'get_node_kinds'], ['b', 'get_tree']),
      tool(['a', 'KINDS-1'], ['b', 'TREE-1']),
      assistant(['c', 'get_node_kinds'], ['d', 'get_node_kinds']),
      tool(['c', 'KINDS-2'], ['d', 'KINDS-3']),
    ];

    supersedeEarlierToolResults(messages);

    expect(contentOf(messages, 'a')).toBe(SUPERSEDED_RESULT);
    expect(contentOf(messages, 'b')).toBe('TREE-1');
    expect(contentOf(messages, 'c')).toBe('KINDS-2');
    expect(contentOf(messages, 'd')).toBe('KINDS-3');
  });

  it('leaves everything alone when the latest batch has no supersedable call', () => {
    const messages: TLlmMessage[] = [
      assistant(['a', 'get_node_kinds']),
      tool(['a', 'KINDS-1']),
      assistant(['b', 'insert_node']),
      tool(['b', 'OK']),
    ];

    supersedeEarlierToolResults(messages);

    expect(contentOf(messages, 'a')).toBe('KINDS-1');
  });

  it('a failed call supersedes nothing', () => {
    const messages: TLlmMessage[] = [
      assistant(['a', 'get_node_kinds', { parentId: 'body' }]),
      tool(['a', 'KINDS-1']),
      assistant(['b', 'get_node_kinds', { parentId: 'missing' }]),
      tool(['b', 'Node not found: missing', true]),
    ];

    supersedeEarlierToolResults(messages);

    expect(contentOf(messages, 'a')).toBe('KINDS-1');
  });

  it('a later whole-document get_tree supersedes earlier trees of the same document only', () => {
    const messages: TLlmMessage[] = [
      assistant(['a', 'get_tree', { documentId: 'doc1' }], ['b', 'get_tree', { documentId: 'doc2' }]),
      tool(['a', 'DOC1-TREE-1'], ['b', 'DOC2-TREE-1']),
      assistant(['c', 'get_tree', { documentId: 'doc1', nodeId: 'n5' }]),
      tool(['c', '{"id":"n5"}']),
      assistant(['d', 'get_tree', { documentId: 'doc1' }]),
      tool(['d', 'DOC1-TREE-2']),
    ];

    supersedeEarlierToolResults(messages);

    expect(contentOf(messages, 'a')).toBe(SUPERSEDED_RESULT);
    expect(contentOf(messages, 'c')).toBe(SUPERSEDED_RESULT);
    expect(contentOf(messages, 'b')).toBe('DOC2-TREE-1');
    expect(contentOf(messages, 'd')).toBe('DOC1-TREE-2');
  });

  it('an omitted documentId means the active document', () => {
    const messages: TLlmMessage[] = [
      assistant(['a', 'get_tree', { documentId: 'active' }], ['b', 'get_tree', { documentId: 'other' }]),
      tool(['a', 'ACTIVE-1'], ['b', 'OTHER-1']),
      assistant(['c', 'get_tree']),
      tool(['c', 'ACTIVE-2']),
    ];

    supersedeEarlierToolResults(messages, 'active');

    expect(contentOf(messages, 'a')).toBe(SUPERSEDED_RESULT);
    expect(contentOf(messages, 'b')).toBe('OTHER-1');
  });

  it('a later subtree supersedes an earlier tree only when it covers it', () => {
    const messages: TLlmMessage[] = [
      assistant(['a', 'get_tree', { documentId: 'doc' }]),
      tool(['a', 'WHOLE-1']),
      assistant(['b', 'get_tree', { documentId: 'doc', nodeId: 'inner' }]),
      tool(['b', '{"id":"inner"}']),
      assistant(['c', 'get_tree', { documentId: 'doc', nodeId: 'sibling' }]),
      tool(['c', '{"id":"sibling"}']),
      assistant(['d', 'get_tree', { documentId: 'doc', nodeId: 'outer' }]),
      tool(['d', '{"id":"outer","children":[{"id":"inner"}]}']),
    ];

    supersedeEarlierToolResults(messages);

    // A subtree never covers the whole document fetched earlier.
    expect(contentOf(messages, 'a')).toBe('WHOLE-1');
    expect(contentOf(messages, 'b')).toBe(SUPERSEDED_RESULT);
    expect(contentOf(messages, 'c')).toBe('{"id":"sibling"}');
  });

  it('a get_tree never supersedes get_node_kinds, nor the other way round', () => {
    const messages: TLlmMessage[] = [
      assistant(['a', 'get_node_kinds', { parentId: 'body' }], ['b', 'get_tree']),
      tool(['a', 'KINDS-1'], ['b', 'TREE-1']),
      assistant(['c', 'get_tree', { nodeId: 'body' }]),
      tool(['c', '{"id":"body"}']),
    ];

    supersedeEarlierToolResults(messages);

    expect(contentOf(messages, 'a')).toBe('KINDS-1');
    expect(contentOf(messages, 'b')).toBe('TREE-1');
  });
});
