import * as math from 'mathjs';
import { type } from 'os';
import { expressionFunctions, IObjectTypeInfo, isExpressionFunctionName, TContext, TTypeInfo, TVariableInfo } from '../constants';
import { LogicProjectStore } from '../LogicProject.store';
import { findSignature } from './findSignature';
import { findOperatorChildType, findOperatorChildTypes, findOperatorResultType, getNodeReturnType, operatorsResultTypes } from './getNodeReturnType';

export interface IValidateNodeParams {
  node: math.MathNode
  context: TContext
  typeInfo: TTypeInfo
  projectStore: LogicProjectStore,
}

export interface IValidateScalarNodeParams {
  node: math.MathNode
  context: TContext
  projectStore: LogicProjectStore
}

export const validateNode = ({ node, context, typeInfo, projectStore }: IValidateNodeParams): void => {
  //console.log('node', { node, context, typeInfo});
  if (math.isOperatorNode(node)) {
    if (!operatorsResultTypes[typeInfo.type].includes(node.fn)) {
      throw new Error(`_{logic:wrong_operator}: ${typeInfo.type} (${node.op}, ${node.fn})`);
    }
    if (node.args.length < 2) {
      if(node.fn === 'unaryMinus') {
        validateNode({ node: node.args[0], context, typeInfo: { type: 'number', numberType: 'any' }, projectStore });
        return;
      }
      throw new Error(`_{logic:no_args_in_operator}: ${node.op} (${node.fn})`);
    }
    const resultType = findOperatorResultType(node.fn);
    if (resultType !== typeInfo.type) {
      throw new Error(`_{logic:wrong_operator}: ${typeInfo.type} (${node.op}, ${node.fn})`);
    }
    if (node.fn === 'equal' && node.args.length === 2) {
      const childTypes = findOperatorChildTypes(node.fn);
      const leftType = getNodeReturnType({ node: node.args[0], context, projectStore });
      if (!childTypes.includes(leftType.type)) {
        throw new Error(`_{logic:wrong_type_to_compare}: ${leftType.type}`);
      }
      validateNode({ node: node.args[1], context, typeInfo: leftType, projectStore });
      return;
    }
    const childType = findOperatorChildType(node.fn);
    if (childType === typeInfo.type) {
      for (const arg of node.args) {
        validateNode({ node: arg, context, typeInfo, projectStore });
      }
    }
    if(childType === 'boolean') {
      for (const arg of node.args) {
        validateNode({ node: arg, context, typeInfo: { type: 'boolean' }, projectStore });
      }
    } else {
      if (childType !== 'number') {
        throw new Error(`_{logic:wrong_operator}: ${typeInfo.type} (${node.op}, ${node.fn})`);
      }
      for (const arg of node.args) {
        validateNode({ node: arg, context, typeInfo: { type: 'number', numberType: 'any' }, projectStore });
      }
    }

    return;
  }
  if (math.isAccessorNode(node)) {
    const accessorType = getAccessorNodeType(node, context, projectStore);
    compareTypes(accessorType, typeInfo);
    return;
  }
  if (math.isParenthesisNode(node)) {
    validateNode({ node: node.content, context, typeInfo, projectStore });
    return;
  }
  if (math.isSymbolNode(node)) {
    const type = context[node.name];
    if (!type) {
      throw new Error(`_{logic:variable_not_found}: ${node.name}`);
    }
    compareTypes(type, typeInfo);
    return;
  }
  if (math.isConstantNode(node)) {
    if (typeof node.value === 'number') {
      if (typeInfo.type !== 'number') {
        throw new Error(`_{logic:wrong_type}: ${node.value}, ${typeInfo.type}`);
      }
      if (typeInfo.numberType === 'integer') {
        if (!Number.isInteger(node.value)) {
          throw new Error(`_{logic:wrong_type}: ${node.value}`);
        }
      }
      return;
    } else if (typeof node.value === 'string') {
      if (typeInfo.type !== 'string') {
        throw new Error(`_{logic:wrong_type}: ${node.value}`);
      }
      return;
    } else if (typeof node.value === 'boolean') {
      if (typeInfo.type !== 'boolean') {
        throw new Error(`_{logic:wrong_type}: ${node.value} - ${typeInfo.type}`);
      }
      return;
    }
  }
  if (math.isBoolean(node)) {
    if (typeInfo.type !== 'boolean') {
      throw new Error(`_{logic:wrong_type}: ${node} - ${typeInfo.type}`);
    }
    return;
  }
  if (math.isArrayNode(node)) {
    if (typeInfo.type !== 'array') {
      throw new Error(`_{logic:wrong_type}: ${node} - ${typeInfo.type}`);
    }
    for (const item of node.items) {
      if (typeInfo.dimensions > 1) {
        validateNode({
          node: item,
          context,
          typeInfo: {
            ...typeInfo,
            dimensions: typeInfo.dimensions - 1,
          }, projectStore
        });
      } else {
        validateNode({ node: item, context, typeInfo: typeInfo.elementType, projectStore });
      }
    }
    return;
  }
  if (math.isObjectNode(node)) {
    if (typeInfo.type !== 'struct') {
      throw new Error(`_{logic:wrong_type}: ${node} - ${typeInfo.type}`);
    }
    const struct = projectStore.getStructByType(typeInfo);
    if(!struct) {
      throw new Error('Internal: should be a struct');
    }
    //console.log({ typeInfo, node });
    const nodeKeys = Object.keys(node.properties);
    
    const typeKeys = Object.keys(struct.properties);
    const extraTypeKeys = typeKeys.filter(k => !nodeKeys.includes(k) || (struct.properties ?? {})[k].optional);
    const extraNodeKeys = nodeKeys.filter(k => !typeKeys.includes(k));
    if (extraTypeKeys.length) {
      throw new Error(`_{logic:missed_properties}: ${extraTypeKeys.join(',')}`)
    }
    if (extraNodeKeys.length) {
      throw new Error(`_{logic:unknown_properties}: ${extraNodeKeys.join(',')}`)
    }
    for (const k of typeKeys) {
      if (!node.properties[k]) {
        if (struct.properties[k].optional) continue;
        throw new Error(`_{logic:missed_properties}: ${k}`)
      }
      validateNode({ node: node.properties[k], context, typeInfo: struct.properties[k], projectStore })
    }
    return;
  }
  if (math.isFunctionNode(node)) {
    const fn = node.fn.name;
    if (!isExpressionFunctionName(fn)) {
      throw new Error(`_{logic:function_not_found}: ${fn}`);
    }
    const expressionFunction = expressionFunctions[fn];
    const signature = findSignature({
      functionData: expressionFunction,
      args: node.args,
      context,
      projectStore,
    });
    if (!signature) {
      throw new Error(`_{logic:wrong_function_call}: ${fn}`);
    }
    return;
  }
  throw new Error(`_{logic:wrong_node}: ${node.type}`)
};

