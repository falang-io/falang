// oxlint-disable no-console, max-lines, complexity -- a measurement script: one corpus walk, numbers out.
/**
 * Measures the JSON file interface (ADR 0062) on real workflow trees: for every function/trigger-function/
 * objects-structure document of every project export (`{ documents: [...] }` JSON, e.g. agent-tuner fixtures and
 * `final-project.json`s) given on the command line (files or directories, searched recursively):
 *
 * - round trip — render the file, write it back unchanged: the tree, ids and meta must stay identical and nothing
 *   may be reported as changed;
 * - single edits — per document up to `--ops` statements: change one node's string data / delete one statement /
 *   insert one new action after it, through `edit_file`-equivalent text and the real write pipeline + scheme apply;
 *   exactly the touched ids may change.
 *
 * Prints counts only (no tree content), so it can be pointed at private data. Usage:
 *   npx tsx scripts/json-files-corpus.ts [--ops 5] <path>...
 */
import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyTreeToScheme,
  prepareDocumentWrite,
  readSchemeTree,
  renderDocumentJson,
  type TPrepareDocumentWriteResult,
} from '@falang/agent';
import type { INode } from '@falang/dto';
import type { Scheme } from '@falang/scheme';
import { HeadlessWorkflowStore } from './headless-workflow-store.js';
import type { WorkflowDocument } from '../packages/workflow/client-common/src/workflow-types.js';

const TREE_TYPES = new Set(['function', 'trigger-function', 'objects-structure']);

interface IStats {
  projects: number;
  documents: number;
  nodes: number;
  bytes: number;
  skipped: number;
  skipReasons: Map<string, number>;
  roundTripIdentical: number;
  roundTripFailures: string[];
  ops: { kind: string; ok: boolean; reason?: string }[];
}

const listFiles = (path: string): string[] => {
  if (statSync(path).isDirectory()) return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
  return path.endsWith('.json') ? [path] : [];
};

const countNodes = (node: INode): number =>
  1 +
  (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0) +
  (node.mods ?? []).reduce((sum, mod) => sum + countNodes(mod), 0) +
  (node.out ? countNodes(node.out) : 0);

const flattenKeys = (value: unknown, out: Record<string, true> = {}): Record<string, true> => {
  if (Array.isArray(value)) for (const item of value) flattenKeys(item, out);
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out[key] = true;
      flattenKeys(inner, out);
    }
  }
  return out;
};

const canonical = (node: INode | null): string => JSON.stringify(node, Object.keys(flattenKeys(node)).toSorted());

const opReason = (ok: boolean, result: TPrepareDocumentWriteResult): string => {
  if (ok) return '';
  return result.ok ? JSON.stringify(result.changes) : result.error.slice(0, 120);
};

const bump = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

/** Statement lists in the rendered file: `[path to the list, index]` for every statement node. */
interface IStatementRef {
  readonly list: INode[];
  readonly index: number;
}

const collectStatements = (
  node: INode,
  stack: { hasListChildren: (kind: string) => boolean },
  out: IStatementRef[],
): void => {
  const children = (node.children ?? []) as INode[];
  if (stack.hasListChildren(node.name)) children.forEach((_child, index) => out.push({ index, list: children }));
  for (const child of children) collectStatements(child, stack, out);
  if (node.out) collectStatements(node.out, stack, out);
};

const nodeIds = (node: INode, out: string[] = []): string[] => {
  out.push(node.id);
  for (const child of node.children ?? []) nodeIds(child, out);
  for (const mod of node.mods ?? []) nodeIds(mod, out);
  if (node.out) nodeIds(node.out, out);
  return out;
};

// The scheme runtime logs every command/event to console.log — keep the report readable.
const print = console.log.bind(console);
console.log = () => null;

const readPayload = (file: string): { documents?: WorkflowDocument[] } => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as { documents?: WorkflowDocument[] };
  } catch {
    return {};
  }
};

/** Where two trees first differ: `<node kind>.<field>: <before> → <after>` (values truncated, no ids). */
const firstDifference = (a: unknown, b: unknown, where: string): string => {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const kind = (a as { name?: string }).name;
    const here = kind || where;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const inner = firstDifference(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        `${here}.${key}`,
      );
      if (inner) return inner;
    }
  }
  return `${where}: ${JSON.stringify(a)?.slice(0, 50)} → ${JSON.stringify(b)?.slice(0, 50)}`;
};

