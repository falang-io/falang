import * as math from "mathjs";
import { pi } from 'mathjs';
import { CycleIconStore } from '@falang/editor-scheme';
import { CodeBuilder } from '@falang/editor-scheme';
import { CallFunctionBlockStore } from '../../blocks/call-function/CallFunction.block.store';
import { FunctionHeaderBlockStore } from '../../blocks/function-header/FunctionHeader.block.store';
import { int32Type, TTypeInfo } from "../../constants";
import { getNodeVariableType } from "../../util/getNodeVariableType";
import { getSingleNodeType, getVariableNodeType } from "../../util/validateNode";
import { ILogicIconsBuilders, ISwitchIconBuilderOption } from "../interfaces"
import { hasParentCycle } from '../util/hasParentCycle';
import { castToNumber } from './convertSymbol';
import { RustLogicSchemeBuilder } from "./RustLogicSchemeBuilder"

export const rustLogicIconsBuilder = {
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
    await printRustCallFunction(params);
  },
  call_function: async (params) => {
    await printRustCallFunction(params);
  },
  create_var: async ({ block, cb, builder }) => {
    if (!block.variableType) {
      throw new Error('No variableType');
    }
    if(!block.expressionStore.expression.includes('=')) {
      cb.p(`let mut ${block.expressionStore.expression}: ${await builder.getFullTypeName(block.variableType)} = ${await builder.generateEmptyValue(block.variableType)};`);
      return;
    }
    //console.log('block context:', block.context);
    const finalExpression = await builder.generateExpressionOld(block.expressionStore, block.variableType, block.context);
    const arr = finalExpression.split('=');
    const leftValue = arr.shift()?.trim();
    if (!leftValue) throw new Error('Should be a value');
    const rightValue = arr.join('=');

    cb.p(`let mut ${leftValue}: ${await builder.getFullTypeName(block.variableType)} =${rightValue};`);
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
      //for (i, arg) in args.iter().enumerate() {
      cb.p(`for (${indexName}, ${itemName}) of ${arrName}.iter().enumerate() {`);
      cb.indentPlus();
      cb.p(`let ${itemName} = ${arrName}[${indexName}];`);
    } else {
      cb.p(`for ${itemName} in ${arrName}.iter() {`);
      cb.indentPlus();
    }
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeCycleBottomInfo({ builder, icon });
  },
  from_to_cycle: async ({ icon, block, cb, builder }) => {
    const itemName = block.itemExpression.expression;
    const fromName = `_${itemName}_from`;
    const toName = `_${itemName}_to`;
    cb.p(`let ${fromName}:i32 = ${await builder.generateExpression(block.fromExpression, int32Type, block.context)};`);
    cb.p(`let ${toName}:i32 = ${await builder.generateExpression(block.toExpression, int32Type, block.context)};`);
    cb.p(`for ${itemName} in ${fromName}..${toName}`);
    cb.openQuote();
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeCycleBottomInfo({ builder, icon });
  },
  function: async ({ icon, block, cb, builder, header }) => {
    const returnType = block.returnStore.get();
    builder.printBigComment(header.text);
    //await builder.importGlobal();
    const functionName = builder.scheme.name;
    const allFunctionParametersStrings: string[] = [];
    for (const parameter of block.parameters) {
      const vType = parameter.variableType;
      const name = parameter.nameStore.text;
      if(vType.type === 'array' || vType.type === 'struct') {
        allFunctionParametersStrings.push(`${name}: &${await builder.getFullTypeName(parameter.variableType)}`);
      } else {
        allFunctionParametersStrings.push(`${name}: ${await builder.getFullTypeName(parameter.variableType)}`);
      }
    }
    if(builder.hasApi) {
      allFunctionParametersStrings.push(`_apis: &mut dyn crate::falang::falang_global::Apis`);
    }
    cb.p(`pub fn ${functionName}(${allFunctionParametersStrings.join(', ')}) -> ${await builder.getFullTypeName(returnType)}`);
    cb.openQuote();
    if (returnType.type !== 'void') {
      cb.p(`let mut returnValue: ${await builder.getFullTypeName(returnType)} = ${await builder.generateEmptyValue(returnType)};`);
    }
    if (builder.cycleCompileInfo.hasBreaks) {
      cb.p(`let mut _break_level: i8 = 0;`);
    }
    if (builder.cycleCompileInfo.hasContinues) {
      cb.p(`let mut _continue_level: i8 = 0;`);
    }
    if (builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`let mut _switch_break: bool = false;`);
    }
    builder.stackBuilder();
    await builder.generateSkewer(icon.skewer);
    builder.addVariablesToFunction(builder.lastStackBuilder);
    builder.unstackBuilder();
    if (returnType.type !== 'void') {
      cb.p('returnValue');
    }
    cb.closeQuote();
  },
  if: async ({ icon, block, cb, builder }) => {
    const trueIcon = icon.trueOnRight ? icon.threads.icons[1] : icon.threads.icons[0];
    const falseIcon = icon.trueOnRight ? icon.threads.icons[0] : icon.threads.icons[1];
    const node = block.expressionStore.mathNode;
    if (!node) throw new Error(`No mathNode: ${block.id}`);
    if(math.isSymbolNode(node) || math.isAccessorNode(node)) {
      cb.p(`if ${await builder.expr(node, { type: 'boolean'}, block.context)} {`);
    } else {
      if (!math.isOperatorNode(node)) {
        throw new Error(`Not operator node: ${block.id}`);
      }
      const leftExpression = node.args[0].toString();
      const leftVariabbleType = getNodeVariableType(node.args[0], block.context, block.projectStore);
      if (!leftVariabbleType) {
        throw new Error(`No variable type: ${block.id}`);
      }
      let realOp: string = node.op;
      switch (node.op) {
        case 'and': realOp = '&&'; break;
        case 'or': realOp = '||'; break;
      }
      cb.p(`if ${leftExpression} ${realOp} ${await builder.expr(node.args[1], leftVariabbleType, block.context)} {`);
    }
    cb.indentPlus();
    await builder.generateSkewer(trueIcon.skewer);
    cb.indentMinus();
    cb.p('} else {');
    cb.indentPlus();
    await builder.generateSkewer(falseIcon.skewer);
    cb.closeQuote();
  },
  logic_external_apis: async ({ apis, cb, builder }) => {
    cb.p('// Nothing here');
    return;
    for (const apiData of apis) {
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `T${functionName}Params`
        await printRustBlockHeaderParamsInterface({
          functionName,
          builder,
          header: apiItem,
          isApi: true,
        });
      }
      const traitName = `${apiData.head.name.text}`;
      cb.p(`pub trait ${traitName}`);
      cb.openQuote();
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `I${functionName}Params`;
        let paramsString = apiItem.parameters.length ? `, params: ${paramsInterfaceName}` : '';
        const returnTypeName = await builder.getFullTypeName(apiItem.returnStore.get());
        cb.p(`fn ${apiItem.nameStore.text} (&self${paramsString}) -> ${returnTypeName};`);
      }
      cb.closeQuote();
    }
    cb.p(`pub struct ${builder.scheme.name} {`);
    cb.plus();
    for (const apiData of apis) {
      const className = `${apiData.head.name.text}`;
      cb.pp([`pub ${className}: ${className},`]);
    }
    cb.minus();
    cb.p('}');
  },
  logic_objects: async ({ objects, cb, builder }) => {
    for (const obj of objects) {
      cb.p('#[derive(Clone)]');
      cb.p(`pub struct ${obj.head.text} {`);
      cb.indentPlus();
      for (const item of obj.items) {
        cb.p(`pub ${item.name}: ${await builder.getFullTypeName(item.variableType)},`);
      }
      cb.closeQuote();
      cb.p(`impl ${obj.head.text} {`);
      cb.plus();
      cb.p(`pub fn new() -> ${obj.head.text} {`);
      cb.plus();
      cb.p(`${obj.head.text} {`);
      cb.plus();
      for (const item of obj.items) {
        if (!item.variableType) continue;
        cb.p(`${item.name}: ${await builder.generateEmptyValue(item.variableType)},`);
      }


      cb.closeQuote();
      cb.closeQuote();
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
    cb.p(`match ${await builder.expr(block.expressionStore.mathNode, { type: 'any' }, block.context)} {`);
    cb.plus();
    const generateOption = async (option: ISwitchIconBuilderOption) => {
      cb.openQuote();
      await builder.generateSkewer(option.skewer);
      cb.minus();
      cb.p('},');
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
      let continueOption = false;
      for (const option of options) {
        const values = option.head.enumSelectStore.selectedValues;
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
            cb.p(`\'${foundOption.value}\' => `);
          } else {
            cb.p(`${foundOption.value} => `);
          }
        }
        if(continueOption) continue;
        cb.openQuote();
        await builder.generateSkewer(option.skewer);
        cb.closeQuote();
      }
    } else {
      for (const option of options) {
        if(option.head.expressionStore.expression === 'default') {
          defaultOption = option;
        } else {
          cb.p(`${await builder.generateExpression(option.head.expressionStore, { type: 'any' }, block.context)} => `);
          await generateOption(option);
        }
      }
    }
    if(defaultOption) {
      cb.p('_ => ');
      await generateOption(defaultOption);
    } else {
      cb.p('_ => {},');
    }
    cb.closeQuote();
    if (hasParentCycle(icon) && builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`if _switch_break { break; }`);
    }
  },
  while: async ({ block, builder, cb, icon }) => {
    cb.p(`loop {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.indentMinus();
    const exclamation = icon.trueIsMain ? '' : '!';
    cb.p(`if ${exclamation}${await builder.expr(block.expressionStore.mathNode, { type: 'boolean' }, block.context)} { break; }`);
    cb.p(`}`);
    writeCycleBottomInfo({ builder, icon });
  },
  "pseudo-cycle": async ({ block, builder, cb, icon }) => {
    cb.p(`loop {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.p('break;');
    cb.indentMinus();
    cb.p(`}`);
    writeCycleBottomInfo({ builder, icon });
  },
  log: async ({ block, cb, builder }) => {
    let message = block.expression.slice(1, block.expression.length - 1);
    const matchResult = message.matchAll(/\{([a-zA-Z][a-zA-Z0-9\._]*)\}/g);
    const formatParams: string[] = [];
    for (const matchItem of matchResult) {
      message = message.replace(matchItem[0], '{}');
      formatParams.push(matchItem[1]);
    }
    if (formatParams.length) {
      cb.p(`println!("${message}", ${formatParams.join(', ')});`);
    } else {
      cb.p(`println!("${message}");`);
    }
  },
  arr_pop: async ({ block, cb }) => { 
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if(v.length) {
      cb.p(`let mut ${v} = ${a}.pop().unwrap();`);
    } else {
      cb.p(`${a}.pop();`);
    }    
  },
  arr_push: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    const expr = await builder.expr(block.variableExpr.mathNode, { type: 'array', elementType: { type: 'any'}, dimensions: 1}, block.context);
    cb.p(`${a}.push(${expr});`);   
  },
  arr_shift: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if(v.length) {
      cb.p(`let mut ${v} = ${a}.remove(0);`);
    } else {
      cb.p(`${a}.remove(0);`);
    }    
  },
  arr_splice: async () => { throw new Error('arr_splice not implemented') },
  arr_unshift: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    const expr = await builder.expr(block.variableExpr.mathNode, { type: 'array', elementType: { type: 'any'}, dimensions: 1}, block.context);
    cb.p(`${a}.insert(0, ${expr});`);
  },
} as const satisfies ILogicIconsBuilders<RustLogicSchemeBuilder>;



