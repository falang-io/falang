// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { INode, INodeMeta, NodesStack } from '@falang/dto';
import { canonicalKey, dataEquals, normalizeData } from './normalize.js';
import { JUMP_KINDS, withOut } from './projector.js';

/** Meta keys whose value is part of the code (the parser derives them); every other meta key is layout, kept from the old node. */
const SEMANTIC_META = ['trueOnRight', 'trueIsMain', 'outLevel'] as const;

const mergeMeta = (oldMeta: INodeMeta | undefined, newMeta: INodeMeta | undefined): INodeMeta | undefined => {
  const merged: Record<string, unknown> = { ...oldMeta };
  for (const key of SEMANTIC_META) delete merged[key];
  for (const key of SEMANTIC_META) {
    const value = (newMeta as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined) merged[key] = value;
  }
  return Object.keys(merged).length > 0 ? (merged as INodeMeta) : undefined;
};

const tokens = (value: unknown): Set<string> =>
  new Set(JSON.stringify(normalizeData(value) ?? '').match(/[A-Za-z_$][\w$]*|\d+|[^\s\w]/g) ?? []);

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 1;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / (a.size + b.size - common);
};

const SIMILARITY_THRESHOLD = 0.34;

export interface IMatchStats {
  /** New nodes that got an old node's id. */
  kept: number;
  /** New nodes with no counterpart (fresh ids). */
  fresh: number;
}

/**
 * Pairs the nodes of a freshly parsed tree (all ids new) with the document's current tree, so unchanged and edited
 * statements keep their ids and layout meta. Per parent: fixed slots pair by position; statement lists are aligned
 * with a weighted LCS — identical subtree (4) > same data (3) > same kind with similar data (1..2) — so one edit,
 * insert or delete changes only the node it touches.
 */
export class TreeMatcher {
  readonly stats: IMatchStats = { fresh: 0, kept: 0 };
  private readonly stack: NodesStack;
  private readonly keys = new WeakMap<INode, string>();

  constructor(stack: NodesStack) {
    this.stack = stack;
  }

  private key(node: INode): string {
    let key = this.keys.get(node);
    if (key === undefined) {
      key = canonicalKey(node);
      this.keys.set(node, key);
    }
    return key;
  }

  private score(oldNode: INode, newNode: INode): number {
    if (oldNode.name !== newNode.name) return 0;
    if (this.key(oldNode) === this.key(newNode)) return 4;
    if (dataEquals(oldNode.data, newNode.data) && oldNode.data !== undefined) return 3;
    const dataSimilarity = jaccard(tokens(oldNode.data), tokens(newNode.data));
    const oldChildren = new Set(withOut(oldNode).map((child) => this.key(child)));
    const newChildren = withOut(newNode).map((child) => this.key(child));
    const childSimilarity =
      oldChildren.size + newChildren.length === 0
        ? 0
        : newChildren.filter((key) => oldChildren.has(key)).length / Math.max(oldChildren.size, newChildren.length);
    const similarity = Math.max(oldNode.data === undefined ? 0 : dataSimilarity, childSimilarity);
    if (oldNode.data === undefined && newNode.data === undefined && oldChildren.size + newChildren.length === 0)
      return 3;
    return similarity >= SIMILARITY_THRESHOLD ? 1 + similarity : 0;
  }

