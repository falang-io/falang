import type { INode } from '@falang/dto';
import type { IArrayTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import { compileExpr, compileExprForPrint } from './compile-cpp-expr.js';
import { variableInfoToCppType } from './cpp-type-name.js';
import { NodeCompileError } from './node-compile-error.js';
import { crossesSwitchToTarget, outLevelOf } from './cycle-info.js';
import { isEightBitInteger } from './numeric-coercion.js';
import { resolveArrayElementType, resolveExpressionNumberType } from './resolve-expression-number-type.js';
import { splitLogSegments } from './log-template.js';
import type { ICppStatementContext } from './cpp-statement-context.js';
import { cppApiGlobalName } from './emit-cpp-api-declarations.js';

interface ICreateVarData {
  readonly name: string;
  readonly variableType: TVariableInfo;
  readonly value?: string;
}

export const emitCreateVar = (node: INode, ctx: ICppStatementContext): string => {
  const data = node.data as ICreateVarData;
  const cppType = variableInfoToCppType(data.variableType, ctx.params.structNames);
  if (data.value?.trim()) {
    return `${cppType} ${data.name} = ${compileExpr(data.value, ctx, node.id, data.variableType)};`;
  }
  // Value-initialization (`Type name{};`) rather than a bare `Type name;` — zeroes every member
  // (recursively, for a struct) instead of leaving POD fields indeterminate, matching
  // `@falang/typescript-dto`'s own `defaultValueExpression` intent ("never left as uninitialized
  // garbage") without needing a per-type default-literal table the way that TS helper does.
  return `${cppType} ${data.name}{};`;
};

export const emitAction = (node: INode, ctx: ICppStatementContext): string => {
  const raw = ((node.data as string | undefined) ?? '').trim().replace(/;$/, '');
  if (raw === '') return '';
  return `${compileExpr(raw, ctx, node.id)};`;
};

export const emitLog = (node: INode, ctx: ICppStatementContext): string => {
  const segments = splitLogSegments((node.data as string | undefined) ?? '');
  const parts = segments.map((segment) => {
    if (!segment.isExpr) return ctx.params.adapter.formatStringLiteral(segment.text);
    const code = compileExprForPrint(segment.text, ctx, node.id);
    // iostream prints `int8_t`/`uint8_t` as a character — print the number.
    const numberType = resolveExpressionNumberType({
      expression: segment.text,
      scope: ctx.scope,
      structNames: new Map(ctx.params.structNames),
      structDefinitions: ctx.params.structDefinitions,
    });
    return isEightBitInteger(numberType) ? `static_cast<int>(${code})` : code;
  });
  if (parts.length === 0) return 'std::cout << std::endl;';
  return `std::cout << ${parts.join(' << ')} << std::endl;`;
};

export interface IReturnBinding {
  readonly name: string;
  readonly type: TVariableInfo;
}

interface ICallFunctionData {
  readonly schemeId: string;
  readonly parameters: readonly string[];
  readonly returnVariable: string;
}

export const emitCallFunction = (
  node: INode,
  ctx: ICppStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallFunctionData;
  const signature = ctx.params.functionSignatures.get(data.schemeId);
  if (!signature) throw new NodeCompileError(node.id, `call-function references unknown document "${data.schemeId}"`);
  const args = data.parameters
    .map((parameter, index) => compileExpr(parameter, ctx, node.id, signature.parameters?.[index]?.type))
    .join(', ');
  const call = `${signature.cppName}(${args})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!signature.returnValue) {
    throw new NodeCompileError(node.id, `call-function sets "returnVariable" but "${data.schemeId}" returns void`);
  }
  const cppType = variableInfoToCppType(signature.returnValue, ctx.params.structNames);
  return { code: `${cppType} ${variable} = ${call};`, returnBinding: { name: variable, type: signature.returnValue } };
};

interface ICallApiData {
  readonly iconId?: string | null;
  readonly parameters: readonly string[];
  readonly returnVariable: string;
}

/**
 * Calls through the global pointer `emit-cpp-api-declarations.ts` declares for the endpoint's own
 * API (`(*g_<ApiName>).<endpoint>(args)`) — never a real network call, matching the old app's own
 * `call_api` codegen (see ADR 0019 (private)'s "Implementation notes"). `schemeId` is ignored at
 * this layer (unlike `emitCallFunction`'s `functionSignatures` lookup keyed by it) since `iconId`
 * alone already uniquely resolves the endpoint in `ctx.params.apiEndpoints`.
 */
export const emitCallApi = (
  node: INode,
  ctx: ICppStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallApiData;
  const endpoint = data.iconId ? ctx.params.apiEndpoints.get(data.iconId) : null;
  if (!endpoint) throw new NodeCompileError(node.id, `call-api references unknown endpoint "${data.iconId}"`);
  const args = data.parameters
    .map((parameter, index) => compileExpr(parameter, ctx, node.id, endpoint.parameters[index]?.type))
    .join(', ');
  const call = `(*${cppApiGlobalName(endpoint.apiName)}).${endpoint.name}(${args})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!endpoint.returnValue) {
    throw new NodeCompileError(node.id, `call-api sets "returnVariable" but endpoint "${endpoint.name}" returns void`);
  }
  const cppType = variableInfoToCppType(endpoint.returnValue, ctx.params.structNames);
  return { code: `${cppType} ${variable} = ${call};`, returnBinding: { name: variable, type: endpoint.returnValue } };
};

export const emitReturn = (node: INode, ctx: ICppStatementContext): string => {
  const expression = ((node.data as string | undefined) ?? '').trim();
  return expression === '' ? 'return;' : `return ${compileExpr(expression, ctx, node.id, ctx.returnValue)};`;
};

