import { beforeEach, describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import { HistoryModule, TOKEN_HISTORY, schemeFactory, type Scheme } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { applyTreeToScheme } from './apply-tree-to-scheme.js';
import { prepareDocumentWrite } from './prepare-document-write.js';
import { readSchemeTree, renderDocumentJson } from './project-node-tree.js';

const doc = (bodyChildren: INode[]): INode => ({
  children: [
    { data: '', id: 'h', name: 'function-header' },
    { children: bodyChildren, data: '', id: 'b', name: 'function-body' },
    { data: '', id: 'f', name: 'function-footer' },
  ],
  id: 'root',
  name: 'function',
});

const ifNode = (id: string, thenBody: INode[], elseBody: INode[], meta?: Record<string, boolean>): INode => ({
  children: [
    { children: thenBody, id: `${id}-0`, name: 'if-child' },
    { children: elseBody, id: `${id}-1`, name: 'if-child' },
  ],
  data: 'x > 1',
  id,
  name: 'if',
  ...(meta ? { meta } : {}),
});

/** A document file's node as the agent edits it (mutable, ids optional). */
interface IFileNode {
  id?: string;
  name: string;
  data?: unknown;
  children?: IFileNode[];
  out?: IFileNode;
}

/** The node at `indexes` (child positions from `node`), failing loudly when a fixture shape changed. */
const at = (node: IFileNode, ...indexes: number[]): IFileNode => {
  let current = node;
  for (const index of indexes) {
    const next = current.children?.[index];
    if (!next) throw new Error(`no child ${index} under ${current.name}`);
    current = next;
  }
  return current;
};

describe('JSON document files (ADR 0062)', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;

  const build = (root: INode): void => {
    scheme = schemeFactory({
      document: { id: 'd1', name: 'main', root, type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule()],
    });
  };
  const stack = () => scheme.infra.structure;
  const current = (): INode => readSchemeTree(scheme) as INode;
  const prepare = (text: string) =>
    prepareDocumentWrite({
      createId: (() => {
        let n = 0;
        return () => `new${(n += 1)}`;
      })(),
      documentId: 'd1',
      documentName: 'main',
      documentType: 'function',
      oldRoot: current(),
      stack: stack(),
      text,
    });
  const write = (text: string) => {
    const prepared = prepare(text);
    if (prepared.ok) applyTreeToScheme(scheme, prepared.root);
    return prepared;
  };
  const file = () => JSON.parse(renderDocumentJson(current(), stack())) as IFileNode;

  beforeEach(() => {
    build(
      doc([
        { data: 'a = 1', id: 'n1', meta: { width: 300 }, name: 'action' },
        ifNode('i1', [{ data: 'then', id: 'n2', name: 'action' }], [{ data: 'else', id: 'n3', name: 'action' }], {
          trueOnRight: true,
        }),
      ]),
    );
  });

  it('renders without meta, fills dropped default data and shows if branches then-first', () => {
    const text = renderDocumentJson(current(), stack());
    expect(text).not.toContain('meta');
    expect(text).not.toContain('width');
    const tree = file();
    expect(tree.children?.[0]).toEqual({ data: '', id: 'h', name: 'function-header' });
    const shownIf = tree.children?.[1].children?.[1];
    // Stored [then, else] with trueOnRight: true means slot 1 is "then" → shown first.
    expect(shownIf?.children?.[0].children?.[0].data).toBe('else');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('round-trips the rendered file without any change', () => {
    const before = current();
    const result = write(renderDocumentJson(before, stack()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toMatchObject({ added: 0, modified: 0, removed: 0 });
    expect(current()).toEqual(before);
  });

  it('edits one node in place: ids and layout kept, one undo step restores it', () => {
    const tree = file();
    at(tree, 1, 0).data = 'a = 2';
    const result = write(JSON.stringify(tree));
    expect(result.ok && result.changes).toMatchObject({ modified: 1 });
    expect(scheme.nodes.getNode('n1').data).toBe('a = 2');
    expect(scheme.nodes.getNode('n1').meta).toEqual({ width: 300 });
    resolveService(TOKEN_HISTORY, scheme.container).back();
    expect(scheme.nodes.getNode('n1').data).toBe('a = 1');
  });

  it('gives a new id to a node written without one, and to a node with an unknown id', () => {
    const tree = file();
    tree.children?.[1].children?.push(
      { data: 'c', name: 'action' },
      {
        data: 'd',
        id: 'made-up',
        name: 'action',
      },
    );
    const result = write(JSON.stringify(tree));
    expect(result.ok && result.newIds).toBe(2);
    const body = scheme.nodes.getNode('b');
    expect(body.children.map((child) => child.id)).toEqual(['n1', 'i1', 'new1', 'new2']);
    expect(body.children[0].meta).toEqual({ width: 300 });
  });

  it('moves a node between branches by id (deletes before inserts, no duplicate)', () => {
    const tree = file();
    const shownIf = tree.children?.[1].children?.[1] as IFileNode;
    const [thenBranch, elseBranch] = shownIf.children as IFileNode[];
    thenBranch.children?.push(...(elseBranch.children ?? []));
    elseBranch.children = [];
    expect(write(JSON.stringify(tree)).ok).toBe(true);
    // Stored [i1-0: n2, i1-1: n3] with trueOnRight → the file shows i1-1 (then) first; n2 joined it.
    expect(scheme.nodes.getNode('n2').parent?.id).toBe('i1-1');
    expect(scheme.nodes.getNode('i1-1').children.map((child) => child.id)).toEqual(['n3', 'n2']);
    expect(scheme.nodes.getNode('i1-0').children).toHaveLength(0);
    expect(scheme.nodes.getNode('i1').meta).toMatchObject({ trueOnRight: true });
  });

  it('keeps tuple slot and root ids when the agent drops them', () => {
    const tree = file();
    tree.id = '';
    for (const slot of tree.children ?? []) slot.id = '';
    const withoutSlots = tree;
    expect(write(JSON.stringify(withoutSlots)).ok).toBe(true);
    expect(scheme.rootNode?.id).toBe('root');
    expect(scheme.rootNode?.children.map((child) => child.id)).toEqual(['h', 'b', 'f']);
  });

  it('swaps an if whose then-branch jumps away first and flips trueOnRight', () => {
    build(doc([{ data: 'a', id: 'n0', name: 'action' }, ifNode('i2', [], [])]));
    const tree = file();
    const shownIf = tree.children?.[1].children?.[1] as IFileNode;
    at(shownIf, 0).out = { id: 'o1', name: 'out' };
    at(shownIf, 1).children = [{ data: 'stay', name: 'action' }];
    const result = write(JSON.stringify(tree));
    expect(result.ok ? 'ok' : result.error).toBe('ok');
    const stored = scheme.nodes.getNode('i2');
    expect(stored.meta).toMatchObject({ trueOnRight: true });
    expect(stored.children[0].out).toBeNull();
    expect(stored.children[1].out?.name).toBe('out');
    // The file still shows the jumping branch as "then" (slot 0).
    const reread = file().children?.[1].children?.[1] as IFileNode;
    expect(reread.children?.[0].out?.name).toBe('out');
  });

  describe('errors (nothing is applied)', () => {
    const expectError = (text: string, ...fragments: string[]) => {
      const before = current();
      const result = write(text);
      expect(result.ok).toBe(false);
      if (!result.ok) for (const fragment of fragments) expect(result.error).toContain(fragment);
      expect(current()).toEqual(before);
    };

    it('reports invalid JSON with a line and column', () => {
      expectError('{\n  "name": "function",\n  "id": "root",\n}', 'line 4');
    });

    it('rejects an unknown kind with its path', () => {
      const tree = file();
      tree.children?.[1].children?.push({ name: 'nope' });
      expectError(JSON.stringify(tree), 'root.children[1].children[2]', 'unknown node kind "nope"');
    });

    it('rejects a duplicate id naming both paths', () => {
      const tree = file();
      tree.children?.[1].children?.push({ data: 'x', id: 'n1', name: 'action' });
      expectError(JSON.stringify(tree), 'duplicate node id "n1"', 'root.children[1].children[0]');
    });

    it('rejects statements put directly into a fixed-slot node', () => {
      const tree = file();
      tree.children?.push({ data: 'x', name: 'action' });
      expectError(JSON.stringify(tree), 'must have exactly [function-header, function-body, function-footer]');
    });

    it('rejects a kind not allowed in a list', () => {
      const tree = file();
      tree.children?.[1].children?.push({ name: 'function-body' });
      expectError(JSON.stringify(tree), '"function-body" is not allowed inside "function-body"');
    });

    it('names the node, its kind and its schema file on a data error', () => {
      const tree = file();
      at(tree, 1, 0).data = 5;
      expectError(JSON.stringify(tree), '(action n1)', 'schemas/action.json');
    });

    it('rejects an out on the first statement of a plain list', () => {
      const tree = file();
      at(tree, 1, 0).out = { name: 'out' };
      expectError(JSON.stringify(tree), 'root');
    });

    it('refuses to change the root kind', () => {
      expectError(JSON.stringify({ id: 'root', name: 'while' }), 'must stay a "function"');
    });
  });
});