export const compareTypes = (toCompare: TTypeInfo, target: TTypeInfo) => {
  if (toCompare.type !== target.type) {
    throw new Error(`_{logic:wrong_type}: ${toCompare.type}, ${target.type}`);
  }
  if (toCompare.type === 'string' || toCompare.type === 'boolean') return;
  if (toCompare.type === 'number' && target.type === 'number') {
    /*if (target.numberType === 'integer' && toCompare.numberType !== 'integer') {
      throw new Error(`_{logic:wrong_type}: ${toCompare.numberType}, ${target.numberType}`);
    }*/
    return;
  }
  if (toCompare.type === 'struct' && target.type === 'struct') {
    if (toCompare.schemeId !== target.schemeId || toCompare.iconId !== target.iconId) {
      throw new Error(`_{logic:wrong_type}: ${toCompare.name}, ${target.name}`);
    }
  }
}

export const getAccessorNodeType = (node: math.AccessorNode | math.AssignmentNode, context: TContext, projectStore: LogicProjectStore): TTypeInfo => {
  const nodeIndex = node.index;

  if (!nodeIndex) {
    throw new Error('no index');
  }

  const nodeObject = node.object;

  let nodeObjectType: TTypeInfo;

  /*if(!math.isConstantNode(nodeIndex)) {
    throw new Error(`Wrong node: ${nodeIndex.type}`);
  }*/

  if (math.isAccessorNode(nodeObject)) {
    nodeObjectType = getAccessorNodeType(nodeObject, context, projectStore);
  } else if (math.isSymbolNode(nodeObject)) {
    nodeObjectType = context[nodeObject.name];
    if (!nodeObjectType) {
      throw new Error(`_{logic:wrong_item}: ${nodeObject.name}`);
    }
  } else {
    throw new Error();
  }

  if (nodeObjectType.type === 'array') {

    if (nodeIndex.dotNotation) throw new Error(`_{logic:wrong_access}: ${nodeObject.name}`);
    if (nodeIndex.dimensions.length > nodeObjectType.dimensions) {
      throw new Error(`_{logic:wrong_dimensions_count}: ${nodeObject.name}`);
    }
    nodeIndex.dimensions.forEach(dimension => {
      //валидируем что в обращении к массиву везде на выходе число
      validateNode({
        node: dimension, context, typeInfo: {
          type: 'number',
          numberType: 'integer',
          integerType: 'int32',
        }, projectStore
      });
    });
    if (nodeIndex.dimensions.length < nodeObjectType.dimensions) {
      return {
        ...nodeObjectType,
        dimensions: nodeObjectType.dimensions - nodeIndex.dimensions.length,
      }
    }
    return nodeObjectType.elementType;

  } else if (nodeObjectType.type === 'struct') {

    if (!nodeIndex.dotNotation) throw new Error(`_{logic:wrong_access}: ${nodeObject.name}`);
    if (nodeIndex.dimensions.length !== 1) {
      throw new Error(`_{logic:wrong_dimensions}`);
    }
    const dimension = nodeIndex.dimensions[0];
    if (!math.isConstantNode(dimension)) {
      throw new Error(`_{logic:wrong_dimensions}`);
    }
    if (typeof dimension.value !== 'string') {
      throw new Error(`_{logic:wrong_dimensions}: ${dimension.value}`);
    }
    const struct = projectStore.getStructByType(nodeObjectType);
    if(!struct) {
      throw new Error('Internal: should be a struct');
    }
    const returnValue = struct.properties[dimension.value];
    //console.log('returnValuegetAccessorNodeType', returnValue);
    if (!returnValue) throw new Error(`_{logic:wrong_dimensions}: ${dimension.value}`);
    return returnValue;

  } else {
    throw new Error(`_{logic:wrong_access}: ${nodeObject.name}: ${nodeObjectType.type}`);
  }
}

