import { resolveService } from '@falang/di';
import { toJS } from 'mobx';
import type { Scheme } from '../../scheme/scheme.js';
import { TOKEN_HISTORY } from './history.store.token.js';
import {
  EVENT_DATA_UPDATED,
  EVENT_META_UPDATED,
  EVENT_NODE_DELETED,
  EVENT_NODE_INSERTED,
  EVENT_NODES_MOVED,
  type TNodeSlot,
} from '../../scheme/scheme-events.js';
import { insertNode } from '../../actions/insert-node.js';
import { deleteNode } from '../../actions/delete-node.js';
import logger from '../../utils/logger.js';
import { getDto } from '../../utils/get-dto.js';
import { moveNodes } from '../../actions/move-nodes.js';
import { setData } from '../../actions/set-data.js';
import { setMeta } from '../../actions/set-meta.js';

/**
 * Items hold only ids and plain DTO/value snapshots and act on the scheme the store is attached to when they run
 * (`HistoryStore.replay`), so the store can outlive the scheme it recorded on (see `HistoryModule`'s `store` option).
 */
export const registerHistoryHandlers = (scheme: Scheme) => {
  const history = () => resolveService(TOKEN_HISTORY, scheme.container);

  scheme.events.subscribeEvent(EVENT_NODE_DELETED, ({ index, node, parentId, slot }) => {
    if (history().isReplaying) return false;
    const store = history();
    store.add({
      back: () => store.replay((target) => insertNode({ index, parentId, node, slot }, target)),
      forward: () => store.replay((target) => deleteNode({ id: node.id }, target)),
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_NODE_INSERTED, ({ node }) => {
    if (history().isReplaying) return false;
    const parent = node.parent;
    if (!parent) {
      logger.warn(`Parent node not found for ${node.id}`);
      return false;
    }
    let slot: TNodeSlot = 'children';
    let index = parent.children.findIndex((n) => n.id === node.id);
    if (index === -1) {
      slot = 'mods';
      index = parent.mods.findIndex((n) => n.id === node.id);
    }
    if (index === -1) {
      logger.warn(`Not found index for ${node.id} in parent ${parent.id}`);
      return false;
    }
    const nodeDto = getDto(node.id, scheme);
    const nodeId = node.id;
    const parentId = parent.id;
    const store = history();
    store.add({
      forward: () => store.replay((target) => insertNode({ index, node: nodeDto, parentId, slot }, target)),
      back: () => store.replay((target) => deleteNode({ id: nodeId }, target)),
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_NODES_MOVED, (params) => {
    if (history().isReplaying) return false;
    const { indexStart, insertIndex, length, newParentId, oldParentId } = params;
    const isSameParent = oldParentId === newParentId;
    const isMoveForwardSameNode = isSameParent && insertIndex > indexStart;
    const backInsertIndex = isSameParent && !isMoveForwardSameNode ? indexStart + length : indexStart;
    let backIndexStart = insertIndex;
    if (isSameParent && isMoveForwardSameNode) {
      backIndexStart = insertIndex - length;
    }
    const store = history();
    store.add({
      forward: () => store.replay((target) => moveNodes(params, target)),
      back: () =>
        store.replay((target) =>
          moveNodes(
            {
              indexStart: backIndexStart,
              insertIndex: backInsertIndex,
              length,
              newParentId: oldParentId,
              oldParentId: newParentId,
            },
            target,
          ),
        ),
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_DATA_UPDATED, ({ node, oldData }) => {
    if (history().isReplaying) return false;
    // Snapshots: the live node data belongs to this scheme's stores and must not leak into another scheme.
    const data = toJS(node.data);
    const previous = toJS(oldData);
    const id = node.id;
    const store = history();
    store.add({
      forward: () => store.replay((target) => setData({ id, data }, target)),
      back: () => store.replay((target) => setData({ id, data: previous }, target)),
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_META_UPDATED, ({ node, oldMeta }) => {
    if (history().isReplaying) return false;
    const meta = toJS(node.meta);
    const previous = toJS(oldMeta);
    const id = node.id;
    const store = history();
    store.add({
      forward: () => store.replay((target) => setMeta({ id, meta }, target)),
      back: () => store.replay((target) => setMeta({ id, meta: previous }, target)),
    });
    return false;
  });
};
