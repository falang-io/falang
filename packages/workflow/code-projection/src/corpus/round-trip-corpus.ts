// oxlint-disable no-undefined, init-declarations, complexity, max-lines, max-depth, no-nested-ternary, no-console, consistent-function-scoping, no-array-callback-reference -- spike measurement code (ADR 0061 (private))
import {
  canonicalize,
  canonicalKey,
  collectIds,
  createSourceFile,
  ProjectionError,
  syntaxDiagnostics,
  UnsupportedNodeError,
} from '@falang/code-projection';
import type { INode } from '@falang/dto';
import { WorkflowProjection } from '../workflow-projection.js';
import type { IWorkflowProjectDocument, IWorkflowProjectInput } from '../workflow-model.js';

/**
 * G1/G2 of ADR 0061's spike, measured over a corpus of real projects: every function/trigger document is projected,
 * written back unchanged (G1: same structure/data/outs; G2: same ids), then edited one statement at a time
 * (change / insert / delete) — G2 holds when only the touched node's id changes.
 */

export interface ICorpusProject {
  readonly label: string;
  readonly input: IWorkflowProjectInput;
}

export interface IEditTally {
  total: number;
  ok: number;
}

export interface ICorpusFailure {
  readonly project: string;
  readonly document: string;
  readonly stage: string;
  readonly message: string;
}

