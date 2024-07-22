import * as math from 'mathjs';
import { TContext, TVariableInfo } from '../constants';
import { LogicProjectStore } from '../LogicProject.store';
import { getAccessorNodeType } from './validateNode';

export const getNodeVariableType = (node: math.MathNode, context: TContext, projectStore: LogicProjectStore): TVariableInfo => {
  if(math.isSymbolNode(node)) {
    const name = node.name;
    const typ = context[name];
    if (!typ) {
      throw new Error(`_{logic:variable_not_found}: ${name}`);
    }
    return typ;
  }
  if(math.isAccessorNode(node)) {
    return getAccessorNodeType(node, context, projectStore);
  }
  if(math.isOperatorNode(node) && (['==', '!=', '>', '<', '>=', '<='].includes(node.op))) {
    return { type: 'boolean' };
  }
  throw new Error(`_{logic:variable_not_found}`);
};
