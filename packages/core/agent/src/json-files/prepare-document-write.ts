import type { INode, INodeMeta, NodesStack } from '@falang/dto';
import { zod } from '@falang/dto';
import { preserveMeta } from '@falang/mcp-core';
import {
  createNodeId,
  indexNodesById,
  isRecord,
  normalizeStructure,
  type IStructureContext,
} from './normalize-structure.js';
import { applyMetaOverlay, orientIfs, stripTemplateBackticks, takeVisibleMeta, walkRaw } from './normalize-values.js';
import { describeTreeChanges, type ITreeChanges } from './tree-changes.js';
import { describeJsonError, formatValidationError } from './write-errors.js';

export { createNodeId } from './normalize-structure.js';

export interface IPrepareDocumentWriteParams {
  /** The file text the agent wrote (after `edit_file` substitution, if any). */
  readonly text: string;
  /** The document's current stored tree; `null` for a document that has no tree yet. */
  readonly oldRoot: INode | null;
  readonly documentId: string;
  readonly documentName: string;
  readonly documentType: string;
  readonly stack: NodesStack;
  /** Only used to word "allowed: …" lists; validation always uses the full stack. */
  readonly isListed?: (kind: string) => boolean;
  /** Fresh node ids for nodes written without one (or with an id the old tree didn't have). */
  readonly createId?: () => string;
}

export type TPrepareDocumentWriteResult =
  | { readonly ok: true; readonly root: INode; readonly changes: ITreeChanges; readonly newIds: number }
  | { readonly ok: false; readonly error: string };

const parseJson = (text: string): { raw: unknown } | { error: string } => {
  try {
    return { raw: JSON.parse(text) as unknown };
  } catch (error) {
    return { error: describeJsonError(text, error) };
  }
};

/** Step 4: `NodesStack.parseDocument` — every structural rule the stack enforces, incl. first-child-`out`. */
const validateTree = (params: IPrepareDocumentWriteParams, rawRoot: unknown): { root: INode } | { error: string } => {
  try {
    const parsed = params.stack.parseDocument({
      id: params.documentId,
      name: params.documentName,
      root: rawRoot,
      type: params.documentType,
    });
    return parsed.root ? { root: parsed.root } : { error: 'root: the document has no root node.' };
  } catch (error) {
    if (error instanceof zod.ZodError) return { error: formatValidationError(rawRoot, error) };
    throw error;
  }
};

/**
 * ADR 0062 §2.2: file text → a validated tree ready to apply. Parse → ids/structure → normalisations (template
 * backticks, `if` orientation, hidden meta) → `NodesStack.parseDocument` (every structural rule incl. first-child-`out`)
 * → `preserveMeta` (layout back by id) → the `if` sides on top. Pure; nothing is written on any error.
 */
export const prepareDocumentWrite = (params: IPrepareDocumentWriteParams): TPrepareDocumentWriteResult => {
  const { oldRoot, stack, text } = params;
  const parsedText = parseJson(text);
  if ('error' in parsedText) return { error: parsedText.error, ok: false };
  const { raw } = parsedText;
  if (!isRecord(raw)) return { error: "The file must contain one JSON object — the document's root node.", ok: false };
  const rootKind = oldRoot?.name;
  if (rootKind && raw.name !== rootKind) {
    return {
      error: `root: this document's root must stay a "${rootKind}" node (got "${String(raw.name)}").`,
      ok: false,
    };
  }

  const oldById = new Map<string, INode>();
  indexNodesById(oldRoot, oldById);
  const ctx: IStructureContext = {
    createId: params.createId ?? createNodeId,
    isListed: params.isListed ?? (() => true),
    newIds: 0,
    oldById,
    stack,
    usedIds: new Map(),
  };
  const structureError = normalizeStructure(raw, 'root', oldRoot, false, ctx);
  if (structureError) return { error: structureError, ok: false };
  const rawRoot = raw;
  const overlay = new Map<string, INodeMeta>();
  walkRaw(rawRoot, (node) => {
    stripTemplateBackticks(node, stack);
    takeVisibleMeta(node, overlay);
  });
  const sides = new Map<string, boolean>();
  orientIfs(rawRoot, oldById, sides);
  for (const [id, trueOnRight] of sides) overlay.set(id, { ...overlay.get(id), trueOnRight });

  const validated = validateTree(params, rawRoot);
  if ('error' in validated) return { error: validated.error, ok: false };
  const parsedRoot = validated.root;

  const withMeta = oldRoot ? preserveMeta(oldRoot, parsedRoot) : parsedRoot;
  const root = applyMetaOverlay(withMeta, overlay);
  return { changes: describeTreeChanges(oldRoot, root), newIds: ctx.newIds, ok: true, root };
};