const printRustBlockHeaderParamsInterface = async ({
  functionName, header, builder, isApi
}: {
  functionName: string,
  header: FunctionHeaderBlockStore,
  builder: RustLogicSchemeBuilder,
  isApi: boolean
}) => {
  if(!header.parameters.length) return;
  const cb = builder.codeBuilder;
  const paramsInterfaceName = `I${functionName}Params`
  cb.p('#[derive(Clone)]');
  cb.p(`pub struct ${paramsInterfaceName} {`);
  cb.indentPlus();
  for (const parameter of header.parameters) {
    const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
    const name = parameter.nameStore.text;
    cb.p(`pub ${name}: ${parameterTypeName},`);
  }
  cb.closeQuote();
}

const printRustCallFunction = async ({ block, cb, builder, }: {
  block: CallFunctionBlockStore,
  cb: CodeBuilder,
  builder: RustLogicSchemeBuilder,
}) => {
  //const parameters: string[] = await Promise.all(block.parametersExpressions.map((expr) => builder.generateExpressionOld(expr)));
  let parametersProperties: string[] = [];

  const returnName = block.returnExpression.text;
  const functionData = block.currentFunctionData;
  if (!functionData) throw new Error('Function data not found');

  for (let i = 0; i < block.parametersExpressions.length; i++) {
    const functionParameter = functionData.parameters[i];
    const expr = block.parametersExpressions[i];
    if (!functionParameter) {
      throw new Error(`Parameter at index ${i} not found for function ${functionData.name} (${functionData.schemeId})`);
    }
    let pValue = await builder.expr(expr.mathNode, functionParameter.type, block.context);
    if(functionParameter.type.type === 'array' || functionParameter.type.type === 'struct') {
      pValue = `${pValue}.clone()`;
    }
    parametersProperties.push(`${functionParameter.name}: ${pValue},`);
  }
  //await builder.importFunction(functionData);
  let functionCaller: string;
  //let functionParameterName: string;
  const functionNamespace = await builder.getFileNameSpace(functionData.path);
  if(block.type === 'internal') {
    functionCaller = `${functionNamespace}::${functionData.name}`;
  } else if(block.type === 'api') {
    functionCaller = `_apis.${functionData.schemeName}_${functionData.apiClassName}_${functionData.name}`;
  } else {
    throw new Error(`Wrong block type: ${block.type}`);
  }
  let callerBefore = '';
  if(functionData.returnValue.type !== 'void') {
    const variableExists = returnName in block.scopeVariables;
    const declarationPrefix = variableExists ? '' : 'let mut ';
    const declarationPostfix = variableExists ? '' : `: ${await builder.getFullTypeName(functionData.returnValue)}`;
    callerBefore = `${declarationPrefix}${returnName}${declarationPostfix} = `;
  }
  const callFunctionParamsStrings: string[] = [];
  for (let i = 0; i < block.parametersExpressions.length; i++) {
    const functionParameter = functionData.parameters[i];
    const expr = block.parametersExpressions[i];
    if (!functionParameter) {
      throw new Error(`Parameter at index ${i} not found for function ${functionData.name} (${functionData.schemeId})`);
    }
    if(functionParameter.type.type === 'array' || functionParameter.type.type === 'struct') {
      callFunctionParamsStrings.push(`&${expr.mathNode?.toString()}`);
    } else {
      const pValue = await builder.expr(expr.mathNode, functionParameter.type, block.context);
      callFunctionParamsStrings.push(pValue);
    }
  }
  if(builder.hasApi && block.type === 'internal') {
    callFunctionParamsStrings.push('_apis');
  }
  cb.p(`${callerBefore}${functionCaller}(${callFunctionParamsStrings.join(', ')});`);
}

interface WriteCycleBottomInfoParams {
  builder: RustLogicSchemeBuilder,
  icon: CycleIconStore,
}
export const writeCycleBottomInfo = ({ builder, icon }: WriteCycleBottomInfoParams) => {
  const { codeBuilder: cb } = builder;
  if (!hasParentCycle(icon)) return;
  if (builder.cycleCompileInfo.hasBreaks) {
    cb.p(`if _break_level > 0 { _break_level-=1; break; }`);
  }
  if (builder.cycleCompileInfo.hasContinues) {
    cb.p(`if _continue_level > 1 { _continue_level-=1; break; }`);
    cb.p(`if _continue_level == 1 { _continue_level-=1; continue; }`);
  }
}
