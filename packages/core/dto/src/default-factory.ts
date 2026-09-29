import { nanoid } from 'nanoid';
import type { INode, INodeConfig } from './types.js';

export const defaultFactory = (config: INodeConfig): INode => {
  let returnValue: INode = {
    id: nanoid(),
    name: config.name,
  };
  if (config.data) {
    returnValue = {
      ...returnValue,
      data: config.data.default(),
    };
  }
  if (config.children === true) {
    returnValue = {
      ...returnValue,
      children: [],
    };
  }
  return returnValue;
};
