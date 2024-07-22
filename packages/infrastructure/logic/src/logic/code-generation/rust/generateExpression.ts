import * as math from "mathjs";
import { expressionFunctions, ExpressionFunctionsNames, isExpressionFunctionName, TContext, TTypeInfo } from "../../constants";
import { getNodeReturnType } from "../../util/getNodeReturnType";
import { getVariableNodeType } from "../../util/validateNode";
import { castToNumber, convertSymbol } from "./convertSymbol";
import { RustLogicSchemeBuilder } from "./RustLogicSchemeBuilder";

export interface IGenerateExpressionParams {
  node: math.MathNode,
  resultType: TTypeInfo,
  schemeBuilder: RustLogicSchemeBuilder,
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
          const leftOperator = await generateExpressionPrivate({ node: node.args[0], resultType, schemeBuilder, context });
          const rightOperator = await generateExpressionPrivate({ node: node.args[1], resultType, schemeBuilder, context });
          if(resultType.type === 'number') {
            if(resultType.numberType === 'float') {
              return `${leftOperator}.powf(${rightOperator})`;
            }
            if(resultType.numberType === 'integer') {
              return `${leftOperator}.pow(${rightOperator} as u32)`;
            }
          }
        }
      default: {
        if (node.args.length === 1) {
          const operator = await generateExpressionPrivate({ node: node.args[0], resultType, schemeBuilder, context });
          return `${node.op}${operator}`;
        } else if (node.args.length === 2) {
          let realOp: string = node.op;
          switch (node.op) {
            case 'and': realOp = '&&'; break;
            case 'or': realOp = '||'; break;
          }
          const leftOperator = await generateExpressionPrivate({ node: node.args[0], resultType, schemeBuilder, context });
          const rightOperator = await generateExpressionPrivate({ node: node.args[1], resultType, schemeBuilder, context });
          return `${leftOperator} ${realOp} ${rightOperator}`;
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
    //const itemTypeName = await schemeBuilder.getFullTypeName(itemType);
    for (const item of node.items) {
      itemsTexts.push(await generateExpressionPrivate({ node: item, resultType: itemType, schemeBuilder, context }));
    }
    return `vec![ ${itemsTexts.join(', ')} ]`;
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
    if(resultType.type === 'string') {
      return `String::from(${node.toString()})`;
    }
  }
  if(math.isAccessorNode(node) && !node.index.dotNotation) {
    const indexNode = node.index;
    if(math.isIndexNode(indexNode)) {
      const dimensionValue = indexNode.dimensions[0].toString();
      return `${node.object.toString()}[${dimensionValue} as usize]`;
    }
  }
  if(context) {
    const nodeReturnType = getNodeReturnType({ node, context, projectStore: schemeBuilder.project });
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
      schemeBuilder.addImport('use rand::Rng;');
      return convertSymbol({
        expression: 'rand::thread_rng().gen::<f64>()',
        typeFrom: functionInfo.signatures[0].returnType,
        typeTo: resultType,
      });
    case 'sin':
      return `${itemsTexts[0]}.sin()`;
      /*return convertSymbol({
        expression: `math.Sin(${itemsTexts[0]})`,
        typeFrom: functionInfo.signatures[0].returnType,
        typeTo: resultType,
      });*/
    default:
      throw new Error(`Wrong function: ${fnName}`);
  }
};
