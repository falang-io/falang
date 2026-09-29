import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import { TOKEN_HISTORY } from './history.store.token.js';
import {
  EVENT_DATA_UPDATED,
  EVENT_META_UPDATED,
  EVENT_NODE_DELETED,
  EVENT_NODE_INSERTED,
  EVENT_NODES_MOVED,
} from '../../scheme/scheme-events.js';
import { insertNode } from '../../actions/insert-node.js';
import { deleteNode } from '../../actions/delete-node.js';
import logger from '../../utils/logger.js';
import { getDto } from '../../utils/get-dto.js';
import { moveNodes } from '../../actions/move-nodes.js';
import { setData } from '../../actions/set-data.js';
import { setMeta } from '../../actions/set-meta.js';

export const registerHistoryHandlers = (scheme: Scheme) => {
  let isHistoryActionInProcess = false;

  scheme.events.subscribeEvent(EVENT_NODE_DELETED, ({ index, node, parentId }) => {
    if (isHistoryActionInProcess) return false;
    resolveService(TOKEN_HISTORY, scheme.container).add({
      back: () => {
        isHistoryActionInProcess = true;
        insertNode(
          {
            index,
            parentId: parentId,
            node,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
      forward: () => {
        isHistoryActionInProcess = true;
        deleteNode(
          {
            id: node.id,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_NODE_INSERTED, ({ node }) => {
    if (isHistoryActionInProcess) return false;
    const parent = node.parent;
    if (!parent) {
      logger.warn(`Parent node not found for ${node.id}`);
      return false;
    }
    const index = parent.children.findIndex((n) => n.id === node.id);
    if (index === -1) {
      logger.warn(`Not found index for ${node.id} in parent ${parent.id}`);
      return false;
    }
    const nodeDto = getDto(node.id, scheme);
    resolveService(TOKEN_HISTORY, scheme.container).add({
      forward: () => {
        isHistoryActionInProcess = true;
        insertNode(
          {
            index,
            node: nodeDto,
            parentId: parent.id,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
      back: () => {
        isHistoryActionInProcess = true;
        deleteNode(
          {
            id: node.id,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_NODES_MOVED, (params) => {
    if (isHistoryActionInProcess) return false;
    const { indexStart, insertIndex, length, newParentId, oldParentId } = params;
    const isSameParent = oldParentId === newParentId;
    const isMoveForwardSameNode = isSameParent && insertIndex > indexStart;
    const backInsertIndex = isSameParent && !isMoveForwardSameNode ? indexStart + length : indexStart;
    let backIndexStart = insertIndex;
    if (isSameParent && isMoveForwardSameNode) {
      backIndexStart = insertIndex - length;
    }
    resolveService(TOKEN_HISTORY, scheme.container).add({
      forward: () => {
        isHistoryActionInProcess = true;
        moveNodes(params, scheme);
        isHistoryActionInProcess = false;
      },
      back: () => {
        isHistoryActionInProcess = true;
        moveNodes(
          {
            indexStart: backIndexStart,
            insertIndex: backInsertIndex,
            length,
            newParentId: oldParentId,
            oldParentId: newParentId,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_DATA_UPDATED, ({ node, oldData }) => {
    if (isHistoryActionInProcess) return false;
    const data = node.data;
    const id = node.id;
    resolveService(TOKEN_HISTORY, scheme.container).add({
      forward: () => {
        isHistoryActionInProcess = true;
        setData(
          {
            id,
            data,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
      back: () => {
        isHistoryActionInProcess = true;
        setData(
          {
            id,
            data: oldData,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
    });
    return false;
  });

  scheme.events.subscribeEvent(EVENT_META_UPDATED, ({ node, oldMeta }) => {
    if (isHistoryActionInProcess) return false;
    const meta = node.meta;
    const id = node.id;
    resolveService(TOKEN_HISTORY, scheme.container).add({
      forward: () => {
        isHistoryActionInProcess = true;
        setMeta(
          {
            id,
            meta,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
      back: () => {
        isHistoryActionInProcess = true;
        setMeta(
          {
            id,
            meta: oldMeta,
          },
          scheme,
        );
        isHistoryActionInProcess = false;
      },
    });
    return false;
  });
};
