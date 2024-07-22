import { TLangFunction } from '@falang/frontend-core'
import * as math from 'mathjs'
import { expressionFunctions, FloatTypes, GeneralTypes, IntegerTypes, isExpressionFunctionName, NumberTypes, TContext, TGeneralType, TNumberTypeInfo, TTypeInfo } from '../constants'
import { LogicProjectStore } from '../LogicProject.store'
import { findSignature } from './findSignature'
import { getAccessorNodeType } from './validateNode'

export interface IGetNodeReturnTypeParams {
  node: math.MathNode
  context: TContext,
  projectStore: LogicProjectStore,
}

export const operatorsResultTypes: Record<TGeneralType, math.OperatorNodeFn[]> = {
  string: [],
  number: ['add', 'divide', 'mod', 'multiply', 'pow', 'unaryMinus', 'unaryPlus', 'subtract'],
  array: [],
  boolean: ['xor', 'and', 'or', 'bitOr', 'bitNot', 'bitXor', 'bitAnd', 'not', 'smaller', 'larger', 'equal', 'unequal', 'largerEq', 'smallerEq'],
  union: [],
  never: [],
  struct: [],
  void: [],
  enum: [],
  any: [],
};

export const operatorsChildTypes: Record<TGeneralType, math.OperatorNodeFn[]> = {
  string: ['equal', 'unequal'],
  number: ['add', 'divide', 'factorial', 'mod', 'multiply', 'pow', 'unaryMinus', 'unaryPlus', 'subtract', 'smaller', 'larger', 'equal', 'unequal', 'largerEq', 'smallerEq'],
  array: [],
  boolean: ['xor', 'and', 'or', 'bitOr', 'bitNot', 'bitXor', 'bitAnd', 'not', 'equal', 'unequal'],
  //object: [],
  union: [],
  never: [],
  struct: [],
  void: [],
  enum: ['equal'],
  any: [],
};

export const findOperatorResultType = (fn: math.OperatorNodeFn): TGeneralType => {
  for (const t of GeneralTypes) {
    if (operatorsResultTypes[t].includes(fn)) {
      return t;
    }
  }
  throw new Error(`_{logic:unsupported_operator}: ${fn}`);
};

export const findOperatorChildType = (fn: math.OperatorNodeFn): TGeneralType => {
  for (const t of GeneralTypes) {
    if (operatorsChildTypes[t].includes(fn)) {
      return t;
    }
  }
  throw new Error(`_{logic:unsupported_operator}: ${fn}`);
};

export const findOperatorChildTypes = (fn: math.OperatorNodeFn): TGeneralType[] => {
  const returnValue: TGeneralType[] = [];
  for (const t of GeneralTypes) {
    if (operatorsChildTypes[t].includes(fn)) {
      returnValue.push(t);
    }
  }
  if (!returnValue.length) throw new Error(`_{logic:unsupported_operator}: ${fn}`);
  return returnValue;
};

export const getNodeReturnType = ({
  node,
  context,
  projectStore,
}: IGetNodeReturnTypeParams): TTypeInfo => {
  if (math.isAssignmentNode(node)) {
    return getNodeReturnType({ context, node: node.value, projectStore })
  }
  if (math.isBoolean(node)) {
    return {
      type: 'boolean'
    };
  }
  if (math.isConstantNode(node)) {
    const value = node.value;
    if (typeof value === 'string') {
      return {
        type: 'string'
      };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return {
          type: 'number',
          numberType: 'integer',
          integerType: 'int32',
        }
      }
      return {
        type: 'number',
        numberType: 'float',
        floatType: 'float32',
      }
    } else if (typeof value === 'boolean') {
      return { type: 'boolean' };
    }
    throw new Error(`_{lang:wrong_type}: ${typeof value}`);
  }
  if (math.isOperatorNode(node)) {
    const argsTypes = node.args.map(arg => getNodeReturnType({ node: arg, context, projectStore }));
    const resultType = findOperatorResultType(node.fn);
    const childType = findOperatorChildType(node.fn);
    const wrongType = argsTypes.find(t => t.type !== childType)
    /*console.log('OperatorNode', {
      argsTypes, resultType, childType, wrongType, node
    });*/
    if (wrongType) {
      throw new Error(`_{logic:conflict_type_and_operator} ${wrongType.type}, ${node.fn}`);
    }
    if (resultType === 'number') {
      return detectNumberTypeFromArray(argsTypes);
    }
    if (resultType === 'boolean' || resultType === 'string') {
      return { type: resultType };
    }
  }
  if (math.isSymbolNode(node)) {
    const contextValue = context[node.name];
    if (!contextValue) {
      throw new Error(`_{logic:variable_node_found}: ${node.name}`);
    }
    return context[node.name];
  }
  if (math.isParenthesisNode(node)) {
    return getNodeReturnType({ context, node: node.content, projectStore })
  }
  if (math.isArrayNode(node)) {
    const arrTypes = node.items.map(arg => getNodeReturnType({ node: arg, context, projectStore }));
    if (!arrTypes.length) {
      return { type: 'never' };
    }
    let finalType: TTypeInfo = { ...arrTypes[0] };
    if (finalType.type === 'number') {
      return detectNumberTypeFromArray(arrTypes);
    }
    for (let i = 1; i < arrTypes.length; i++) {
      const nextType = arrTypes[i];
      if (nextType.type !== finalType.type) {
        throw new Error(`_{logic:type_mismatch}: ${finalType.type},${nextType.type}`);
      }
    }
  }
  if(math.isFunctionNode(node)) {
    const fn = node.fn.name;
    if(!isExpressionFunctionName(fn)) {
      throw new Error(`_{logic:function_not_found}: ${fn}`);
    }
    const expressionFunction = expressionFunctions[fn];
    const signature = findSignature({
      functionData: expressionFunction,
      args: node.args,
      context,
      projectStore,
    });
    if(!signature) {
      throw new Error(`_{logic:wrong_function_call}: ${fn}`);
    }
    return signature.returnType;    
  }
  if(math.isAccessorNode(node)) {
    return getAccessorNodeType(node, context, projectStore);
  }
  console.log('Wrong node:', node);
  throw new Error(`_{logic:wrong_type}: ${node.type}`);
};

const detectNumberTypeFromArray = (types: TTypeInfo[]) => {
  if (!types.length) throw new Error('Empty types');
  const orders = types.map(t => {
    if (t.type !== 'number') {
      throw new Error('Should be number type');
    }
    return getNumberTypeOrder(t);
  });
  const maxOrder = Math.max(...orders);
  const index = orders.indexOf(maxOrder);
  if (index === -1) {
    throw new Error('Wrong type');
  }
  return types[index];
}

const getNumberTypeOrder = (type: TNumberTypeInfo) => {
  let returnValue = NumberTypes.indexOf(type.numberType) * 500;
  switch (type.numberType) {
    case 'decimal':
      returnValue += type.digits * 10 + type.decimals;
      break;
    case 'float':
      returnValue += FloatTypes.indexOf(type.floatType);
      break;
    case 'integer':
      returnValue += IntegerTypes.indexOf(type.integerType);
      break;
    default:
      throw new Error(`Wrong number type: ${JSON.stringify(type)}`);
  }
  return returnValue;
}