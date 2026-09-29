import type { Scheme } from '../scheme/scheme.js';
import { EVENT_DATA_UPDATED } from '../scheme/scheme-events.js';

export interface ISetDataCommandParams {
  id: string;
  data: unknown;
}

export const setData = ({ id, data }: ISetDataCommandParams, scheme: Scheme): boolean => {
  const node = scheme.nodes.getNode(id);
  const oldData = node.data;
  node.data = data;
  scheme.events.fireEvent(EVENT_DATA_UPDATED, {
    node,
    oldData,
  });
  return true;
};
