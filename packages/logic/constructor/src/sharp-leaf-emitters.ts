import type { INode } from '@falang/dto';
import type { IArrayTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import { compileSharpExpr } from './compile-sharp-expr.js';
import { sharpAdapter } from './languages/sharp-adapter.js';
import { defaultSharpValue, variableInfoToSharpType } from './sharp-type-name.js';
import { toSharpTypedValue } from './sharp-value.js';
import { NodeCompileError } from './node-compile-error.js';
import { crossesSwitchToTarget, outLevelOf } from './cycle-info.js';
import { splitLogSegments } from './log-template.js';
import type { ISharpStatementContext } from './sharp-statement-context.js';
import { sharpApiFieldName } from './emit-sharp-api-declarations.js';

interface ICreateVarData {
  readonly name: string;
  readonly variableType: TVariableInfo;
  readonly value?: string;
}

export const emitCreateVar = (node: INode, ctx: ISharpStatementContext): string => {
  const data = node.data as ICreateVarData;
  const sharpType = variableInfoToSharpType(data.variableType, ctx.params.structNames);
  if (data.value?.trim()) {
    const value = toSharpTypedValue(
      compileSharpExpr(data.value, ctx, node.id),
      data.variableType,
      ctx.params.structNames,
    );
    return `${sharpType} ${data.name} = ${value};`;
  }
  return `${sharpType} ${data.name} = ${defaultSharpValue(data.variableType, ctx.params.structNames)};`;
};

export const emitAction = (node: INode, ctx: ISharpStatementContext): string => {
  const raw = ((node.data as string | undefined) ?? '').trim().replace(/;$/, '');
  if (raw === '') return '';
  return `${compileSharpExpr(raw, ctx, node.id)};`;
};

/**
 * `Console.WriteLine` on one concatenated string, rather than the old app's own `$"..."` interpolated
 * string: an interpolation hole is parsed as C# source *inside a string literal*, so any compiled
 * expression containing a quote (a string comparison, a literal argument) would need its own escaping
 * pass, while `+` concatenation just embeds the already-compiled expression text as-is.
 *
 * The leading `""` guard matters: C#'s `+` is numeric addition when *both* operands are numeric, so a
 * message whose segments are all interpolations (`${a}${b}` over two `int`s) would otherwise compile
 * to `a + b` — printing a sum instead of two concatenated values. Starting the chain with an empty
 * string forces string concatenation for the whole left-associative chain. (Go's `emitLog` avoids the
 * same trap differently, by wrapping every segment in `fmt.Sprint`.)
 */
export const emitLog = (node: INode, ctx: ISharpStatementContext): string => {
  const segments = splitLogSegments((node.data as string | undefined) ?? '');
  if (segments.length === 0) return 'Console.WriteLine();';
  const parts = segments.map((segment) =>
    segment.isExpr
      ? `(${compileSharpExpr(segment.text, ctx, node.id)})`
      : sharpAdapter.formatStringLiteral(segment.text),
  );
  const guard = segments[0]?.isExpr ? ['""'] : [];
  return `Console.WriteLine(${[...guard, ...parts].join(' + ')});`;
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

/** Every argument is run through `toSharpTypedValue` against its *declared parameter type* — a deep copy for a `List<T>`/struct argument (C# passes those by reference, so a callee's `arr-push` would otherwise be visible to the caller, unlike every other target here) plus a numeric cast where needed. See `sharp-value.ts`. */
export const emitCallFunction = (
  node: INode,
  ctx: ISharpStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallFunctionData;
  const signature = ctx.params.functionSignatures.get(data.schemeId);
  if (!signature) throw new NodeCompileError(node.id, `call-function references unknown document "${data.schemeId}"`);
  const args = data.parameters
    .map((parameter, index) => {
      const code = compileSharpExpr(parameter, ctx, node.id);
      const parameterType = signature.parameters[index]?.type;
      return parameterType ? toSharpTypedValue(code, parameterType, ctx.params.structNames) : code;
    })
    .join(', ');
  const call = `${signature.sharpName}(${args})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!signature.returnValue) {
    throw new NodeCompileError(node.id, `call-function sets "returnVariable" but "${data.schemeId}" returns void`);
  }
  const sharpType = variableInfoToSharpType(signature.returnValue, ctx.params.structNames);
  return {
    code: `${sharpType} ${variable} = ${call};`,
    returnBinding: { name: variable, type: signature.returnValue },
  };
};

interface ICallApiData {
  readonly iconId?: string | null;
  readonly parameters: readonly string[];
  readonly returnVariable: string;
}

/**
 * Calls through the `Program` static field `emit-sharp-api-declarations.ts` declares for the
 * endpoint's own API (`Program.<ApiName>.<Endpoint>(args)`) — never a real network call, matching the
 * old app's own `call_api` codegen (see ADR 0019 (private)'s "Implementation notes"). Same
 * per-declared-parameter-type `toSharpTypedValue` treatment `emitCallFunction` already needs and for
 * the same reason (a `List<T>`/struct argument is a C# reference type a callee could otherwise mutate
 * behind the caller's back).
 */
export const emitCallApi = (
  node: INode,
  ctx: ISharpStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallApiData;
  const endpoint = data.iconId ? ctx.params.apiEndpoints.get(data.iconId) : null;
  if (!endpoint) throw new NodeCompileError(node.id, `call-api references unknown endpoint "${data.iconId}"`);
  const args = data.parameters
    .map((parameter, index) => {
      const code = compileSharpExpr(parameter, ctx, node.id);
      const parameterType = endpoint.parameters[index]?.type;
      return parameterType ? toSharpTypedValue(code, parameterType, ctx.params.structNames) : code;
    })
    .join(', ');
  const call = `Program.${sharpApiFieldName(endpoint.apiName)}.${endpoint.name}(${args})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!endpoint.returnValue) {
    throw new NodeCompileError(node.id, `call-api sets "returnVariable" but endpoint "${endpoint.name}" returns void`);
  }
  const sharpType = variableInfoToSharpType(endpoint.returnValue, ctx.params.structNames);
  return {
    code: `${sharpType} ${variable} = ${call};`,
    returnBinding: { name: variable, type: endpoint.returnValue },
  };
};

/** The returned expression is cast/copied to the *function's own* declared return type (`ctx.returnValue`) — C#, unlike C++, has no implicit narrowing conversion, so e.g. `objects`' `ObjCSum` (declared `int32`, summing a `float32` field along the way) needs the cast to compile at all. */
export const emitReturn = (node: INode, ctx: ISharpStatementContext): string => {
  const expression = ((node.data as string | undefined) ?? '').trim();
  if (expression === '') return 'return;';
  const code = compileSharpExpr(expression, ctx, node.id);
  const value = ctx.returnValue ? toSharpTypedValue(code, ctx.returnValue, ctx.params.structNames) : code;
  return `return ${value};`;
};

export const emitThrow = (node: INode, ctx: ISharpStatementContext): string =>
  `throw new Exception(${compileSharpExpr(((node.data as string | undefined) ?? '').trim(), ctx, node.id)});`;

/** Identical to the cpp target's own `break`/`continue` emission (see `cpp-leaf-emitters.ts`) — C# has no labeled break/continue either, so the `_break_level`/`_continue_level`/`_switch_break` bookkeeping is the same mechanism for the same reason (see `sharp-statement-context.ts`). */
export const emitBreak = (node: INode, ctx: ISharpStatementContext): string => {
  const outLevel = outLevelOf(node);
  const levelLine = outLevel > 1 ? [`_break_level = ${outLevel - 1};`] : [];
  const switchLine = crossesSwitchToTarget(ctx.nesting, outLevel, node.id) ? ['_switch_break = true;'] : [];
  return [...levelLine, ...switchLine, 'break;'].join('\n');
};

export const emitContinue = (node: INode, ctx: ISharpStatementContext): string => {
  const outLevel = outLevelOf(node);
  if (outLevel <= 1) return 'continue;';
  const switchLine = crossesSwitchToTarget(ctx.nesting, outLevel, node.id) ? ['_switch_break = true;'] : [];
  return [`_continue_level = ${outLevel - 1};`, ...switchLine, 'break;'].join('\n');
};

/** Same "a plain array-typed identifier already in scope, or an explicit error" posture as the cpp/Go/Rust targets' own resolvers — no general expression type inference. */
const resolveArrayIdentifierType = (
  arrExpression: string,
  ctx: ISharpStatementContext,
  nodeId: string,
): TVariableInfo & IArrayTypeInfo => {
  const name = arrExpression.trim();
  const type = ctx.scope[name];
  if (!type || type.type !== 'array') {
    throw new NodeCompileError(
      nodeId,
      `"${arrExpression}" must be a plain array-typed identifier already in scope for C# compilation`,
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
  ctx: ISharpStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileSharpExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.RemoveAt(${arr}.Count - 1);` };
  const elementType = resolveArrayIdentifierType(data.arr, ctx, node.id).elementType;
  const sharpType = variableInfoToSharpType(elementType, ctx.params.structNames);
  const code = `${sharpType} ${variable} = ${arr}[${arr}.Count - 1];\n${arr}.RemoveAt(${arr}.Count - 1);`;
  return { code, returnBinding: { name: variable, type: elementType } };
};

export const emitArrShift = (
  node: INode,
  ctx: ISharpStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileSharpExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.RemoveAt(0);` };
  const elementType = resolveArrayIdentifierType(data.arr, ctx, node.id).elementType;
  const sharpType = variableInfoToSharpType(elementType, ctx.params.structNames);
  const code = `${sharpType} ${variable} = ${arr}[0];\n${arr}.RemoveAt(0);`;
  return { code, returnBinding: { name: variable, type: elementType } };
};

interface IArrPushOrUnshiftData {
  readonly arr: string;
  readonly value: string;
}

export const emitArrPush = (node: INode, ctx: ISharpStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  return `${compileSharpExpr(data.arr, ctx, node.id)}.Add(${compileSharpExpr(data.value, ctx, node.id)});`;
};

export const emitArrUnshift = (node: INode, ctx: ISharpStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileSharpExpr(data.arr, ctx, node.id);
  return `${arr}.Insert(0, ${compileSharpExpr(data.value, ctx, node.id)});`;
};

interface IArrInsertData {
  readonly arr: string;
  readonly start: string;
  readonly insertArr: string;
}

export const emitArrInsert = (node: INode, ctx: ISharpStatementContext): string => {
  const data = node.data as IArrInsertData;
  const arr = compileSharpExpr(data.arr, ctx, node.id);
  const start = compileSharpExpr(data.start, ctx, node.id);
  const insertArr = compileSharpExpr(data.insertArr, ctx, node.id);
  return `${arr}.InsertRange(${start}, ${insertArr});`;
};

interface IArrSliceData {
  readonly arr: string;
  readonly variable: string;
  readonly start: string;
  readonly end: string;
}

/** `List<T>.GetRange` takes an index plus a *count*, where the DSL (like C++'s iterator pair and JS's `slice`) gives a half-open `[start, end)` range — hence the `end - start` arithmetic here, the one `arr-*` emitter whose C# shape isn't a direct rename of the cpp one. */
export const emitArrSlice = (
  node: INode,
  ctx: ISharpStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrSliceData;
  const arrType = resolveArrayIdentifierType(data.arr, ctx, node.id);
  const arr = compileSharpExpr(data.arr, ctx, node.id);
  const start = compileSharpExpr(data.start, ctx, node.id);
  const end = compileSharpExpr(data.end, ctx, node.id);
  const variable = data.variable.trim();
  const sharpType = variableInfoToSharpType(arrType, ctx.params.structNames);
  const code = `${sharpType} ${variable} = ${arr}.GetRange(${start}, (${end}) - (${start}));`;
  if (variable === '') return { code };
  return { code, returnBinding: { name: variable, type: arrType } };
};
