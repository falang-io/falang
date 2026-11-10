import { EVENT_META_UPDATED } from '../scheme/scheme-events.js';
import type { Scheme } from '../scheme/scheme.js';
import type { INodeMeta } from '@falang/dto';
import { toPlainData } from '../utils/to-plain-data.js';

export interface ISetMetaCommandParams {
  id: string;
  meta: INodeMeta;
}

export const setMeta = ({ id, meta }: ISetMetaCommandParams, scheme: Scheme): boolean => {
  const node = scheme.nodes.getNode(id);
  const oldMeta = node.meta;
  node.meta = toPlainData(meta);
  scheme.events.fireEvent(EVENT_META_UPDATED, {
    node,
    oldMeta,
  });
  return true;
};
