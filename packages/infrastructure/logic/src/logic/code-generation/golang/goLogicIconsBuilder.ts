import * as math from "mathjs";
import { CycleIconStore } from '@falang/editor-scheme';
import { CodeBuilder } from '@falang/editor-scheme';
import { CallFunctionBlockStore } from '../../blocks/call-function/CallFunction.block.store';
import { FunctionHeaderBlockStore } from '../../blocks/function-header/FunctionHeader.block.store';
import { int32Type, TTypeInfo } from "../../constants";
import { getNodeReturnType } from '../../util/getNodeReturnType';
import { getNodeVariableType } from "../../util/getNodeVariableType";
import { ucfirst } from '../../util/ucfirst';
import { getSingleNodeType, getVariableNodeType } from "../../util/validateNode";
import { ILogicIconsBuilders, ISwitchIconBuilderOption } from "../interfaces"
import { hasParentCycle } from '../util/hasParentCycle';
import { GoLogicSchemeBuilder } from "./GoLogicSchemeBuilder"
import { ucfirstProps } from './util/ucfirstProps';

export const goLogicIconsBuilder = {
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
    builder.addVariableToFunctionIfInContext(rightValue)
    cb.p(`${ucfirstProps(leftValue || '')} = ${ucfirstProps(rightValue)};`);
  },
  call_api: async (params) => {
    await printGolangCallFunction(params);
  },
  call_function: async (params) => {
    await printGolangCallFunction(params);
  },
  create_var: async ({ block, cb, builder }) => {
    if (!block.variableType) {
      throw new Error('No variableType');
    }
    if(!block.expressionStore.expression.includes('=')) {
      if(block.variableType.type === 'struct') {
        cb.p(`${block.expressionStore.expression} := ${await builder.generateEmptyValue(block.variableType)};`);
      } else {
        cb.p(`var ${block.expressionStore.expression} ${await builder.getFullTypeName(block.variableType)} = ${await builder.generateEmptyValue(block.variableType)};`);
      }
      return;
    }
    const finalExpression = await builder.generateExpressionOld(block.expressionStore, block.variableType, block.context);
    const arr = finalExpression.split('=');
    const leftValue = arr.shift()?.trim();
    if (!leftValue) throw new Error('Should be a value');
    const rightValue = arr.join('=');

    cb.p(`var ${leftValue} ${await builder.getFullTypeName(block.variableType)} =${rightValue};`);
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
    const arrName = ucfirstProps(block.arrExpression.expression);
    builder.addVariableToFunctionIfInContext(arrName);
    const itemName = block.itemExpression.expression;
    cb.p(`for ${indexName.length ? indexName : '_'}, ${itemName} := range ${arrName} {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeCycleBottomInfo({ builder, icon });
  },
  from_to_cycle: async ({ icon, block, cb, builder }) => {
    //for i := _i_from; i < _i_to; i++ {
    const itemName = block.itemExpression.expression;
    const fromName = `_${itemName}_from`;
    const toName = `_${itemName}_to`;
    cb.p(`var ${fromName} int32 = ${await builder.generateExpression(block.fromExpression, int32Type, block.context)};`);
    cb.p(`var ${toName} int32 = ${await builder.generateExpression(block.toExpression, int32Type, block.context)};`);
    cb.p(`for ${itemName} := ${fromName}; ${itemName} < ${toName}; ${itemName}++ {`);
    cb.plus();
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeCycleBottomInfo({ builder, icon });
  },
  function: async ({ icon, block, cb, builder, header }) => {
    const returnType = block.returnStore.get();
    builder.printBigComment(header.text);
    await builder.importGlobal();
    //const functionName = builder.scheme.name;
    const functionName = builder.scheme.name[0].toUpperCase().concat(builder.scheme.name.slice(1));
    const paramsInterfaceName = `I${builder.scheme.name}Params`
    await printGolangBlockHeaderParamsInterface({
      functionName: builder.scheme.name,
      builder,
      header: block,
      isApi: false,
    });
    cb.p(`func ${functionName}(params ${paramsInterfaceName}) ${await builder.getFullTypeName(returnType)} {`);
    cb.plus();
    /*for(const pName of parametersNames) {
      cb.p(`var ${pName} = params.${pName}`);
    }*/
    if (returnType.type !== 'void') {
      cb.p(`var returnValue ${await builder.getFullTypeName(returnType)} = ${await builder.generateEmptyValue(returnType)};`);
    }
    if (builder.cycleCompileInfo.hasBreaks) {
      cb.p(`var _break_level int8 = 0;`);
    }
    if (builder.cycleCompileInfo.hasContinues) {
      cb.p(`var _continue_level int8 = 0;`);
    }
    if (builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`var _switch_break bool = false;`);
    }
    builder.stackBuilder();
    await builder.generateSkewer(icon.skewer);
    builder.addVariablesToFunction(builder.lastStackBuilder);
    builder.unstackBuilder();
    if (returnType.type !== 'void') {
      cb.p('return returnValue');
    }
    cb.closeQuote();
  },
  if: async ({ icon, block, cb, builder }) => {
    const trueIcon = icon.trueOnRight ? icon.threads.icons[1] : icon.threads.icons[0];
    const falseIcon = icon.trueOnRight ? icon.threads.icons[0] : icon.threads.icons[1];
    const node = block.expressionStore.mathNode;
    if(!node) throw new Error(`No mathNode: ${block.id}`);
    if(math.isSymbolNode(node) || math.isAccessorNode(node)) {
      cb.p(`if ${await builder.expr(node, { type: 'boolean'}, block.context)} {`);
    } else {
      if(!math.isOperatorNode(node)) {
        throw new Error(`Not operator node: ${block.id}`);
      }
      const leftExpression = ucfirstProps(node.args[0].toString());
      const leftVariabbleType = getNodeVariableType(node.args[0], block.context, block.projectStore);
      if(!leftVariabbleType) {
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
    for (const apiData of apis) {
      for (const apiItem of apiData.items) {
        //if (!apiItem.parameters.length) continue;
        const functionName = apiItem.nameStore.text;
        await printGolangBlockHeaderParamsInterface({
          functionName,
          builder,
          header: apiItem,
          isApi: true,
        });
      }
      const traitName = `${apiData.head.name.text}`;
      cb.p(`type ${traitName} interface {`);
      cb.plus();
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `I${functionName}Params`;
        const returnTypeName = await builder.getFullTypeName(apiItem.returnStore.get());
        cb.p(`${ucfirst(functionName)}(params ${paramsInterfaceName}) ${returnTypeName};`);
      }
      cb.closeQuote();
    }
    const relativePathArray = await builder.project.getSchemeRelativePathArray(builder.path);
    const namespaceName = `Falang_${relativePathArray.join('_')}`;
    cb.p(`type ${await builder.getPackageName()} struct {`);
    cb.plus();
    for (const apiData of apis) {
      const className = `${apiData.head.name.text}`;
      cb.pp([`${className} ${className};`]);
    }
    cb.minus();
    cb.p('}');
  },
  logic_objects: async ({ objects, cb, builder }) => {
    for (const obj of objects) {
      cb.p(`type ${(obj.head.text)} struct {`);
      cb.indentPlus();
      for (const item of obj.items) {
        cb.p(`${ucfirst(item.name)} ${await builder.getFullTypeName(item.variableType)}`);
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
    cb.p(`switch ${await builder.expr(block.expressionStore.mathNode, { type: 'any' }, block.context)} {`);
    cb.plus();
    const generateOption = async (option: ISwitchIconBuilderOption) => {
      cb.openQuote();
      await builder.generateSkewer(option.skewer);
      cb.closeQuote();
    }
    let defaultOption: ISwitchIconBuilderOption | null = null;
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
  },
  while: async ({ block, builder, cb, icon }) => {
    cb.p(`for {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.indentMinus();
    const exclamation = icon.trueIsMain ? '' : '!';
    cb.p(`if ${exclamation}${await builder.expr(block.expressionStore.mathNode, { type: 'boolean' }, block.context)} { break; }`);
    cb.p(`}`);
    writeCycleBottomInfo({ builder, icon });
  },
  "pseudo-cycle": async ({ block, builder, cb, icon }) => {
    cb.p(`do {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.indentMinus();
    cb.p(`} while (false);`);
    writeCycleBottomInfo({ builder, icon });
  },
  log: async ({ block, cb, builder }) => {
    let message = block.expression.slice(1, block.expression.length - 1);
    const matchResult = message.matchAll(/\{([a-zA-Z][a-zA-Z0-9\._]*)\}/g);
    let wasFmt = false;
    for(const matchItem of matchResult) {
      message = message.replace(matchItem[0], `"+fmt.Sprintf("%v",${ucfirstProps(matchItem[1])})+"`);
      wasFmt = true;
    }
    builder.addImport('fmt');
    cb.p(`fmt.Println("${message}");`);  
  },
  arr_pop: async ({ block, cb, builder }) => { 
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    builder.addVariableToFunctionIfInContext(a);
    if(v.length) {
      cb.p(`var ${ucfirstProps(v)} = ${ucfirstProps(a)}[len(${ucfirstProps(a)})-1]`);
    }
    cb.p(`${ucfirstProps(a)} = ${ucfirstProps(a)}[:len(${ucfirstProps(a)})-1]`);   
  },
  arr_push: async ({ block, cb, builder }) => { 
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    builder.addVariableToFunctionIfInContext(a);
    cb.p(`${ucfirstProps(a)} = append(${ucfirstProps(a)}, ${ucfirstProps(v)})`);
  },
  arr_shift: async ({ block, cb, builder }) => { 
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    builder.addVariableToFunctionIfInContext(a);
    if(v.length) {
      cb.p(`var ${ucfirstProps(v)} = ${ucfirstProps(a)}[0]`);  
    }
    cb.p(`${ucfirstProps(a)} = ${ucfirstProps(a)}[1:]`);
  },
  arr_splice: async () => { throw new Error('arr_splice not implemented') },
  arr_unshift: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const aType = getVariableNodeType(a, block.context, block.projectStore);
    builder.addVariableToFunctionIfInContext(a);
    if(aType?.type !== 'array') throw new Error(`Should be array type: ${block.arrExpr.expression}`);
    const arrayItemType = await builder.getFullTypeName(aType.elementType);
    const v = ucfirstProps(block.variableExpr.expression);
    cb.p(`${ucfirstProps(a)} = append([]${arrayItemType}{${v}}, ${ucfirstProps(a)}...)`);
  },
} as const satisfies ILogicIconsBuilders<GoLogicSchemeBuilder>;

const printGolangBlockHeaderParamsInterface = async ({
  functionName, header, builder, isApi
}: {
  functionName: string,
  header: FunctionHeaderBlockStore,
  builder: GoLogicSchemeBuilder,
  isApi: boolean
}) => {
  const cb = builder.codeBuilder;
  const paramsInterfaceName = `I${functionName}Params`
  cb.p(`type ${paramsInterfaceName} struct {`);
  cb.indentPlus();
  for (const parameter of header.parameters) {
    const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
    cb.p(`${ucfirst(parameter.nameStore.text)} ${parameterTypeName}`);
  }
  if(!isApi) {
    cb.p('FalangGlobal falang_global.FalangGlobal');
  }
  cb.closeQuote();
  /*const cbh = builder.hb;
  const cb = (!isApi) ? builder.codeBuilder : undefined;
  const paramsInterfaceName = `I${functionName}Params`
  cbh.pp([`struct ${paramsInterfaceName} {`], cb);
  cbh.indentPlus(cb);
  if(!isApi) {
    cbh.pp(['FalangGlobal::FalangGlobal _falangGlobal;'], cb);
  }
  for (const parameter of header.parameters) {
    const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
    cbh.pp([`${parameterTypeName} ${parameter.nameStore.text};`], cb);
  }
  cbh.indentMinus(cb);
  cbh.pp(['};'], cb);*/
}

const printGolangCallFunction = async ({ block, cb, builder, }: {
  block: CallFunctionBlockStore,
  cb: CodeBuilder,
  builder: GoLogicSchemeBuilder,
}) => {
    let parametersProperties: string[] = [];
    if(block.type === 'internal') {
      parametersProperties.push('FalangGlobal: FalangGlobal,');
      builder.addGlobalVariableToFunction();
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
      parametersProperties.push(`${ucfirst(functionParameter.name)}: ${await builder.expr(expr.mathNode, functionParameter.type, block.context)},`);
    }

    await builder.importFunction(functionData);
    const { name } = functionData;
    const functionName = functionData.name;

    let functionCaller: string;
    let parameterName: string;
    if(block.type === 'internal') {
      functionCaller = `${functionName}.${ucfirst(functionName)}`;
      parameterName = `${functionName}.I${name}Params`;
    } else if(block.type === 'api') {
      functionCaller = `params.FalangGlobal.Apis.${ucfirst(functionData.schemeName ?? '')}.${ucfirst(functionData.apiClassName ?? '')}.${ucfirst(functionName)}`;
      parameterName = `${functionData.schemeName}.I${name}Params`;
    } else {
      throw new Error(`Wrong block type: ${block.type}`);
    }
    if (functionData.returnValue.type !== 'void') {
      const variableExists = returnName in block.scopeVariables;
      const declarationPrefix = variableExists ? '' : 'var ';
      const declarationPostfix = variableExists ? '' : ` ${await builder.getFullTypeName(functionData.returnValue)}`;      
      cb.p(`${declarationPrefix}${returnName}${declarationPostfix} = ${functionCaller}(${parameterName}{`);
      cb.indentPlus();
      parametersProperties.forEach((p) => cb.p(p));
      cb.indentMinus();
      cb.p('});');
    } else {
      cb.p(`${functionCaller}(${parameterName}{`);
      cb.indentPlus();
      parametersProperties.forEach((p) => cb.p(p));
      cb.indentMinus();
      cb.p('});');
    }
}


interface WriteCycleBottomInfoParams {
  builder: GoLogicSchemeBuilder,
  icon: CycleIconStore,
}
const writeCycleBottomInfo = ({ builder, icon }: WriteCycleBottomInfoParams) => {
  const { codeBuilder: cb } = builder;
  if (!hasParentCycle(icon)) return;
  if (builder.cycleCompileInfo.hasBreaks) {
    cb.p(`if (_break_level > 0) { _break_level--; break; }`);
  }
  if (builder.cycleCompileInfo.hasContinues) {
    cb.p(`if (_continue_level > 1) { _continue_level--; break; }`);
    cb.p(`if (_continue_level == 1) { _continue_level--; continue; }`);
  }
}