/** The kind of the node whose `children` array is `list`. */
const findParentKind = (node: INode, list: INode[]): string | null => {
  if (node.children === list) return node.name;
  for (const child of [...(node.children ?? []), ...(node.out ? [node.out] : [])]) {
    const found = findParentKind(child, list);
    if (found) return found;
  }
  return null;
};

const buildScheme = (store: HeadlessWorkflowStore, documentId: string): { scheme: Scheme } | { error: string } => {
  try {
    return { scheme: store.getScheme(documentId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

const measureDocument = (
  store: HeadlessWorkflowStore,
  doc: WorkflowDocument,
  stats: IStats,
  opsPerDocument: number,
): void => {
  const built = buildScheme(store, doc.id);
  if ('error' in built) {
    stats.skipped += 1;
    bump(stats.skipReasons, `scheme build: ${built.error.slice(0, 60)}`);
    return;
  }
  const { scheme } = built;
  const stack = scheme.infra.structure;
  const before = readSchemeTree(scheme);
  if (!before) return;
  try {
    stack.parseDocument({ id: doc.id, name: doc.name, root: before, type: doc.type });
  } catch {
    // A stored tree the stack's own validator rejects (an agent left it broken) — nothing to round-trip.
    stats.skipped += 1;
    bump(stats.skipReasons, 'stored tree is invalid');
    return;
  }
  stats.documents += 1;
  stats.nodes += countNodes(before);
  const text = renderDocumentJson(before, stack);
  stats.bytes += text.length;
  const write = (content: string): TPrepareDocumentWriteResult => {
    const current = readSchemeTree(scheme);
    const prepared = prepareDocumentWrite({
      documentId: doc.id,
      documentName: doc.name,
      documentType: doc.type,
      oldRoot: current,
      stack,
      text: content,
    });
    if (prepared.ok) applyTreeToScheme(scheme, prepared.root);
    return prepared;
  };

  const roundTrip = write(text);
  const after = readSchemeTree(scheme);
  const unchanged =
    roundTrip.ok &&
    roundTrip.changes.added + roundTrip.changes.removed + roundTrip.changes.modified === 0 &&
    canonical(after) === canonical(before);
  if (unchanged) stats.roundTripIdentical += 1;
  else
    stats.roundTripFailures.push(
      roundTrip.ok ? `tree changed: ${firstDifference(before, after, '')}` : roundTrip.error.slice(0, 160),
    );

  const hasListChildren = (kind: string): boolean => {
    const policy = stack.configsMap.get(kind)?.children;
    return policy === true || Array.isArray(policy);
  };
  const statementsOf = (): { tree: INode; refs: IStatementRef[] } => {
    const tree = JSON.parse(renderDocumentJson(readSchemeTree(scheme) as INode, stack)) as INode;
    const refs: IStatementRef[] = [];
    collectStatements(tree, { hasListChildren }, refs);
    return { refs, tree };
  };
  const total = statementsOf().refs.length;
  const picks = [
    ...new Set(
      Array.from({ length: Math.min(opsPerDocument, total) }, (_v, i) =>
        Math.floor((i * total) / Math.max(1, Math.min(opsPerDocument, total))),
      ),
    ),
  ];

  for (const pick of picks) {
    // 1. change one node's string data
    {
      const { refs, tree } = statementsOf();
      const target = refs[pick]?.list[refs[pick].index];
      if (typeof target?.data === 'string') {
        (target as { data: unknown }).data = `${target.data} `;
        const result = write(JSON.stringify(tree, null, 2));
        const ok =
          result.ok && result.changes.modified === 1 && result.changes.added === 0 && result.changes.removed === 0;
        stats.ops.push({
          kind: 'edit-data',
          ok,
          reason: opReason(ok, result),
        });
        if (result.ok) {
          const { refs: refs2, tree: tree2 } = statementsOf();
          const again = refs2[pick].list[refs2[pick].index] as { data: unknown };
          again.data = String(again.data).replace(/ $/, '');
          write(JSON.stringify(tree2, null, 2));
        }
      }
    }
    // 2. insert a new action right after it
    {
      const { refs, tree } = statementsOf();
      const ref = refs[pick];
      if (ref && stack.configsMap.has('action')) {
        const allowed = stack.configsMap.get(ref.list.length > 0 ? (findParentKind(tree, ref.list) ?? '') : '');
        if (allowed?.children === true) {
          ref.list.splice(ref.index + 1, 0, { data: 'x = 1', name: 'action' } as INode);
          const result = write(JSON.stringify(tree, null, 2));
          const ok =
            result.ok && result.changes.added === 1 && result.changes.removed === 0 && result.changes.modified === 0;
          stats.ops.push({
            kind: 'insert',
            ok,
            reason: opReason(ok, result),
          });
        }
      }
    }
    // 3. delete one statement (and its subtree) — skipped when that would make an out the first child
    {
      const { refs, tree } = statementsOf();
      const ref = refs[pick];
      if (ref && (ref.index > 0 || !ref.list[1]?.out)) {
        const [removed] = ref.list.splice(ref.index, 1);
        const size = nodeIds(removed).length;
        const result = write(JSON.stringify(tree, null, 2));
        const ok = result.ok && result.changes.removed === size && result.changes.added === 0;
        stats.ops.push({
          kind: 'delete',
          ok,
          reason: opReason(ok, result),
        });
      }
    }
  }
};

const pct = (part: number, whole: number): string => (whole === 0 ? '—' : `${((part * 100) / whole).toFixed(1)} %`);

const report = (stats: IStats): void => {
  print(
    `projects: ${stats.projects}, documents: ${stats.documents}, nodes: ${stats.nodes}, skipped documents: ${stats.skipped}`,
  );
  for (const [reason, count] of stats.skipReasons) print(`  skipped ×${count}: ${reason}`);
  print(`file size: ${stats.bytes} chars total, ${(stats.bytes / Math.max(1, stats.nodes)).toFixed(0)} chars per node`);
  print(
    `round trip identical: ${stats.roundTripIdentical}/${stats.documents} (${pct(stats.roundTripIdentical, stats.documents)})`,
  );
  const failures = new Map<string, number>();
  for (const failure of stats.roundTripFailures) bump(failures, failure);
  for (const [failure, count] of failures) print(`  round trip ×${count}: ${failure}`);
  for (const kind of ['edit-data', 'insert', 'delete']) {
    const ops = stats.ops.filter((op) => op.kind === kind);
    const passed = ops.filter((op) => op.ok).length;
    print(`${kind}: ${passed}/${ops.length} touched exactly the expected ids (${pct(passed, ops.length)})`);
    const reasons = new Map<string, number>();
    for (const op of ops.filter((candidate) => !candidate.ok)) bump(reasons, op.reason || '?');
    for (const [reason, count] of [...reasons].slice(0, 5)) print(`  ×${count}: ${reason}`);
  }
};

const main = (): void => {
  const args = process.argv.slice(2);
  const opsIndex = args.indexOf('--ops');
  const opsPerDocument = opsIndex === -1 ? 5 : Number(args[opsIndex + 1]);
  const paths = args.filter((arg, i) => arg !== '--ops' && (opsIndex === -1 || i !== opsIndex + 1));
  const stats: IStats = {
    bytes: 0,
    documents: 0,
    nodes: 0,
    ops: [],
    projects: 0,
    roundTripFailures: [],
    roundTripIdentical: 0,
    skipReasons: new Map(),
    skipped: 0,
  };

  for (const file of paths.flatMap((path) => listFiles(path))) {
    const payload = readPayload(file);
    if (!Array.isArray(payload.documents)) continue;
    stats.projects += 1;
    const store = new HeadlessWorkflowStore();
    try {
      store.documents.length = 0;
      for (const doc of payload.documents) {
        const raw = doc as WorkflowDocument & { root?: INode };
        store.documents.push({
          ...(raw.pinned ? { customData: raw.data, pinned: true } : { data: raw.root ?? raw.data }),
          folderId: null,
          id: raw.id,
          name: raw.name,
          type: raw.type,
        } as WorkflowDocument);
      }
      for (const doc of store.documents.filter((candidate) => TREE_TYPES.has(candidate.type) && !candidate.pinned)) {
        measureDocument(store, doc, stats, opsPerDocument);
      }
    } finally {
      store.dispose();
    }
  }
  report(stats);
};

main();