export const getVariableNodeType = (varName: string, context: TContext, projectStore: LogicProjectStore): TTypeInfo | null => {
  if (!varName.includes('.')) {
    return context[varName] ?? null;
  }
  const arr = varName.split('.');
  let currentObject: IObjectTypeInfo | null = null;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (currentObject) {
      const struct = projectStore.getStructByType(currentObject);
      const childItem: TTypeInfo | undefined = struct?.properties[item];
      if (!childItem) return null;
      if (i === arr.length - 1) return childItem;
      if (!childItem || childItem.type !== 'struct') return null;
      currentObject = childItem;
    } else {
      const child = context[item];
      if (!child) return null;
      if (i === arr.length - 1) return child;
      if (child.type !== 'struct') return null;
      currentObject = child;
    }
  }
  return null;
}

export const validateScalarNode = ({ node, context, projectStore }: IValidateScalarNodeParams): void => {
  if (math.isConstantNode(node) || math.isBoolean(node)) {
    return;
  }
  if (math.isSymbolNode(node)) {
    const type = context[node.name];
    if (!type) {
      throw new Error(`_{logic:variable_not_found}: ${node.name}`);
    }
    validateScalarType(type, node.name);
    return;
  }
  if (math.isAccessorNode(node)) {
    const accessorType = getAccessorNodeType(node, context, projectStore);
    validateScalarType(accessorType, node.name);
    return;
  }
  throw new Error(`_{logic:wrong_node}: ${node.type}`);
}

export const validateScalarType = (type: TTypeInfo, name?: string) => {
  if (false === ['number', 'string', 'boolean', 'enum'].includes(type.type)) {
    throw new Error(`_{logic:wrong_type}: ${name}`);
  }
}

export const getSingleNodeType = ({ node, context, projectStore }: IValidateScalarNodeParams): TTypeInfo | null => {
  if (math.isConstantNode(node)) {
    switch (typeof node.value) {
      case 'string': return { type: 'string' };
      case 'number': return { type: 'number', numberType: 'any' };
      case 'boolean': return { type: 'boolean' };
      default: return null;
    }
  }
  if (math.isSymbolNode(node)) {
    const type = context[node.name];
    if (!type) {
      return null;
    }
    return type;
  }
  if (math.isAccessorNode(node)) {
    const accessorType = getAccessorNodeType(node, context, projectStore);
    return accessorType;
  }
  return null;
}