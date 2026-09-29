import { deleteNode } from '../actions/delete-node.js';
import { insertNode } from '../actions/insert-node.js';
import { moveNodes } from '../actions/move-nodes.js';
import { setData } from '../actions/set-data.js';
import { setMeta } from '../actions/set-meta.js';
import { setOutNode } from '../actions/set-out-node.js';
import {
  CMD_DELETE_NODE,
  CMD_INSERT_NODE,
  CMD_MOVE_NODES,
  CMD_SCHEME_MOUSE_MOVE,
  CMD_SET_DATA,
  CMD_SET_META,
  CMD_SET_OUT,
} from './scheme-commands.js';
import type { Scheme } from './scheme.js';

// Read-only guards, one per mutation command, registered at priority 4 — the bucket
// `SchemeCommandsService.dispatchCommand` drains first (it iterates priority 4 down to 0) — so each
// one always intercepts before its command's real handler below (registered at the default priority
// 0), regardless of registration order, and stops propagation (`true`) so the handler never runs.
const registerReadOnlyGuards = (scheme: Scheme) => {
  const blockWhileReadOnly = () => !scheme.isEditing;
  scheme.commands.registerCommand(CMD_DELETE_NODE, blockWhileReadOnly, 4);
  scheme.commands.registerCommand(CMD_INSERT_NODE, blockWhileReadOnly, 4);
  scheme.commands.registerCommand(CMD_MOVE_NODES, blockWhileReadOnly, 4);
  scheme.commands.registerCommand(CMD_SET_DATA, blockWhileReadOnly, 4);
  scheme.commands.registerCommand(CMD_SET_META, blockWhileReadOnly, 4);
  scheme.commands.registerCommand(CMD_SET_OUT, blockWhileReadOnly, 4);
};

export const registerSchemeCommands = (scheme: Scheme) => {
  registerReadOnlyGuards(scheme);
  scheme.commands.registerCommand(CMD_DELETE_NODE, (payload) => deleteNode(payload, scheme));
  scheme.commands.registerCommand(CMD_INSERT_NODE, (payload) => insertNode(payload, scheme));
  scheme.commands.registerCommand(CMD_MOVE_NODES, (payload) => moveNodes(payload, scheme));
  scheme.commands.registerCommand(CMD_SET_DATA, (payload) => setData(payload, scheme));
  scheme.commands.registerCommand(CMD_SET_META, (payload) => setMeta(payload, scheme));
  scheme.commands.registerCommand(CMD_SET_OUT, (payload) => setOutNode(payload, scheme));
  scheme.commands.registerCommand(
    CMD_SCHEME_MOUSE_MOVE,
    (e) => {
      const rect = scheme.getDomRect();
      const { x, y, scale } = scheme.viewPosition;
      const relativeX = (e.clientX - rect.x - x) / scale;
      const relativeY = (e.clientY - rect.y - y) / scale;
      scheme.mousePosition.set({ x: relativeX, y: relativeY });
      return false;
    },
    4,
  );
};
