import { resolveService } from '@falang/di';
import { CMD_MOVE_NODES, CMD_SET_DATA, TOKEN_HISTORY, type NodeStore, type Scheme } from '@falang/scheme';
import type { IntegrationsRegistryStore } from '../registry/integrations-registry.store.js';

interface IOptionChildData {
  readonly label?: string;
  readonly fixed?: boolean;
}

type TOptionsKind = 'question' | 'choice';

const optionsKind = (registry: IntegrationsRegistryStore, node: NodeStore): TOptionsKind | null => {
  if (registry.findQuestion(node.name)) return 'question';
  if (registry.findChoice(node.name)) return 'choice';
  return null;
};

/**
 * The header data's `options` list rebuilt from the current order of the node's `<name>-option`
 * children: a question keeps bare labels (the fixed timeout option is never part of the list), a choice
 * keeps each child's whole `IChoiceOptionData`.
 */
export const buildOptionsFromChildren = (kind: TOptionsKind, children: readonly NodeStore[]): unknown[] =>
  kind === 'question'
    ? children
        .map((child) => (child.data ?? {}) as IOptionChildData)
        .filter((data) => !data.fixed)
        .map((data) => data.label ?? '')
    : children.map((child) => child.data);

const isFixed = (node: NodeStore): boolean => Boolean((node.data as IOptionChildData | null)?.fixed);

/** A fixed (timeout) option must stay at the tail — the sidebar editor syncs the children by index. */
const keepsFixedAtTail = (children: readonly NodeStore[]): boolean => {
  const firstFixed = children.findIndex((child) => isFixed(child));
  return firstFixed === -1 || children.slice(firstFixed).every((child) => isFixed(child));
};

const simulateMove = (
  scheme: Scheme,
  params: { oldParentId: string; indexStart: number; length: number; newParentId: string; insertIndex: number },
): { from: NodeStore[]; to: NodeStore[] } => {
  const from = [...scheme.nodes.getNode(params.oldParentId).children];
  const moved = from.splice(params.indexStart, params.length);
  if (params.oldParentId === params.newParentId) {
    const insertAt = params.insertIndex > params.indexStart ? params.insertIndex - params.length : params.insertIndex;
    from.splice(insertAt, 0, ...moved);
    return { from, to: from };
  }
  const to = [...scheme.nodes.getNode(params.newParentId).children];
  to.splice(params.insertIndex, 0, ...moved);
  return { from, to };
};

/**
 * Dragging a question/choice option (a `<name>-option` child) reorders the children, but the header
 * node's own `data.options` list — which the sidebar editor syncs back onto the children by index on
 * every save — kept the old order, so the next edit silently restored the old headers. A move touching
 * such a node now rewrites the affected headers' `options` from the new child order, in the same
 * `HistoryStore` group as the move (one undo step). Returns the disposer.
 */
export const registerOptionsSyncOnMove = (scheme: Scheme, registry: IntegrationsRegistryStore): (() => void) => {
  let reentrant = false;
  return scheme.commands.registerCommand(
    CMD_MOVE_NODES,
    (params) => {
      if (reentrant) return false;
      const parents = [params.oldParentId, params.newParentId]
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .flatMap((id) => {
          const node = scheme.nodes.getNodeSafe(id);
          return node ? [{ node, kind: optionsKind(registry, node) }] : [];
        })
        .filter((entry): entry is { node: NodeStore; kind: TOptionsKind } => entry.kind !== null);
      if (parents.length === 0) return false;

      const result = simulateMove(scheme, params);
      if (!keepsFixedAtTail(result.from) || !keepsFixedAtTail(result.to)) return true;

      const history = scheme.container.isRegistered(TOKEN_HISTORY, true)
        ? resolveService(TOKEN_HISTORY, scheme.container)
        : null;
      const run = () => {
        reentrant = true;
        try {
          scheme.commands.dispatchCommand(CMD_MOVE_NODES, params);
        } finally {
          reentrant = false;
        }
        for (const { node, kind } of parents) {
          const data = (node.data ?? {}) as Record<string, unknown>;
          const options = buildOptionsFromChildren(kind, node.children);
          if (JSON.stringify(data.options) === JSON.stringify(options)) continue;
          scheme.commands.dispatchCommand(CMD_SET_DATA, { id: node.id, data: { ...data, options } });
        }
      };
      if (history) history.runGrouped(run);
      else run();
      return true;
    },
    4,
  );
};
