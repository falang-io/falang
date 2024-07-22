import * as math from "mathjs";
import { CycleIconStore } from '@falang/editor-scheme';
import { CodeBuilder } from '@falang/editor-scheme';
import { CallFunctionBlockStore } from '../../blocks/call-function/CallFunction.block.store';
import { FunctionHeaderBlockStore } from '../../blocks/function-header/FunctionHeader.block.store';
import { int32Type, TTypeInfo } from "../../constants";
import { getNodeVariableType } from "../../util/getNodeVariableType";
import { getSingleNodeType, getVariableNodeType } from "../../util/validateNode";
import { ILogicIconsBuilders, ISwitchIconBuilderOption } from "../interfaces"
import { hasParentCycle } from '../util/hasParentCycle';
import { getFullTypeName } from './getFullTypeName';
import { SharpLogicSchemeBuilder } from "./SharpLogicSchemeBuilder"

export const sharpLogicIconsBuilder = {
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
    cb.p(`${leftValue} = (${await builder.getFullTypeName(block.variableType)})${rightValue};`);
  },
  call_api: async (params) => {
    await printSharpCallFunction(params);
  },
  call_function: async (params) => {
    await printSharpCallFunction(params);
  },
  create_var: async ({ block, cb, builder }) => {
    if (!block.variableType) {
      throw new Error('No variableType');
    }
    if (!block.expressionStore.expression.includes('=')) {
      cb.p(`${await builder.getFullTypeName(block.variableType)} ${block.expressionStore.expression} = ${await builder.generateEmptyValue(block.variableType)};`);
      return;
    }
    const finalExpression = await builder.generateExpressionOld(block.expressionStore, block.variableType, block.context);
    const arr = finalExpression.split('=');
    const leftValue = arr.shift()?.trim();
    if (!leftValue) throw new Error('Should be a value');
    const rightValue = arr.join('=');
    const vType = await builder.getFullTypeName(block.variableType);
    cb.p(`${vType} ${leftValue} = ${rightValue.trim()};`);
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
      cb.p(`for (int ${indexName} = 0; ${indexName} < ${arrName}.length; ${indexName}++) {`);
      cb.indentPlus();
      cb.p(`var ${itemName} = ${arrName}[${indexName}];`);
    } else {
      cb.p(`foreach (var ${itemName} in ${arrName}) {`);
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
    cb.p(`int ${fromName} = ${await builder.generateExpression(block.fromExpression, int32Type, block.context)};`);
    cb.p(`int ${toName} = ${await builder.generateExpression(block.toExpression, int32Type, block.context)};`);
    cb.p(`for (int ${itemName} = ${fromName}; ${itemName} < ${toName}; ${itemName}++)`);
    cb.openQuote();
    await builder.generateSkewer(icon.skewer);
    cb.closeQuote();
    writeCycleBottomInfo({ builder, icon });
  },
  function: async ({ icon, block, cb, builder, header }) => {
    const returnType = block.returnStore.get();
    builder.printBigComment(header.text);
    await builder.importGlobal();
    const functionName = builder.scheme.name;
    const paramsInterfaceName = `I${functionName}Params`
    await printSharpBlockHeaderParamsInterface({
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
    cb.p('public class MethodClass');
    cb.openQuote();
    cb.p(`public static ${await builder.getFullTypeName(returnType)} ${functionName}(${paramsInterfaceName} _params)`);
    cb.openQuote();
    for (const pname of parametersNames) {
      cb.p(`var ${pname} = _params.${pname};`);
    }

    if (returnType.type !== 'void') {
      cb.p(`${await builder.getFullTypeName(returnType)} returnValue = ${await builder.generateEmptyValue(returnType)};`);
    }
    if (builder.cycleCompileInfo.hasBreaks) {
      cb.p(`short _break_level = 0;`);
    }
    if (builder.cycleCompileInfo.hasContinues) {
      cb.p(`short _continue_level = 0;`);
    }
    if (builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`bool _switch_break = false;`);
    }
    builder.stackBuilder();
    await builder.generateSkewer(icon.skewer);
    builder.unstackBuilder();
    if (returnType.type !== 'void') {
      cb.p('return returnValue;');
    }
    cb.closeQuote();
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
  logic_external_apis: async ({ apis, cb, builder }) => {
    for (const apiData of apis) {
      for (const apiItem of apiData.items) {
        //if (!apiItem.parameters.length) continue;
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `T${functionName}Params`
        await printSharpBlockHeaderParamsInterface({
          functionName,
          builder,
          header: apiItem,
          isApi: true,
        });
      }
      const traitName = `${apiData.head.name.text}`;
      cb.p(`public interface ${traitName}`);
      cb.openQuote();
      for (const apiItem of apiData.items) {
        const functionName = apiItem.nameStore.text;
        const paramsInterfaceName = `I${functionName}Params`;
        const returnTypeName = await builder.getFullTypeName(apiItem.returnStore.get());
        cb.p(`${returnTypeName} ${apiItem.nameStore.text}(${paramsInterfaceName} _params);`);
      }
      cb.closeQuote();
    }
    cb.p(`public class ${builder.scheme.name} {`);
    cb.plus();
    for (const apiData of apis) {
      const className = `${apiData.head.name.text}`;
      cb.pp([`public required ${className} ${className};`]);
    }
    cb.minus();
    cb.p('}');
  },
  logic_objects: async ({ objects, cb, builder }) => {
    for (const obj of objects) {
      const name = obj.head.text;
      cb.p(`public class ${name} {`);
      cb.indentPlus();
      for (const item of obj.items) {
        if (!item.variableType) throw new Error(`${item.name} should have variableType`);
        cb.p(`public ${await builder.getFullTypeName(item.variableType)} ${item.name} = ${await builder.generateEmptyValue(item.variableType)};`);
      }
      cb.p(`public ${name} Clone() {`);
      cb.plus();
      cb.p(`return new ${name}() {`);
      cb.plus();
      for (const item of obj.items) {
        if (!item.variableType) throw new Error(`${item.name} should have variableType`);
        switch (item.variableType.type) {
          case 'array':
            switch (item.variableType.elementType.type) {
              case 'struct':
                cb.p(`${item.name} = this.${item.name}.Select(child => child.Clone()).ToList(),`);
                break;
              default:
                const elementTypeName = await builder.getFullTypeName(item.variableType.elementType);
                cb.p(`${item.name} = new System.Collections.Generic.List<${elementTypeName}>(this.${item.name}),`);
            }
            break;
          case 'struct':
            cb.p(`${item.name} = this.${item.name}.Clone(),`);
            break;
          default:
            cb.p(`${item.name} = this.${item.name},`);
        }
      }
      cb.minus();
      cb.p('};');
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
      cb.p('break;');
    }
    cb.closeQuote();
    if (hasParentCycle(icon) && builder.cycleCompileInfo.hasSwitchBreaks) {
      cb.p(`if (_switch_break) { break; }`);
    }
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
    cb.p(`Console.WriteLine($"${message}");`);
  },
  arr_pop: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if (v.length) {
      const aType = block.arrExpr.variableType;
      if (aType?.type !== 'array') throw new Error(`${a} should be array`);
      const tName = await builder.getFullTypeName(aType.elementType);
      cb.p(`${tName} ${v} = ${a}[${a}.Count - 1];`);
    }
    cb.p(`${a}.RemoveAt(${a}.Count - 1);`);
  },
  arr_push: async ({ block, cb }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    cb.p(`${a}.Add(${v});`);
  },
  arr_shift: async ({ block, cb, builder }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    if (v.length) {
      const aType = block.arrExpr.variableType;
      if (aType?.type !== 'array') throw new Error(`${a} should be array`);
      const tName = await builder.getFullTypeName(aType.elementType);
      cb.p(`${tName} ${v} = ${a}[0];`);
    }
    cb.p(`${a}.RemoveAt(0);`);
  },
  arr_splice: async () => { throw new Error('arr_splice not implemented') },
  arr_unshift: async ({ block, cb }) => {
    const a = block.arrExpr.expression;
    const v = block.variableExpr.expression;
    cb.p(`${a}.Insert(0, ${v});`);
  },
} as const satisfies ILogicIconsBuilders<SharpLogicSchemeBuilder>;


