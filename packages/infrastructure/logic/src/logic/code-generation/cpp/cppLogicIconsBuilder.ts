import * as math from "mathjs";
import { CycleIconStore } from '@falang/editor-scheme';
import { CodeBuilder } from '@falang/editor-scheme';
import { CallFunctionBlockStore } from '../../blocks/call-function/CallFunction.block.store';
import { FunctionHeaderBlockStore } from '../../blocks/function-header/FunctionHeader.block.store';
import { int32Type } from "../../constants";
import { getNodeReturnType } from '../../util/getNodeReturnType';
import { getNodeVariableType } from "../../util/getNodeVariableType";
import { getSingleNodeType } from "../../util/validateNode";
import { ILogicIconsBuilders, ISwitchIconBuilderOption } from "../interfaces"
import { hasParentCycle } from '../util/hasParentCycle';
import { CppLogicSchemeBuilder } from "./CppLogicSchemeBuilder"

export const cppLogicIconsBuilder = {
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
    await printCppCallFunction(params);
  },
  call_function: async (params) => {
    await printCppCallFunction(params);
  },
  create_var: async ({ block, cb, builder }) => {
    if (!block.variableType) {
      throw new Error('No variableType');
    }
    if (!block.expressionStore.expression.includes('=')) {
      cb.p(`${await builder.getFullTypeName(block.variableType)} ${block.expressionStore.expression};`);
      return;
    }
    const finalExpression = await builder.generateExpressionOld(block.expressionStore, block.variableType, block.context);
    const arr = finalExpression.split('=');
    if (arr.length === 1) {
      cb.p(`${await builder.getFullTypeName(block.variableType)} ${arr[0]};`);
      return;
    }
    const leftValue = arr.shift()?.trim();
    if (!leftValue) throw new Error('Should be a value');
    const rightValue = arr.join('=');

    cb.p(`${await builder.getFullTypeName(block.variableType)} ${leftValue} =${rightValue};`);
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
    const arrName = block.arrExpression.expression;
    const itemName = block.itemExpression.expression;
    const indexName = block.indexExpression.expression.length ? block.indexExpression.expression : `${itemName}_index`;
    const mathNode = block.arrExpression.mathNode;
    if (!mathNode) throw new Error(`Should be mathNode`);
    const arrType = getNodeReturnType({ node: mathNode, context: block.context, projectStore: block.projectStore });
    if (arrType.type !== 'array') throw new Error(`${block.arrExpression.expression} should be array`);
    const arrItemType = await builder.getFullTypeName(arrType.elementType);
    cb.p(`for (int ${indexName} = 0; ${indexName} < ${arrName}.size(); ${indexName}++) {`);
    cb.indentPlus();
    cb.p(`${arrItemType} ${itemName} = ${arrName}[${indexName}];`);
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeCycleBottomInfo({ builder, icon });
  },
  from_to_cycle: async ({ icon, block, cb, builder }) => {
    const itemName = block.itemExpression.expression;
    const fromName = `_${itemName}_from`;
    const toName = `_${itemName}_to`;
    cb.p(`int ${fromName} = ${await builder.generateExpression(block.fromExpression, int32Type, block.context)};`);
    cb.p(`int ${toName} = ${await builder.generateExpression(block.toExpression, int32Type, block.context)};`);
    cb.p(`for (int ${itemName} = ${fromName}; ${itemName} < ${toName}; ${itemName}++) {`);
    cb.indentPlus();
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeCycleBottomInfo({ builder, icon });
  },
  function: async ({ icon, block, cb, builder, header }) => {
    const returnType = block.returnStore.get();
    builder.printBigComment(header.text);
    await builder.importGlobal();
    const functionName = builder.scheme.name;
    await printCppBlockHeaderParamsInterface({
      functionName,
      builder,
      header: block,
      isApi: false,
    });
    const paramsInterfaceName = `I${functionName}Params`;
    /*const paramsInterfaceName = `I${functionName}Params`
    cb.pp([`struct ${paramsInterfaceName} {`], builder.hb);
    cb.indentPlus(builder.hb);
    const parametersNames: string[] = [];
    cb.pp(['FalangGlobal::FalangGlobal _falangGlobal;'], builder.hb);
    for (const parameter of block.parameters) {
      const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
      cb.pp([`${parameterTypeName} ${parameter.nameStore.text};`], builder.hb);
      parametersNames.push(parameter.nameStore.text);
    }
    cb.indentMinus(builder.hb);
    cb.pp(['};'], builder.hb);*/
    //cb.p(`pub fn ${functionName}(${paramsInterfaceName} { ${parametersNames.join(', ')} }: ${paramsInterfaceName}) -> ${await builder.getFullTypeName(returnType)}`);
    cb.p(`${await builder.getFullTypeName(returnType)} ${functionName}(${paramsInterfaceName} params)`);
    builder.hb.p(`${await builder.getFullTypeName(returnType)} ${functionName}(${paramsInterfaceName} params);`);
    cb.openQuote();
    for (const parameter of block.parameters) {
      const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
      cb.p(`${parameterTypeName} ${parameter.nameStore.text} = params.${parameter.nameStore.text};`);
    }
    cb.p('FalangGlobal::FalangGlobal _falangGlobal = params._falangGlobal;');
    if (returnType.type !== 'void') {
      cb.p(`${await builder.getFullTypeName(returnType)} returnValue;`);
    }
    if (builder.cycleCompileInfo.hasBreaks) {
      cb.p(`int _break_level = 0;`);
    }
    if (builder.cycleCompileInfo.hasContinues) {
      cb.p(`int _continue_level = 0;`);
    }
    if (builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`bool _switch_break = false;`);
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
    const node = block.expressionStore.mathNode;
    if (!node) throw new Error(`No mathNode: ${block.id}`);
    if(math.isSymbolNode(node) || math.isAccessorNode(node)) {
      cb.p(`if (${await builder.expr(node, { type: 'boolean'}, block.context)}) {`);
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
  
      cb.p(`if (${leftExpression} ${realOp} ${await builder.expr(node.args[1], leftVariabbleType, block.context)}) {`);
    }

    cb.indentPlus();
    await builder.generateSkewer(trueIcon.skewer);
    cb.indentMinus();
    cb.p('} else {');
    cb.indentPlus();
    await builder.generateSkewer(falseIcon.skewer);
    cb.closeQuote();
  },
  logic_external_apis: async ({ apis, cb, builder, block }) => {
    const hb = builder.hb;
    for (const apiData of apis) {
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        await printCppBlockHeaderParamsInterface({
          functionName,
          builder,
          header: apiItem,
          isApi: true,
        });
        /*const paramsInterfaceName = `T${functionName}Params`
        cb.p(`pub struct ${paramsInterfaceName} {`);        
        cb.indentPlus();
        cb.p('pub _falangGlobal: FalangGlobal,');
        const parametersNames: string[] = [];
        for (const parameter of apiItem.parameters) {
          const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
          cb.p(`${parameter.nameStore.text}: ${parameterTypeName};`);
          parametersNames.push(parameter.nameStore.text);
        }
        cb.closeQuote();*/
      }
      const className = `${apiData.head.name.text}`;
      hb.pp([`class ${className}_Class`]);
      hb.openQuote();
      hb.pp(['public:']);
      hb.indentPlus();
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `I${functionName}Params`;
        const returnTypeName = await builder.getFullTypeName(apiItem.returnStore.get());
        hb.pp([`virtual ${returnTypeName} ${apiItem.nameStore.text} (${paramsInterfaceName} params) = 0;`]);
      }
      hb.indentMinus();
      hb.indentMinus();
      hb.pp(['};']);
    }
    const relativePathArray = await builder.project.getSchemeRelativePathArray(builder.path);
    const namespaceName = `Falang_${relativePathArray.join('_')}`;
    hb.p(`struct ${namespaceName}_Class {`);
    hb.plus();
    for (const apiData of apis) {
      const className = `${apiData.head.name.text}`;
      hb.pp([`${className}_Class *${className};`]);
    }
    hb.minus();
    hb.p('};');
  },
  logic_objects: async ({ objects, cb, builder }) => {
    const hb = builder.hb;
    for (const obj of objects) {
      hb.pp([`struct ${obj.head.text} {`]);
      hb.indentPlus();
      for (const item of obj.items) {
        hb.pp([`${await builder.getFullTypeName(item.variableType)} ${item.name};`]);
      }
      hb.indentMinus();
      hb.pp(['};']);
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
      cb.p(`_switch_break = 0;`);
    }
    cb.p(`switch (${await builder.expr(block.expressionStore.mathNode, { type: 'any' }, block.context)}) {`);
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
        if (option.head.expressionStore.expression === 'default') {
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
    const formatParams: string[] = [];
    for (const matchItem of matchResult) {
      message = message.replace(matchItem[0], `" << ${matchItem[1]} << "`);
      formatParams.push(matchItem[1]);
    }
    builder.addImport('#include <stdlib.h>');
    if (formatParams.length) {
      builder.addImport("#include <iostream>");
      builder.addImport("#include <sstream>");
      builder.addImport("#include <string>");
      const variableIndex = builder.getNextLogVariableIndex();
      const logVariableName = `_logStream${variableIndex}`;
      const stringVariableName = `${logVariableName}str`;
      cb.p(`std::stringstream ${logVariableName};`);
      cb.p(`${logVariableName} << "${message}";`);
      cb.p(`std::string ${stringVariableName} = ${logVariableName}.str();`);
      //std::stringstream s;
      cb.p(`std::cout << ${stringVariableName} << std::endl;`);
    } else {
      cb.p(`std::cout << "${message}" << std::endl;`);
    }
  },
  arr_pop: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if (v.length) cb.p(`auto ${v} = ${a}[${a}.size() - 1];`);
    cb.p(`${a}.pop_back();`);
  },
  arr_push: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    cb.p(`${a}.push_back(${v});`);
  },
  arr_shift: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if (v.length) {
      cb.p(`auto ${v} = ${a}[0];`);
    }
    cb.p(`${a}.erase(${a}.begin());`);
  },
  arr_splice: async () => { throw new Error('arr_splice not implemented') },
  arr_unshift: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    cb.p(`${a}.insert(${a}.begin(),${v});`);
  },
} as const satisfies ILogicIconsBuilders<CppLogicSchemeBuilder>;