export const emitThrow = (node: INode, ctx: ICppStatementContext): string =>
  `throw std::runtime_error(${compileExpr(((node.data as string | undefined) ?? '').trim(), ctx, node.id)});`;

/** `break`/`continue`'s C++ emission needs `ctx.cycleInfo` (computed once up front by `computeCycleInfo`, threaded down unchanged) to know whether the `_break_level`/`_continue_level`/`_switch_break` bookkeeping variables exist at all in this function — see `compile-cpp-function.ts`. */
export const emitBreak = (node: INode, ctx: ICppStatementContext): string => {
  const outLevel = outLevelOf(node);
  const levelLine = outLevel > 1 ? [`_break_level = ${outLevel - 1};`] : [];
  const switchLine = crossesSwitchToTarget(ctx.nesting, outLevel, node.id) ? ['_switch_break = true;'] : [];
  return [...levelLine, ...switchLine, 'break;'].join('\n');
};

export const emitContinue = (node: INode, ctx: ICppStatementContext): string => {
  const outLevel = outLevelOf(node);
  if (outLevel <= 1) return 'continue;';
  const switchLine = crossesSwitchToTarget(ctx.nesting, outLevel, node.id) ? ['_switch_break = true;'] : [];
  return [`_continue_level = ${outLevel - 1};`, ...switchLine, 'break;'].join('\n');
};

/** `arr`'s element type is only inferable here when `arr` is a plain identifier already in `scope` typed as an array — matching this package's "explicit error, not a guess" posture (see ADR 0019 (private)) rather than attempting general expression type inference for an arbitrary `arr` expression. */
const resolveArrayIdentifierType = (
  arrExpression: string,
  ctx: ICppStatementContext,
  nodeId: string,
): TVariableInfo & IArrayTypeInfo => {
  const name = arrExpression.trim();
  const type = ctx.scope[name];
  if (!type || type.type !== 'array') {
    throw new NodeCompileError(
      nodeId,
      `"${arrExpression}" must be a plain array-typed identifier already in scope for C++ compilation`,
    );
  }
  return type;
};

interface IArrPopOrShiftData {
  readonly arr: string;
  readonly variable: string;
}

export const emitArrPop = (
  node: INode,
  ctx: ICppStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.pop_back();` };
  const elementType = resolveArrayIdentifierType(data.arr, ctx, node.id).elementType;
  const cppType = variableInfoToCppType(elementType, ctx.params.structNames);
  const code = `${cppType} ${variable} = ${arr}.back();\n${arr}.pop_back();`;
  return { code, returnBinding: { name: variable, type: elementType } };
};

export const emitArrShift = (
  node: INode,
  ctx: ICppStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.erase(${arr}.begin());` };
  const elementType = resolveArrayIdentifierType(data.arr, ctx, node.id).elementType;
  const cppType = variableInfoToCppType(elementType, ctx.params.structNames);
  const code = `${cppType} ${variable} = ${arr}.front();\n${arr}.erase(${arr}.begin());`;
  return { code, returnBinding: { name: variable, type: elementType } };
};

const arrayTypeRequest = (expression: string, ctx: ICppStatementContext) => ({
  expression,
  scope: ctx.scope,
  structNames: new Map(ctx.params.structNames),
  structDefinitions: ctx.params.structDefinitions,
});

interface IArrPushOrUnshiftData {
  readonly arr: string;
  readonly value: string;
}

export const emitArrPush = (node: INode, ctx: ICppStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const elementType = resolveArrayElementType(arrayTypeRequest(data.arr, ctx));
  return `${compileExpr(data.arr, ctx, node.id)}.push_back(${compileExpr(data.value, ctx, node.id, elementType)});`;
};

export const emitArrUnshift = (node: INode, ctx: ICppStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileExpr(data.arr, ctx, node.id);
  const elementType = resolveArrayElementType(arrayTypeRequest(data.arr, ctx));
  return `${arr}.insert(${arr}.begin(), ${compileExpr(data.value, ctx, node.id, elementType)});`;
};

interface IArrInsertData {
  readonly arr: string;
  readonly start: string;
  readonly insertArr: string;
}

export const emitArrInsert = (node: INode, ctx: ICppStatementContext): string => {
  const data = node.data as IArrInsertData;
  const arr = compileExpr(data.arr, ctx, node.id);
  const start = compileExpr(data.start, ctx, node.id);
  const insertArr = compileExpr(data.insertArr, ctx, node.id);
  return `${arr}.insert(${arr}.begin() + (${start}), ${insertArr}.begin(), ${insertArr}.end());`;
};

interface IArrSliceData {
  readonly arr: string;
  readonly variable: string;
  readonly start: string;
  readonly end: string;
}

export const emitArrSlice = (
  node: INode,
  ctx: ICppStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrSliceData;
  const arrType = resolveArrayIdentifierType(data.arr, ctx, node.id);
  const arr = compileExpr(data.arr, ctx, node.id);
  const start = compileExpr(data.start, ctx, node.id);
  const end = compileExpr(data.end, ctx, node.id);
  const variable = data.variable.trim();
  const cppType = variableInfoToCppType(arrType, ctx.params.structNames);
  const sliced = `${cppType}(${arr}.begin() + (${start}), ${arr}.begin() + (${end}))`;
  // Without a variable name the slice is evaluated and discarded — `<type> = <expr>;` is not valid C++.
  if (variable === '') return { code: `(void)${sliced};` };
  const code = `${cppType} ${variable} = ${sliced};`;
  return { code, returnBinding: { name: variable, type: arrType } };
};