const printSharpBlockHeaderParamsInterface = async ({
  functionName, header, builder, isApi
}: {
  functionName: string,
  header: FunctionHeaderBlockStore,
  builder: SharpLogicSchemeBuilder,
  isApi: boolean
}) => {
  const paramsInterfaceName = `I${functionName}Params`
  const cb = builder.codeBuilder;
  cb.p(`public class ${paramsInterfaceName} {`);
  cb.indentPlus();
  for (const parameter of header.parameters) {
    const parameterTypeName = await builder.getFullTypeName(parameter.variableType);
    cb.p(`public required ${parameterTypeName} ${parameter.nameStore.text} { get; set; }`);
  }
  if(!isApi) {
    cb.p('public required Falang.Global.FalangGlobal _falangGlobal { get; set; }');
  }
  

  cb.closeQuote();
}

const printSharpCallFunction = async ({ block, cb, builder, }: {
  block: CallFunctionBlockStore,
  cb: CodeBuilder,
  builder: SharpLogicSchemeBuilder,
}) => {
  //const parameters: string[] = await Promise.all(block.parametersExpressions.map((expr) => builder.generateExpressionOld(expr)));
  let parametersProperties: string[] = [];
  if(block.type === 'internal') {
    parametersProperties.push('_falangGlobal = _falangGlobal,');
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
    let pValue = await builder.expr(expr.mathNode, functionParameter.type, block.context);
    const pType = await builder.getFullTypeName(functionParameter.type);
    if (functionParameter.type.type === 'array') {
      switch (functionParameter.type.elementType.type) {
        case 'struct':
          pValue = `${pValue}.Select(child => child.Clone()).ToList()`;
          break;
        default:
          pValue = `new ${pType}(${pValue})`;
      }
    }
    if (functionParameter.type.type === 'struct') {
      pValue = `${pValue}.Clone()`;
    }
    parametersProperties.push(`${functionParameter.name} = ${pValue},`);
  }

  await builder.importFunction(functionData);
  const { name } = functionData;
  const relativePathArray = await builder.getSchemeRelativePathArray(functionData.path);
  const functionNamespaceName = `Falang.${relativePathArray.join('.')}`;
  const paramsClassName = `${functionNamespaceName}.I${name}Params`;

  let functionCaller: string;
  if(block.type === 'internal') {
    functionCaller = `${functionNamespaceName}.MethodClass.${name}`;
  } else if(block.type === 'api') {
    functionCaller = `_falangGlobal.apis.${(functionData.schemeName ?? '')}.${(functionData.apiClassName ?? '')}.${(name)}`;
  } else {
    throw new Error(`Wrong block type: ${block.type}`);
  }

  if (functionData.returnValue.type !== 'void') {
    const variableExists = returnName in block.scopeVariables;
    const declarationPrefix = variableExists ? '' : 'var ';
    cb.p(`${declarationPrefix}${returnName} = ${functionCaller}(new ${paramsClassName}() {`);
    cb.indentPlus();
    parametersProperties.forEach((p) => cb.p(p));
    cb.indentMinus();
    cb.p('});');
  } else {
    cb.p(`${functionCaller}(new ${paramsClassName}() {`);
    cb.indentPlus();
    parametersProperties.forEach((p) => cb.p(p));
    cb.indentMinus();
    cb.p('});');
  }
}


interface WriteCycleBottomInfoParams {
  builder: SharpLogicSchemeBuilder,
  icon: CycleIconStore,
}
export const writeCycleBottomInfo = ({ builder, icon }: WriteCycleBottomInfoParams) => {
  const { codeBuilder: cb } = builder;
  if (!hasParentCycle(icon)) return;
  if (builder.cycleCompileInfo.hasBreaks) {
    cb.p(`if (_break_level > 0) { _break_level-=1; break; }`);
  }
  if (builder.cycleCompileInfo.hasContinues) {
    cb.p(`if (_continue_level > 1) { _continue_level-=1; break; }`);
    cb.p(`if (_continue_level == 1) { _continue_level-=1; continue; }`);
  }
}