const printCppBlockHeaderParamsInterface = async ({
  functionName, header, builder, isApi
}: {
  functionName: string,
  header: FunctionHeaderBlockStore,
  builder: CppLogicSchemeBuilder,
  isApi: boolean
}) => {
  const cbh = builder.hb;
  const cb = (!isApi) ? builder.codeBuilder : undefined;
  const paramsInterfaceName = `I${functionName}Params`
  cbh.pp([`struct ${paramsInterfaceName} {`], cb);
  cbh.indentPlus(cb);
  if (!isApi) {
    cbh.pp(['FalangGlobal::FalangGlobal _falangGlobal;'], cb);
  }
  for (const parameter of header.parameters) {
    const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
    cbh.pp([`${parameterTypeName} ${parameter.nameStore.text};`], cb);
  }
  cbh.indentMinus(cb);
  cbh.pp(['};'], cb);
}

const printCppCallFunction = async ({ block, cb, builder, }: {
  block: CallFunctionBlockStore,
  cb: CodeBuilder,
  builder: CppLogicSchemeBuilder,
}) => {
  //const parameters: string[] = await Promise.all(block.parametersExpressions.map((expr) => builder.generateExpressionOld(expr)));
  const parametersProperties: string[] = [];
  if (block.type === 'internal') {
    parametersProperties.push('params._falangGlobal,');
  }

  const returnName = block.returnExpression.text;
  const functionData = block.currentFunctionData;
  if (!functionData) throw new Error('Function data not found');

  const functionNamespace = await builder.getFileNamespace(functionData.path);
  for (let i = 0; i < block.parametersExpressions.length; i++) {
    const functionParameter = functionData.parameters[i];
    const expr = block.parametersExpressions[i];
    if (!functionParameter) {
      throw new Error(`Parameter at index ${i} not found for function ${functionData.name} (${functionData.schemeId})`);
    }
    parametersProperties.push(`${await builder.expr(expr.mathNode, functionParameter.type, block.context)},`);
  }

  await builder.importFunction(functionData);
  const { name: functionName } = functionData;
  cb.p(`${functionNamespace}::I${functionName}Params ${functionName}Params = {`);
  cb.indentPlus();
  parametersProperties.forEach((p) => cb.p(p));
  cb.indentMinus();
  cb.p('};');
  let functionCaller: string;
  if (block.type === 'internal') {
    functionCaller = `${functionNamespace}::${functionData.name}`;
  } else if (block.type === 'api') {
    functionCaller = `(*params._falangGlobal.apis.${functionData.schemeName}.${functionData.apiClassName}).${functionData.name}`;
  } else {
    throw new Error(`Wrong block type: ${block.type}`);
  }
  if (functionData.returnValue.type !== 'void') {
    const variableExists = returnName in block.scopeVariables;
    const declarationPrefix = variableExists ? '' : `${await builder.getFullTypeName(functionData.returnValue)} `;

    cb.p(`${declarationPrefix}${returnName} = ${functionCaller}(${functionName}Params);`);
  } else {
    cb.p(`${functionCaller}(${functionName}Params);`);
  }
}

interface WriteCycleBottomInfoParams {
  builder: CppLogicSchemeBuilder,
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
