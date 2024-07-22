import * as math from "mathjs";
import { CodeBuilder } from '@falang/editor-scheme';
import { CallFunctionBlockStore } from '../../blocks/call-function/CallFunction.block.store';
import { FunctionHeaderBlockStore } from '../../blocks/function-header/FunctionHeader.block.store';
import { int32Type, TTypeInfo } from "../../constants";
import { getSingleNodeType } from "../../util/validateNode";
import { ILogicIconsBuilders, ISwitchIconBuilderOption } from "../interfaces"
import { writeJsCycleBottomInfo } from '../js/javascriptLogicIconsBuilder';
import { hasParentCycle } from '../util/hasParentCycle';
import { TypescriptLogicSchemeBuilder } from "./TypescriptLogicSchemeBuilder"

export const typescriptLogicIconsBuilder = {
  assign_var: async ({ builder, block, cb }) => {
    const node = block.expressionStore.mathNode;
    if (!math.isAssignmentNode(node)) {
      throw new Error(`Should be assignment node. ${block.id}`);
    }
    const variableType = block.variableType;
    if (!variableType) {
      throw new Error(`Block variable type is null. ${block.id}`);
    }
    const leftValue = block.variableName;
    const rightValue = await builder.expr(node.value, block.variableType, block.context);
    cb.p(`${leftValue} = ${rightValue};`);
  },
  call_api: async (params) => {
    await printTypescriptCallFunction(params);
  },
  call_function: async (params) => {
    await printTypescriptCallFunction(params);
  },
  create_var: async ({ block, cb, builder }) => {
    if (!block.variableType) {
      throw new Error('No variableType');
    }
    let arr = block.expressionStore.expression.split('=');
    if (arr.length === 1) {
      cb.p(`let ${arr[0]}: ${await builder.getFullTypeName(block.variableType)} = ${await builder.generateEmptyValue(block.variableType)};`);
      return;
      //throw new Error(`Wrong expression: ${finalExpression}`);
    }
    const finalExpression = await builder.generateExpressionOld(block.expressionStore, block.variableType, block.context);
    arr = finalExpression.split(' =');
    const leftValue = arr.shift()?.trim();
    if (!leftValue) throw new Error('Should be a value');
    const rightValue = arr.join('=');

    cb.p(`let ${leftValue}: ${await builder.getFullTypeName(block.variableType)} =${rightValue};`);
  },
  enums: async ({ enums, cb }) => {
    for (const enm of enums) {
      const name = enm.head.name;
      cb.p(`export const ${name} = {`);
      cb.indentPlus();
      const isString = enm.head.selectTypeStore.selectedValue === 'string';
      for (const item of enm.items) {
        const valueText = isString ? `"${item.valueStore.text}"` : item.valueStore.text;
        cb.p(`${item.keyStore.text} = ${valueText},`);
      }
      cb.indentMinus();
      cb.p('} as const;');
      cb.p(`export type T${name}Key = keyof typeof ${name};`);
      cb.p(`export type T${name}Value = typeof ${name}[T${name}Key]`);
    }
  },
  foreach: async ({ icon, block, cb, builder }) => {
    const indexName = block.indexExpression.expression;
    const arrName = block.arrExpression.expression;
    const itemName = block.itemExpression.expression;
    if (indexName.length) {
      cb.p(`for (let ${indexName} = 0; ${indexName} < ${arrName}.length; ${indexName}++) {`);
      cb.indentPlus();
      cb.p(`const ${itemName} = ${arrName}[${indexName}];`);
    } else {
      cb.p(`for (const ${itemName} of ${arrName}) {`);
      cb.indentPlus();
    }
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeJsCycleBottomInfo({ builder, icon });
  },
  from_to_cycle: async ({ icon, block, cb, builder }) => {
    const itemName = block.itemExpression.expression;
    const fromName = `_${itemName}_from`;
    const toName = `_${itemName}_to`;
    cb.p(`const ${fromName} = ${await builder.generateExpression(block.fromExpression, int32Type, block.context)};`);
    cb.p(`const ${toName} = ${await builder.generateExpression(block.toExpression, int32Type, block.context)};`);
    cb.p(`for (let ${itemName} = ${fromName}; ${itemName} < ${toName}; ${itemName}++) {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeJsCycleBottomInfo({ builder, icon });
  },
  function: async ({ icon, block, cb, builder, header }) => {
    const returnType = block.returnStore.get();
    builder.printBigComment(header.text);
    await builder.importGlobal();
    const functionName = builder.scheme.name;
    const paramsInterfaceName = `I${functionName}Params`
    await printTypescriptBlockHeaderParamsInterface({
      functionName: builder.scheme.name,
      builder,
      header: block,
      isApi: false,
    });
    const parametersNames: string[] = [];
    for (const parameter of block.parameters) {
      parametersNames.push(parameter.nameStore.text);
    }
    parametersNames.push('_falangGlobal');
    cb.p(`export async function ${functionName}(_params: ${paramsInterfaceName}): Promise<${await builder.getFullTypeName(returnType)}> {`);
    cb.indentPlus();
    cb.p(`const _falangGlobal = _params._falangGlobal;`);
    for (const parameter of block.parameters) {
      const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
      if(parameter.variableType.type === 'array' || parameter.variableType.type === 'struct') {
        cb.p(`let ${parameter.nameStore.text}: ${parameterTypeName} = JSON.parse(JSON.stringify(_params.${parameter.nameStore.text}));`);
      }  
      parametersNames.push(parameter.nameStore.text);
    }
    if (returnType.type !== 'void') {
      cb.p(`let returnValue: ${await builder.getFullTypeName(returnType)} = ${await builder.generateEmptyValue(returnType)};`);
    }
    if (builder.cycleCompileInfo.hasBreaks) {
      cb.p(`let _break_level = 0;`);
    }
    if (builder.cycleCompileInfo.hasContinues) {
      cb.p(`let _continue_level = 0;`);
    }
    if (builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`let _switch_break = false;`);
    }
    await builder.generateSkewer(icon.skewer);
    if (returnType.type !== 'void') {
      cb.p('return returnValue;');
    }
    cb.closeQuote();
  },
  if: async ({ icon, block, cb, builder }) => {
    const trueIcon = icon.trueOnRight ? icon.threads.icons[1] : icon.threads.icons[0];
    const falseIcon = icon.trueOnRight ? icon.threads.icons[0] : icon.threads.icons[1];
    cb.p(`if (${await builder.expr(block.expressionStore.mathNode, { type: 'boolean' }, block.context)}) {`);
    cb.indentPlus();
    await builder.generateSkewer(trueIcon.skewer);
    cb.indentMinus();
    cb.p('} else {');
    cb.indentPlus();
    await builder.generateSkewer(falseIcon.skewer);
    cb.closeQuote();
  },
  logic_external_apis: async ({ apis, cb, builder }) => {
    for (const apiData of apis) {
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `I${functionName}Params`
        await printTypescriptBlockHeaderParamsInterface({
          functionName,
          builder,
          header: apiItem,
          isApi: true,
        });
      }
      cb.p(`export interface ${apiData.head.name.text} {`);
      cb.indentPlus();
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `I${functionName}Params`;
        const returnTypeName = await builder.getFullTypeName(apiItem.returnStore.get());2
        cb.p(`${apiItem.nameStore.text} (params: ${paramsInterfaceName}): Promise<${returnTypeName}>;`);
      }
      cb.closeQuote();
    }
    cb.p(`export interface ${builder.scheme.name} {`);
    cb.plus();
    for (const apiData of apis) {
      const className = `${apiData.head.name.text}`;
      cb.pp([`${className}: ${className},`]);
    }
    cb.minus();
    cb.p('}');
  },
  logic_objects: async ({ objects, cb, builder }) => {
    for (const obj of objects) {
      cb.p(`export interface ${obj.head.text} {`);
      cb.indentPlus();
      for (const item of obj.items) {
        cb.p(`${item.name}: ${await builder.getFullTypeName(item.variableType)}`);
      }
      cb.closeQuote();
    }
  },
  parallel: async () => {
    throw new Error('Parallel not implemented');
  },
  switch: async ({ block, builder, cb, icon, options }) => {
    const node = block.expressionStore.mathNode;
    if (!node) {
      throw new Error(`Wrong head node for switch. Icon: ${icon.id}`);
    }
    const blockNodeType = getSingleNodeType({
      node: block.expressionStore.mathNode,
      context: block.context,
      projectStore: builder.project,
    });
    if (!blockNodeType) {
      throw new Error(`Node type not found. Icon: ${icon.id}`);
    }
    if (builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`_switch_break = false;`);
    }
    cb.p(`switch (${await builder.expr(block.expressionStore.mathNode, { type: 'any' }, block.context)}) {`);
    cb.plus();
    const generateOption = async (option: ISwitchIconBuilderOption) => {
      cb.openQuote();
      await builder.generateSkewer(option.skewer);
      cb.closeQuote();
    }    
    let defaultOption: ISwitchIconBuilderOption | null = null;
    cb.plus();
    if (blockNodeType.type === 'enum') {
      const enumItem = builder.project.getEnum(blockNodeType.schemeId, blockNodeType.iconId);
      if (!enumItem || !blockNodeType.iconId) {
        throw new Error(`Enum not found: ${blockNodeType.schemeId},${blockNodeType.iconId}`);
      }
      //await builder.importEnum(enumItem);
      //let withDefault: ISwitchIconBuilderOption | null = null;
      const isString = enumItem.type === 'string';
      for (const option of options) {
        const values = option.head.enumSelectStore.selectedValues;
        let continueOption = false;
        for (const value of values) {
          if (value === 'default') {
            defaultOption = option;
            continueOption = true;
            break;
          }
          const foundOption = enumItem.options.find((item) => item.key === value);
          if (!foundOption) {
            throw new Error(`Option not found for enum ${enumItem.iconId}: ${value}`);
          }
          if (isString) {
            cb.p(`case \'${foundOption.value}\':`);
          } else {
            cb.p(`case ${foundOption.value}:`);
          }
        }
        if(continueOption) continue;
        cb.openQuote();
        await builder.generateSkewer(option.skewer);
        cb.closeQuote();
        cb.p('break;');
      }
    } else {
      for (const option of options) {
        if(option.head.expressionStore.expression === 'default') {
          defaultOption = option;
        } else {
          cb.p(`case ${await builder.generateExpression(option.head.expressionStore, { type: 'any' }, block.context)}:`);
          await generateOption(option);
          cb.p('break;');
        }
      }
    }
    if(defaultOption) {
      cb.p('default: ');
      await generateOption(defaultOption);
    }
    cb.closeQuote();
    if (hasParentCycle(icon) && builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`if (_switch_break) { break; }`);
    }

    /**    const trueIcon = icon.trueOnRight ? icon.threads.icons[1] : icon.threads.icons[0];
    const falseIcon = icon.trueOnRight ? icon.threads.icons[0] : icon.threads.icons[1];
    cb.p(`if (${builder.generateExpressionOld(block.expressionStore)}) {`);
    cb.indentPlus();
    await builder.generateSkewer(trueIcon.skewer);
    cb.indentMinus();
    cb.p('} else {');
    cb.indentPlus();
    await builder.generateSkewer(falseIcon.skewer);
    cb.closeQuote(); */
  },
  while: async ({ block, builder, cb, icon }) => {
    cb.p(`do {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.indentMinus();
    cb.p(`} while (${await builder.expr(block.expressionStore.mathNode, { type: 'boolean' }, block.context)});`);
    writeJsCycleBottomInfo({ builder, icon });
  },
  "pseudo-cycle": async ({ block, builder, cb, icon }) => {
    cb.p(`do {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.indentMinus();
    cb.p(`} while (false);`);
    writeJsCycleBottomInfo({ builder, icon });
  },
  log: async ({ block, cb }) => {
    const message = block.expression.slice(1, block.expression.length - 1);
    cb.p(`console.log(\`${message.replaceAll('{', '${')}\`);`);
  },
  arr_pop: async ({ block, cb }) => { 
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if(v.length) {
      cb.p(`let ${v} = ${a}.pop()`);
      cb.p(`if (!${v}) throw new Error('');`);
    } else {
      cb.p(`${a}.pop()`);
    }    
  },
  arr_push: async ({ block, cb }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    cb.p(`${a}.push(${v})`);   
  },
  arr_shift: async ({ block, cb }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if(v.length) {
      cb.p(`let ${v} = ${a}.shift()`);
      cb.p(`if (!${v}) throw new Error('');`);
    } else {
      cb.p(`${a}.shift()`);
    }    
  },
  arr_splice: async () => { throw new Error('arr_splice not implemented') },
  arr_unshift: async ({ block, cb }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    cb.p(`${a}.unshift(${v})`);
  },
} as const satisfies ILogicIconsBuilders<TypescriptLogicSchemeBuilder>;



const printTypescriptBlockHeaderParamsInterface = async ({
  functionName, header, builder, isApi
}: {
  functionName: string,
  header: FunctionHeaderBlockStore,
  builder: TypescriptLogicSchemeBuilder,
  isApi: boolean
}) => {
  const paramsInterfaceName = `I${functionName}Params`
  const cb = builder.codeBuilder;
  cb.p(`export interface ${paramsInterfaceName} {`);
  cb.indentPlus();
  const parametersNames: string[] = [];
  for (const parameter of header.parameters) {
    const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
    cb.p(`${parameter.nameStore.text}: ${parameterTypeName};`);
    parametersNames.push(parameter.nameStore.text);
  }
  parametersNames.push('_falangGlobal');
  if(!isApi) {
    cb.p('_falangGlobal: FalangGlobal;');
  }  
  cb.closeQuote();
}

const printTypescriptCallFunction = async ({ block, cb, builder, }: {
  block: CallFunctionBlockStore,
  cb: CodeBuilder,
  builder: TypescriptLogicSchemeBuilder,
}) => {
  //const parameters: string[] = await Promise.all(block.parametersExpressions.map((expr) => builder.generateExpressionOld(expr)));
  let parametersProperties: string[] = [];
  if(block.type === 'internal') {
    parametersProperties.push('_falangGlobal,');
  }

  const returnName = block.returnExpression.text;
  const functionData = block.currentFunctionData;
  if (!functionData) throw new Error('Function data not found');

  for (let i = 0; i < block.parametersExpressions.length; i++) {
    const functionParameter = functionData.parameters[i];
    const expr = block.parametersExpressions[i];
    if (!functionParameter) {
      throw new Error(`Parameter at index ${i} not found for function ${functionData.name} (${functionData.schemeId})`);
    }
    let parameterValue = await builder.expr(expr.mathNode, functionParameter.type, block.context);
    /*if(functionParameter.type.type === 'struct' || functionParameter.type.type === 'array') {
      parameterValue = `JSON.parse(JSON.stringify(${parameterValue}))`;
    }*/
    parametersProperties.push(`${functionParameter.name}: ${parameterValue},`);
  }

  let functionCaller: string;
  if(block.type === 'internal') {
    functionCaller = functionData.name;
    await builder.importFunction(functionData);
  } else if(block.type === 'api') {
    const apiData = builder.project.getApiDataById(functionData.schemeId, functionData.iconId ?? '');
    if(!apiData) throw new Error('');
    functionCaller = `_falangGlobal.apis.${(apiData.schemeName ?? '')}.${(apiData.apiClassName ?? '')}.${(apiData.name)}`;
  } else {
    throw new Error(`Wrong block type: ${block.type}`);
  }

  if (functionData.returnValue.type !== 'void') {
    const variableExists = returnName in block.scopeVariables;
    const declarationPrefix = variableExists ? '' : 'let ';
    const declarationPostfix = variableExists ? '' : `: ${await builder.getFullTypeName(functionData.returnValue)}`;
    cb.p(`${declarationPrefix}${returnName}${declarationPostfix} = await ${functionCaller}({`);
    cb.indentPlus();
    parametersProperties.forEach((p) => cb.p(p));
    cb.indentMinus();
    cb.p('});');
  } else {
    cb.p(`await ${functionCaller}({`);
    cb.indentPlus();
    parametersProperties.forEach((p) => cb.p(p));
    cb.indentMinus();
    cb.p('});');
  }
}