export interface ICorpusReport {
  projects: number;
  documents: number;
  nodes: number;
  supportedDocuments: number;
  supportedNodes: number;
  /** Supported documents whose node data is not valid TypeScript (they fail the real compiler too). */
  invalidSource: number;
  /** Documents that can't be projected, by the first unsupported node kind met. */
  unsupported: Record<string, number>;
  /** G1: the parsed tree has the same canonical form (structure, data, outs as last statements, branch semantics). */
  canonicalEqual: number;
  /** G1 + G2 strict: after matching against the original, the tree is identical — ids, data text, meta, out placement. */
  exactEqual: number;
  /** G2: unchanged file → every original id kept. */
  idsKeptDocuments: number;
  idsKept: number;
  idsTotal: number;
  edits: { change: IEditTally; insert: IEditTally; delete: IEditTally };
  failures: ICorpusFailure[];
  /** Which differences make a document canonical-equal but not exact. */
  inexactReasons: Record<string, number>;
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).toSorted(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

const countNodes = (node: INode | null | undefined): number =>
  node
    ? 1 +
      (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0) +
      (node.out ? countNodes(node.out) : 0) +
      (node.mods ?? []).reduce((sum, mod) => sum + countNodes(mod), 0)
    : 0;

const fileOf = (doc: IWorkflowProjectDocument): string =>
  doc.type === 'function' ? `functions/${doc.name}.ts` : `triggers/${doc.name}.ts`;

interface IStatementRef {
  readonly node: INode;
  /** The parent's children array and index, or `null` for an `out`. */
  readonly list: INode[] | null;
  readonly index: number;
  readonly owner: INode;
}

const STATEMENT_LIST_PARENTS = new Set(['function-body', 'trigger-function-body']);

/** Statement positions: children of bodies, branches, loops, options (every `children: true` list) and outs. */
const statements = (root: INode, isList: (name: string) => boolean): IStatementRef[] => {
  const refs: IStatementRef[] = [];
  const walk = (node: INode): void => {
    if (node.children && (isList(node.name) || STATEMENT_LIST_PARENTS.has(node.name))) {
      node.children.forEach((child, index) =>
        refs.push({ index, list: node.children as INode[], node: child, owner: node }),
      );
    }
    if (node.out) refs.push({ index: -1, list: null, node: node.out, owner: node });
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return refs;
};

const EXPRESSION_KEYS = ['value', 'arr', 'chatId', 'from', 'to', 'start', 'insertArr', 'end'];
const TEXT_KEYS = ['text', 'question', 'prompt', 'message'];

/** Edits one statement's data in place; false when the kind has nothing sensible to edit. */
const changeData = (readonlyNode: INode): boolean => {
  const node = readonlyNode as { -readonly [K in keyof INode]: INode[K] };
  if (typeof node.data === 'string') {
    // Raw code that isn't an expression (a declaration, a trailing comment) can't be wrapped; editing it is covered by text edits.
    if (node.name === 'action' && (/^\s*(const|let|var)\b/.test(node.data) || node.data.includes('//'))) return false;
    if (node.name === 'log' || node.name === 'comment') node.data = `${node.data} edited`;
    else node.data = node.data.trim() === '' ? '0' : `((${node.data.trim().replace(/;$/, '')}) ?? 0)`;
    return true;
  }
  const data = node.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return false;
  if (node.name === 'call-function' && Array.isArray(data.parameters) && data.parameters.length > 0) {
    node.data = { ...data, parameters: [`((${String(data.parameters[0])}) ?? 0)`, ...data.parameters.slice(1)] };
    return true;
  }
  for (const key of TEXT_KEYS) {
    if (typeof data[key] === 'string' && data[key] !== '') {
      node.data = { ...data, [key]: `${String(data[key])} edited` };
      return true;
    }
  }
  for (const key of EXPRESSION_KEYS) {
    if (typeof data[key] === 'string' && data[key] !== '') {
      node.data = { ...data, [key]: `((${String(data[key])}) ?? 0)` };
      return true;
    }
  }
  return false;
};

const findRef = (root: INode, id: string, isList: (name: string) => boolean): IStatementRef | undefined =>
  statements(root, isList).find((ref) => ref.node.id === id);

const describe = (error: unknown): string =>
  error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);

export interface IRunCorpusOptions {
  /** Max statements edited per document (sampled evenly). */
  readonly maxEditsPerDocument?: number;
  readonly edits?: boolean;
}

export const emptyReport = (): ICorpusReport => ({
  canonicalEqual: 0,
  documents: 0,
  edits: { change: { ok: 0, total: 0 }, delete: { ok: 0, total: 0 }, insert: { ok: 0, total: 0 } },
  exactEqual: 0,
  failures: [],
  idsKept: 0,
  idsKeptDocuments: 0,
  invalidSource: 0,
  idsTotal: 0,
  inexactReasons: {},
  nodes: 0,
  projects: 0,
  supportedDocuments: 0,
  supportedNodes: 0,
  unsupported: {},
});

/** What the editor's own serializer (`getNodeStoreDto`) drops: empty `data`, empty `children`. */
const serialized = (node: INode): INode => {
  const { data, children, out, mods, ...rest } = node;
  return {
    ...rest,
    ...(data === undefined || data === '' ? {} : { data }),
    ...(children && children.length > 0 ? { children: children.map(serialized) } : {}),
    ...(out ? { out: serialized(out) } : {}),
    ...(mods && mods.length > 0 ? { mods: mods.map(serialized) } : {}),
  } as INode;
};

const inexactReason = (originalRaw: INode, resultRaw: INode): string => {
  const original = serialized(originalRaw);
  const result = serialized(resultRaw);
  const a = stable(original);
  const b = stable(result);
  if (a === b) return 'none';
  const strip = (node: INode): unknown => ({
    ...node,
    meta: undefined,
    children: node.children?.map(strip),
    out: node.out && strip(node.out),
  });
  if (stable(strip(original)) === stable(strip(result))) return 'meta';
  const ids = (node: INode): string => [...collectIds(node)].toSorted().join(',');
  if (ids(original) !== ids(result)) return 'ids';
  const shape = (node: INode): unknown => ({
    n: node.name,
    c: node.children?.map(shape),
    o: node.out && shape(node.out),
  });
  const firstChildOut = (node: INode): boolean =>
    Boolean(node.children?.[0]?.out) || (node.children ?? []).some((child) => firstChildOut(child));
  if (stable(shape(original)) !== stable(shape(result))) {
    return firstChildOut(original)
      ? 'stored tree breaks the first-child-out rule (ADR 0035) — normalised'
      : 'structure (out vs last statement, branch order)';
  }
  return 'data text';
};

export const runCorpus = (projects: readonly ICorpusProject[], options: IRunCorpusOptions = {}): ICorpusReport => {
  const report = emptyReport();
  const maxEdits = options.maxEditsPerDocument ?? 25;
  for (const project of projects) {
    report.projects += 1;
    let projection: WorkflowProjection;
    try {
      projection = new WorkflowProjection(project.input);
    } catch (error) {
      report.failures.push({ document: '-', message: describe(error), project: project.label, stage: 'model' });
      continue;
    }
    const isList = (name: string): boolean => projection.model.stack.configsMap.get(name)?.children === true;
    for (const doc of project.input.documents) {
      if (doc.type !== 'function' && doc.type !== 'trigger-function') continue;
      if (!doc.root) continue;
      const original = doc.root;
      const size = countNodes(original);
      report.documents += 1;
      report.nodes += size;
      const path = fileOf(doc);
      let text: string;
      try {
        text = projection.projectDocument(doc);
      } catch (error) {
        if (error instanceof UnsupportedNodeError) {
          report.unsupported[error.nodeName] = (report.unsupported[error.nodeName] ?? 0) + 1;
        } else {
          report.failures.push({
            document: doc.name,
            message: describe(error),
            project: project.label,
            stage: 'project',
          });
        }
        continue;
      }
      report.supportedDocuments += 1;
      report.supportedNodes += size;
      let result: INode;
      const syntax = syntaxDiagnostics(createSourceFile(path, text), path);
      if (syntax.length > 0) {
        // The tree already holds code that isn't TypeScript (it doesn't compile today either).
        report.invalidSource += 1;
        report.failures.push({
          document: doc.name,
          message: syntax[0]?.message ?? '',
          project: project.label,
          stage: 'invalid code in node data',
        });
        continue;
      }
      try {
        result = projection.writeFile(path, text, { oldRoot: original, typeCheck: false }).root;
      } catch (error) {
        const message = error instanceof ProjectionError ? error.message : describe(error);
        report.failures.push({ document: doc.name, message, project: project.label, stage: 'parse' });
        continue;
      }
      if (canonicalKey(result) === canonicalKey(original)) report.canonicalEqual += 1;
      else {
        const withoutOptions = (node: INode): string =>
          JSON.stringify(canonicalize(node), (key, value: unknown) => (key === 'options' ? undefined : value));
        const reason =
          (original.children ?? []).length === 0
            ? 'stored document root has no children (never opened in the editor)'
            : withoutOptions(result) === withoutOptions(original)
              ? 'question data.options out of sync with its branches in the stored tree'
              : 'canonical form differs';
        report.failures.push({ document: doc.name, message: reason, project: project.label, stage: 'G1' });
      }
      const reason = inexactReason(original, result);
      if (reason === 'none') report.exactEqual += 1;
      else report.inexactReasons[reason] = (report.inexactReasons[reason] ?? 0) + 1;
      const before = collectIds(original);
      const after = collectIds(result);
      const kept = [...before].filter((id) => after.has(id)).length;
      report.idsKept += kept;
      report.idsTotal += before.size;
      if (kept === before.size && after.size === before.size) report.idsKeptDocuments += 1;

      if (options.edits === false) continue;
      const refs = statements(original, isList);
      const step = Math.max(1, Math.ceil(refs.length / maxEdits));
      for (let i = 0; i < refs.length; i += step) {
        const target = refs[i] as IStatementRef;
        for (const kind of ['change', 'insert', 'delete'] as const) {
          if (kind === 'insert' && target.list === null) continue;
          const mutated = structuredClone(original);
          const ref = findRef(mutated, target.node.id, isList);
          if (!ref) continue;
          if (kind === 'change' && !changeData(ref.node)) continue;
          if (kind === 'insert')
            ref.list?.splice(ref.index + 1, 0, { data: '__inserted = 1', id: '__new__', name: 'action' });
          if (kind === 'delete') {
            if (ref.list) ref.list.splice(ref.index, 1);
            else delete (ref.owner as { out?: INode }).out;
          }
          report.edits[kind].total += 1;
          try {
            const editedText = projection.projectDocument({ ...doc, root: mutated });
            const written = projection.writeFile(path, editedText, { oldRoot: original, typeCheck: false }).root;
            const ids = collectIds(written);
            const lost = [...before].filter((id) => !ids.has(id));
            const gained = [...ids].filter((id) => !before.has(id));
            const subtree = collectIds(target.node);
            const ok =
              kind === 'change'
                ? lost.every((id) => id === target.node.id) && gained.length <= 1
                : kind === 'insert'
                  ? lost.length === 0 && gained.length === 1
                  : lost.every((id) => subtree.has(id)) && lost.length === subtree.size && gained.length === 0;
            if (ok) report.edits[kind].ok += 1;
            else {
              report.failures.push({
                document: doc.name,
                message: `${kind} ${target.node.name} (${target.node.id}): lost ${lost.length} [${lost.slice(0, 3).join(',')}], gained ${gained.length}`,
                project: project.label,
                stage: 'G2',
              });
            }
          } catch (error) {
            report.failures.push({
              document: doc.name,
              message: `${kind} ${target.node.name}: ${describe(error)}`,
              project: project.label,
              stage: 'G2-error',
            });
          }
        }
      }
    }
  }
  return report;
};

const pct = (part: number, whole: number): string => (whole === 0 ? '—' : `${((100 * part) / whole).toFixed(1)}%`);

export const formatReport = (report: ICorpusReport): string => {
  const lines = [
    `projects ${report.projects}, function/trigger documents ${report.documents} (${report.nodes} nodes)`,
    `supported documents ${report.supportedDocuments}/${report.documents} (${report.supportedNodes} nodes); unsupported by kind: ${JSON.stringify(report.unsupported)}`,
    `documents whose node data is not valid TypeScript (excluded below): ${report.invalidSource}`,
    `G1 canonical equal: ${report.canonicalEqual}/${report.supportedDocuments} (${pct(report.canonicalEqual, report.supportedDocuments)})`,
    `G1 exact (ids, data text, meta, out placement): ${report.exactEqual}/${report.supportedDocuments}; not exact because: ${JSON.stringify(report.inexactReasons)}`,
    `G2 unchanged file: ids kept ${report.idsKept}/${report.idsTotal} (${pct(report.idsKept, report.idsTotal)}), documents with every id kept ${report.idsKeptDocuments}/${report.supportedDocuments}`,
    ...(['change', 'insert', 'delete'] as const).map(
      (kind) =>
        `G2 single ${kind}: ${report.edits[kind].ok}/${report.edits[kind].total} (${pct(report.edits[kind].ok, report.edits[kind].total)})`,
    ),
    `failures: ${report.failures.length}`,
  ];
  return lines.join('\n');
};
