import { buildMessage } from 'class-validator';
import * as math from "mathjs";
import { FunctionHeaderBlockStore } from '../../blocks/function-header/FunctionHeader.block.store';
import { TContext, TTypeInfo, expressionFunctions, isExpressionFunctionName } from "../../constants";
import { findSignature } from "../../util/findSignature";
import { getNodeReturnType } from "../../util/getNodeReturnType";
import { ucfirst } from '../../util/ucfirst';
import { castToNumber, convertSymbol } from "./convertSymbol";
import { GoLogicSchemeBuilder } from "./GoLogicSchemeBuilder";
import { ucfirstProps } from './util/ucfirstProps';

export interface IGenerateExpressionParams {
  node: math.MathNode,
  resultType: TTypeInfo,
  schemeBuilder: GoLogicSchemeBuilder,
  context?: TContext,
}

export const generateExpression = async ({
  node,
  resultType,
  schemeBuilder,
  context,
}: IGenerateExpressionParams): Promise<string> => {
  return await generateExpressionPrivate({ node, resultType, schemeBuilder, context });
}

const generateExpressionPrivate = async ({
  node,
  resultType,
  schemeBuilder,
  context,
}: IGenerateExpressionParams): Promise<string> => {
  if (math.isAssignmentNode(node)) {
    const leftOperator = await generateExpressionPrivate({ node: node.object, resultType, schemeBuilder });
    const rightOperator = await generateExpressionPrivate({ node: node.value, resultType, schemeBuilder, context });
    return `${leftOperator} = ${rightOperator}`;
  }
  if (math.isOperatorNode(node)) {
    switch (node.fn) {
      case 'pow':
        {
          schemeBuilder.addImport('math');
          const leftOperator = await generateExpressionPrivate({ node: node.args[0], resultType: { type: 'number', numberType: 'float', floatType: 'float64'}, schemeBuilder, context });
          const rightOperator = await generateExpressionPrivate({ node: node.args[1], resultType: { type: 'number', numberType: 'float', floatType: 'float64'}, schemeBuilder, context });
          if(resultType.type === 'number') {
            return convertSymbol({
              expression: `math.Pow(${leftOperator}, ${rightOperator})`,
              typeFrom: { type: 'number', numberType: 'float', floatType: 'float64'},
              typeTo: resultType,
            })
          }
        }
      default: {
        if (node.args.length === 1) {
          const operator = await generateExpressionPrivate({ node: node.args[0], resultType, schemeBuilder, context });
          return `${node.op}${operator}`;
        } else {
          let realOp: string = node.op;
          switch (node.op) {
            case 'and': realOp = '&&'; break;
            case 'or': realOp = '||'; break;
          }
          const allItems = await Promise.all(node.args.map((arg) => generateExpressionPrivate({ node: arg, resultType, schemeBuilder, context })));
          return allItems.join(` ${realOp} `)
        }
      }
    }
  }
  if (math.isParenthesisNode(node)) {
    const operator = await generateExpressionPrivate({ node: node.content, resultType, schemeBuilder, context });
    return `(${operator})`;
  }
  if (math.isArrayNode(node)) {
    const itemsTexts: string[] = [];
    if(resultType.type !== 'array') throw new Error(`Should be array result type: ${node.toString()}`);
    const itemType = resultType.elementType;
    const itemTypeName = await schemeBuilder.getFullTypeName(itemType);
    for (const item of node.items) {
      itemsTexts.push(await generateExpressionPrivate({ node: item, resultType: itemType, schemeBuilder, context }));
    }
    return `[]${itemTypeName}{ ${itemsTexts.join(', ')} }`;
  }
  if (math.isObjectNode(node)) {
    const itemsTexts: string[] = [];
    for (const key in node.properties) {
      const p = node.properties[key];
      const expr = await generateExpressionPrivate({ node: p, resultType, schemeBuilder, context });
      itemsTexts.push(`${key}: ${expr}`);
    }
    return `{ ${itemsTexts.join(', ')} }`;
  }
  if (math.isFunctionNode(node)) {
    return writeFunctionNode({
      node,
      resultType,
      schemeBuilder,
      context,
    });
  }
  if (math.isSymbolNode(node) && context) {
    const nodeType = getNodeReturnType({ node, context, projectStore: schemeBuilder.project });
    const expr = node.toString();
    schemeBuilder.addVariableToFunctionIfInContext(expr);
    return convertSymbol({ typeFrom: nodeType, typeTo: resultType, expression: expr });
  }
  if(math.isConstantNode(node)) {
    if(resultType.type === 'number') {
      return castToNumber(resultType, node.toString());
    }
  }
  //console.log('node', node.toString(), node);
  const stringNode = node.toString();
  const variableName = stringNode.includes('.') ? stringNode.substring(0, stringNode.indexOf('.')) : stringNode;
  if(schemeBuilder.scheme.documentType === 'function') {
    const functionHeaderBlock = schemeBuilder.scheme.root.block as FunctionHeaderBlockStore;
    const foundP = functionHeaderBlock.parameters.find((p) => p.nameStore.text === variableName);
    if(foundP) {
      schemeBuilder.addVariableToFunctionIfInContext(variableName);
    }
  }

  //const nodeReturnType = getNodeReturnType({ node, context: context || {} });
  if(context) {
    const nodeReturnType = getNodeReturnType({ node, context, projectStore: schemeBuilder.project });
    //console.log('node', node.toString(), node);
    const expression = node.toString();
    const varName = expression.replace(/\.(.*)$/, '');
    schemeBuilder.addVariableToFunctionIfInContext(varName);
    return ucfirstProps(convertSymbol({
      typeFrom: nodeReturnType,
      typeTo: resultType,
      expression: node.toString()
    }));
  }

  return ucfirstProps(node.toString());
}


interface IWriteFunctionNodeParams extends IGenerateExpressionParams {
  node: math.FunctionNode,
}

const writeFunctionNode = async ({
  node,
  resultType,
  schemeBuilder,
  context,
}: IWriteFunctionNodeParams): Promise<string> => {
  const itemsTexts: string[] = [];
  const fnName = node.fn.name;
  if(!isExpressionFunctionName(fnName)) {
    throw new Error(`Wrong expression function: ${fnName}`);
  }
  const functionInfo = expressionFunctions[fnName];
  for(let i = 0; i < node.args.length; i++) {
    const item = node.args[i];
    itemsTexts.push(await generateExpressionPrivate({ 
      node: item,
      resultType: functionInfo.signatures[0].parameters[i] ?? resultType,
      schemeBuilder,
      context,
    }));
  }
  switch (fnName) {
    case 'random':
      schemeBuilder.addImport('math/rand');
      return convertSymbol({
        expression: 'rand.Float64()',
        typeFrom: functionInfo.signatures[0].returnType,
        typeTo: resultType,
      });
    case 'sin':
      schemeBuilder.addImport('math');
      return convertSymbol({
        expression: `math.Sin(${itemsTexts[0]})`,
        typeFrom: functionInfo.signatures[0].returnType,
        typeTo: resultType,
      });
    default:
      throw new Error(`Wrong function: ${fnName}`);
  }
};
