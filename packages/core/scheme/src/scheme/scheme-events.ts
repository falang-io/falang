import type { INode, INodeMeta } from '@falang/dto';
import type { SchemeEvent } from './scheme-events.service.js';
import type { NodeStore } from '../store/node.store.js';
import type { IMoveNodesCommandParams } from '../actions/move-nodes.js';

export const createEvent = <T>(type: string): SchemeEvent<T> => ({ type });

export interface IEventDataNodeDeleted {
  node: INode;
  parentId: string;
  index: number;
}
export const EVENT_NODE_DELETED = createEvent<IEventDataNodeDeleted>('NODE_DELETED');

export interface IeventNodeInserted {
  node: NodeStore;
}
export const EVENT_NODE_INSERTED = createEvent<IeventNodeInserted>('NODE_INSERTED');

export const EVENT_NODES_MOVED = createEvent<IMoveNodesCommandParams>('NODES_MOVED');

export interface IEventDataUpdated {
  node: NodeStore;
  oldData: unknown;
}
export const EVENT_DATA_UPDATED = createEvent<IEventDataUpdated>('DATA_UPDATED');

export interface IEventMetaUpdated {
  node: NodeStore;
  oldMeta: INodeMeta;
}
export const EVENT_META_UPDATED = createEvent<IEventMetaUpdated>('META_UPDATED');

export interface IEventOutUpdated {
  node: NodeStore;
  oldOut: INode | null;
}
export const EVENT_OUT_UPDATED = createEvent<IEventOutUpdated>('OUT_UPDATED');

export interface IEventModeChanged {
  oldMode: string;
  newMode: string;
}
export const EVENT_MODE_CHANGED = createEvent<IEventModeChanged>('MODE_CHANGED');

export const EVENT_ONCHANGE = createEvent<{ event: string }>('ONCHANGE');