  /** Weighted LCS over two statement sequences → index pairs. */
  private align(oldList: readonly INode[], newList: readonly INode[]): [number, number][] {
    const rows = oldList.length;
    const cols = newList.length;
    const table: number[][] = Array.from({ length: rows + 1 }, () => Array.from({ length: cols + 1 }, () => 0));
    const scores: number[][] = Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (__, j) => this.score(oldList[i] as INode, newList[j] as INode)),
    );
    for (let i = 1; i <= rows; i += 1) {
      for (let j = 1; j <= cols; j += 1) {
        const pair = scores[i - 1]?.[j - 1] ?? 0;
        const row = table[i] as number[];
        row[j] = Math.max(
          (table[i - 1] as number[])[j] ?? 0,
          row[j - 1] ?? 0,
          pair > 0 ? ((table[i - 1] as number[])[j - 1] ?? 0) + pair : 0,
        );
      }
    }
    const pairs: [number, number][] = [];
    let i = rows;
    let j = cols;
    while (i > 0 && j > 0) {
      const pair = scores[i - 1]?.[j - 1] ?? 0;
      const current = (table[i] as number[])[j] ?? 0;
      if (pair > 0 && current === ((table[i - 1] as number[])[j - 1] ?? 0) + pair) {
        pairs.push([i - 1, j - 1]);
        i -= 1;
        j -= 1;
      } else if (current === ((table[i - 1] as number[])[j] ?? 0)) {
        i -= 1;
      } else {
        j -= 1;
      }
    }
    return pairs.toReversed();
  }

  private fresh(node: INode): INode {
    this.stats.fresh += 1;
    return {
      ...node,
      ...(node.children ? { children: node.children.map((child) => this.fresh(child)) } : {}),
      ...(node.out ? { out: this.fresh(node.out) } : {}),
      ...(node.mods ? { mods: node.mods.map((mod) => this.fresh(mod)) } : {}),
    };
  }

  /** `newNode` takes `oldNode`'s id and layout; their children are matched recursively. */
  match(oldNode: INode, newNode: INode): INode {
    this.stats.kept += 1;
    let current = restoreLayout(oldNode, newNode, this.stack);
    const config = this.stack.configsMap.get(current.name);
    let children: INode[] | undefined;
    let out: INode | undefined;
    if (current.children && (config?.childTuple || current.name === 'if')) {
      children = current.children.map((child, index) => {
        const counterpart = oldNode.children?.[index];
        return counterpart && counterpart.name === child.name ? this.match(counterpart, child) : this.fresh(child);
      });
      out = current.out ? this.matchOut(oldNode, current.out) : undefined;
    } else if (current.children || current.out) {
      const oldSequence = withOut(oldNode);
      const newSequence = withOut(current);
      const pairs = new Map(this.align(oldSequence, newSequence).map(([o, n]) => [n, o]));
      const mapped = newSequence.map((node, index) => {
        const counterpart = pairs.get(index);
        return counterpart === undefined ? this.fresh(node) : this.match(oldSequence[counterpart] as INode, node);
      });
      if (current.out) {
        out = mapped.pop();
        children = mapped;
      } else {
        children = mapped;
      }
      if (!current.children) children = undefined;
    }
    current = {
      ...current,
      id: oldNode.id,
      ...(children ? { children } : {}),
      ...(out ? { out } : {}),
    };
    const meta = mergeMeta(oldNode.meta, current.meta);
    const { meta: _dropped, ...withoutMeta } = current;
    const data = dataEquals(oldNode.data, current.data) ? oldNode.data : current.data;
    return {
      ...withoutMeta,
      ...(data === undefined ? {} : { data }),
      ...(meta ? { meta } : {}),
      ...(oldNode.mods && !current.mods ? { mods: oldNode.mods } : {}),
    };
  }

  private matchOut(oldNode: INode, out: INode): INode {
    const counterpart = withOut(oldNode).at(-1);
    return counterpart && counterpart.name === out.name ? this.match(counterpart, out) : this.fresh(out);
  }
}

/** Branch swap of an `if`, keeping the trailing-jump rule: slot 0 never has an `out`, slot 1 may. */
const flipIf = (node: INode, trueOnRight: boolean, stack: NodesStack): INode => {
  const [first, second] = (node.children ?? []).map((child) => ({
    ...child,
    children: [...withOut(child)],
    out: undefined,
  }));
  if (!first || !second) return node;
  const swapped = [second, first].map((child) => {
    const { out: _out, ...rest } = child;
    return rest as INode;
  });
  const last = swapped[1]?.children?.at(-1);
  if (last && JUMP_KINDS.has(last.name) && stack.configsMap.get('if-child')?.haveOut) {
    swapped[1] = { ...(swapped[1] as INode), children: swapped[1]?.children?.slice(0, -1) ?? [], out: last };
  }
  const meta = { ...node.meta, trueOnRight };
  if (!trueOnRight) delete (meta as Record<string, unknown>).trueOnRight;
  return { ...node, children: swapped, meta };
};

/**
 * Restores layout the code can't carry: an `if` keeps the branch orientation it had (when the new code allows it), a
 * `while` written as `while (!(x))` keeps `x` + `trueIsMain` if that is how it was stored.
 */
export const restoreLayout = (oldNode: INode, newNode: INode, stack: NodesStack): INode => {
  if (newNode.name === 'if' && oldNode.name === 'if') {
    const oldOrientation = oldNode.meta?.trueOnRight === true;
    const newOrientation = newNode.meta?.trueOnRight === true;
    // Moving a branch that ends in a jump into slot 0 is fine: the jump becomes a plain last statement there.
    if (oldOrientation !== newOrientation) return flipIf(newNode, oldOrientation, stack);
  }
  if (newNode.name === 'while' && oldNode.meta?.trueIsMain === true && typeof newNode.data === 'string') {
    const match = /^!\((.*)\)$/s.exec(newNode.data.trim());
    if (match && dataEquals(match[1], oldNode.data)) {
      return { ...newNode, data: oldNode.data, meta: { ...newNode.meta, trueIsMain: true } };
    }
  }
  return newNode;
};

/** Matches a whole document tree; the roots always pair (a document keeps its root id). */
export const matchDocumentTree = (
  oldRoot: INode,
  newRoot: INode,
  stack: NodesStack,
): { root: INode; stats: IMatchStats } => {
  const matcher = new TreeMatcher(stack);
  const root = matcher.match(oldRoot, newRoot);
  return { root, stats: matcher.stats };
};
