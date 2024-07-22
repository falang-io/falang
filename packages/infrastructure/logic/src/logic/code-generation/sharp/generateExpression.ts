import * as math from "mathjs";
import { expressionFunctions, ExpressionFunctionsNames, isExpressionFunctionName, TContext, TTypeInfo } from "../../constants";
import { getNodeReturnType } from "../../util/getNodeReturnType";
import { getVariableNodeType } from "../../util/validateNode";
import { castToNumber, convertSymbol } from "./convertSymbol";
import { SharpLogicSchemeBuilder } from "./SharpLogicSchemeBuilder";

export interface IGenerateExpressionParams {
  node: math.MathNode,
  resultType: TTypeInfo,
  schemeBuilder: SharpLogicSchemeBuilder,
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
    return `${leftOperator} = (${await schemeBuilder.getFullTypeName(resultType)})(${rightOperator})`;
  }
  if (math.isOperatorNode(node)) {
    switch (node.fn) {
      case 'pow':
        {
          const leftOperator = await generateExpressionPrivate({ node: node.args[0], resultType, schemeBuilder, context });
          const rightOperator = await generateExpressionPrivate({ node: node.args[1], resultType, schemeBuilder, context });
          if(resultType.type === 'number') {
            return `Math.Pow(${leftOperator}, ${rightOperator})`;
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
    for (const item of node.items) {
      itemsTexts.push(await generateExpressionPrivate({ node: item, resultType, schemeBuilder, context }));
    }
    if(resultType.type !== 'array') throw new Error(`resultTYpe should be array`);
    const resultTypeName = await schemeBuilder.getFullTypeName(resultType.elementType);
    return `new System.Collections.Generic.List<${resultTypeName}>{ ${itemsTexts.join(', ')} }`;
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
    return convertSymbol({ typeFrom: nodeType, typeTo: resultType, expression: expr });
  }
  if(math.isConstantNode(node)) {
    if(resultType.type === 'number') {
      return castToNumber(resultType, node.toString());
    }
  }
  if(context) {
    const nodeReturnType = getNodeReturnType({ node, context, projectStore: schemeBuilder.project });
    //console.log('node', node.toString(), node);
    return convertSymbol({
      typeFrom: nodeReturnType,
      typeTo: resultType,
      expression: node.toString()
    })
  }

  return node.toString();
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
      return convertSymbol({
        expression: '(new Random()).NextDouble()',
        typeFrom: functionInfo.signatures[0].returnType,
        typeTo: resultType,
      });
    case 'sin':
      return convertSymbol({
        expression: `Math.Sin(${itemsTexts[0]})`,
        typeFrom: functionInfo.signatures[0].returnType,
        typeTo: resultType,
      });
    default:
      throw new Error(`Wrong function: ${fnName}`);
  }
};
