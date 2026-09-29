import type { INode } from '@falang/dto';
import type { IArrayTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import { compileGoExpr } from './compile-go-expr.js';
import { resolveExpressionNumberType } from './resolve-expression-number-type.js';
import { variableInfoToGoType } from './golang-type-name.js';
import { golangAdapter } from './languages/golang-adapter.js';
import { NodeCompileError } from './node-compile-error.js';
import { outLevelOf } from './cycle-info.js';
import { widthOf } from './numeric-coercion.js';
import { splitLogSegments } from './log-template.js';
import type { IGoStatementContext } from './go-statement-context.js';
import { goApiGlobalName } from './emit-go-api-declarations.js';

interface ICreateVarData {
  readonly name: string;
  readonly variableType: TVariableInfo;
  readonly value?: string;
}

export const emitCreateVar = (node: INode, ctx: IGoStatementContext): string => {
  const data = node.data as ICreateVarData;
  const goType = variableInfoToGoType(data.variableType, ctx.params.structNames);
  if (data.value?.trim()) return `var ${data.name} ${goType} = ${compileGoExpr(data.value, ctx, node.id)};`;
  // `var name Type` (no `:=`, which always requires an initializer) — Go zero-values every field
  // automatically (numeric 0, empty string, false, nil slice, recursively-zeroed struct), matching
  // `emitCreateVar`'s cpp analogue's "never left as uninitialized garbage" intent for free.
  return `var ${data.name} ${goType};`;
};

export const emitAction = (node: INode, ctx: IGoStatementContext): string => {
  const raw = ((node.data as string | undefined) ?? '').trim().replace(/;$/, '');
  if (raw === '') return '';
  return `${compileGoExpr(raw, ctx, node.id)};`;
};

/**
 * Go's `+` operator only concatenates strings, unlike C++'s `<<` stream operator (which accepts any
 * streamable type) — every interpolated (`isExpr`) segment is wrapped in `fmt.Sprint(...)` so a
 * non-string expression (a number, a struct, …) still renders via Go's default formatting instead of
 * a compile error; `fmt.Sprint` on an already-`string` value returns it unchanged, so this is always
 * safe even when the segment happens to already be a string. Literal segments are emitted as plain Go
 * string literals and never wrapped.
 */
export const emitLog = (node: INode, ctx: IGoStatementContext): string => {
  const segments = splitLogSegments((node.data as string | undefined) ?? '');
  const parts = segments.map((segment) => {
    if (!segment.isExpr) return golangAdapter.formatStringLiteral(segment.text);
    return `fmt.Sprint(${compileGoExpr(segment.text, ctx, node.id)})`;
  });
  if (parts.length === 0) return 'fmt.Println();';
  return `fmt.Println(${parts.join(' + ')});`;
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
  ctx: IGoStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallFunctionData;
  const signature = ctx.params.functionSignatures.get(data.schemeId);
  if (!signature) throw new NodeCompileError(node.id, `call-function references unknown document "${data.schemeId}"`);
  const args = data.parameters.map((parameter) => compileGoExpr(parameter, ctx, node.id)).join(', ');
  const call = `${signature.goName}(${args})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!signature.returnValue) {
    throw new NodeCompileError(node.id, `call-function sets "returnVariable" but "${data.schemeId}" returns void`);
  }
  // `:=` (not `var name Type = ...`) — unlike `create-var`'s user-typed value expression (which may
  // be an untyped constant Go would otherwise default to a different width), a call's return type is
  // exactly `signature.returnValue` already, so short variable declaration is both safe and idiomatic.
  return { code: `${variable} := ${call};`, returnBinding: { name: variable, type: signature.returnValue } };
};

interface ICallApiData {
  readonly iconId?: string | null;
  readonly parameters: readonly string[];
  readonly returnVariable: string;
}

/**
 * Calls through the package-level variable `emit-go-api-declarations.ts` declares for the endpoint's
 * own API (`G<ApiName>.<Endpoint>(args)`) — never a real network call, matching the old app's own
 * `call_api` codegen (see ADR 0019 (private)'s "Implementation notes"). Same "`iconId` alone
 * resolves the endpoint" posture as the cpp target's `emitCallApi`.
 */
export const emitCallApi = (
  node: INode,
  ctx: IGoStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallApiData;
  const endpoint = data.iconId ? ctx.params.apiEndpoints.get(data.iconId) : null;
  if (!endpoint) throw new NodeCompileError(node.id, `call-api references unknown endpoint "${data.iconId}"`);
  const args = data.parameters.map((parameter) => compileGoExpr(parameter, ctx, node.id)).join(', ');
  const call = `${goApiGlobalName(endpoint.apiName)}.${endpoint.name}(${args})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!endpoint.returnValue) {
    throw new NodeCompileError(node.id, `call-api sets "returnVariable" but endpoint "${endpoint.name}" returns void`);
  }
  return { code: `${variable} := ${call};`, returnBinding: { name: variable, type: endpoint.returnValue } };
};

/**
 * The Go analogue of `sharp-value.ts`'s `toSharpTypedValue`, scoped to numbers only: Go has no
 * implicit conversion on `return` either (unlike C++'s implicit narrowing), so a `return` expression
 * whose own resolved width doesn't match the function's declared `returnValue` needs an explicit Go
 * type conversion. Casts only when the widths actually differ (see `numeric-coercion.ts`'s `widthOf`)
 * — an already-matching return keeps its exact previous output, so no existing generated-code
 * assertion changes.
 */
const castReturnExprIfNeeded = (code: string, expression: string, ctx: IGoStatementContext): string => {
  if (ctx.returnValue?.type !== 'number') return code;
  const resolvedNumberType = resolveExpressionNumberType({
    expression,
    scope: ctx.scope,
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
  });
  if (!resolvedNumberType || widthOf(resolvedNumberType) === widthOf(ctx.returnValue.numberType)) return code;
  return `${variableInfoToGoType(ctx.returnValue, new Map(ctx.params.structNames))}(${code})`;
};

export const emitReturn = (node: INode, ctx: IGoStatementContext): string => {
  const expression = ((node.data as string | undefined) ?? '').trim();
  if (expression === '') return 'return;';
  const code = compileGoExpr(expression, ctx, node.id);
  return `return ${castReturnExprIfNeeded(code, expression, ctx)};`;
};

/** Go has no exceptions — `panic` is the closest analogue (unwinds the goroutine's stack, terminates the program unless recovered), matching `throw`'s "this function bails out abnormally" intent. `panic` accepts any value, so no `fmt.Sprint` wrapping is needed here unlike `emitLog`. */
export const emitThrow = (node: INode, ctx: IGoStatementContext): string =>
  `panic(${compileGoExpr(((node.data as string | undefined) ?? '').trim(), ctx, node.id)});`;

/** Resolves `outLevel` against `ctx.loopLabels` (one entry pushed per enclosing loop, see `go-statement-context.ts`) and marks that label used, so the target loop knows to print its own `L\d+:` prefix. */
const resolveLoopLabel = (node: INode, ctx: IGoStatementContext): string => {
  const outLevel = outLevelOf(node);
  const label = ctx.loopLabels[ctx.loopLabels.length - outLevel];
  if (!label) throw new NodeCompileError(node.id, `Targets a loop level ${outLevel} that doesn't exist`);
  ctx.usedLabels.add(label);
  return label;
};

export const emitBreak = (node: INode, ctx: IGoStatementContext): string => `break ${resolveLoopLabel(node, ctx)};`;
export const emitContinue = (node: INode, ctx: IGoStatementContext): string =>
  `continue ${resolveLoopLabel(node, ctx)};`;

/** `arr`'s element type is only inferable here when `arr` is a plain identifier already in `scope` typed as an array — same posture as `cpp-leaf-emitters.ts`'s `resolveArrayIdentifierType`. */
const resolveArrayIdentifierType = (
  arrExpression: string,
  ctx: IGoStatementContext,
  nodeId: string,
): TVariableInfo & IArrayTypeInfo => {
  const name = arrExpression.trim();
  const type = ctx.scope[name];
  if (!type || type.type !== 'array') {
    throw new NodeCompileError(
      nodeId,
      `"${arrExpression}" must be a plain array-typed identifier already in scope for Go compilation`,
    );
  }
  return type;
};

interface IArrPopOrShiftData {
  readonly arr: string;
  readonly variable: string;
}

/**
 * `append` may (but isn't guaranteed to) allocate a new backing array, so every `arr-*` mutation
 * reassigns the slice variable itself (`arr = append(arr, ...)` / `arr = arr[1:]`) rather than
 * mutating in place the way `std::vector::push_back()` does — this reassigns only the *local* slice
 * header (pointer+len+cap), which Go passes to functions by value, so a callee's own `arr-*` calls
 * never affect a caller's slice variable, matching `cpp-leaf-emitters.ts`'s equivalent by-value
 * behavior (confirmed load-bearing for the already-migrated `arrays` cpp test project).
 */
export const emitArrPop = (node: INode, ctx: IGoStatementContext): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileGoExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr} = ${arr}[:len(${arr})-1];` };
  const elementType = resolveArrayIdentifierType(data.arr, ctx, node.id).elementType;
  const goType = variableInfoToGoType(elementType, ctx.params.structNames);
  const code = `var ${variable} ${goType} = ${arr}[len(${arr})-1];\n${arr} = ${arr}[:len(${arr})-1];`;
  return { code, returnBinding: { name: variable, type: elementType } };
};

export const emitArrShift = (
  node: INode,
  ctx: IGoStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileGoExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr} = ${arr}[1:];` };
  const elementType = resolveArrayIdentifierType(data.arr, ctx, node.id).elementType;
  const goType = variableInfoToGoType(elementType, ctx.params.structNames);
  const code = `var ${variable} ${goType} = ${arr}[0];\n${arr} = ${arr}[1:];`;
  return { code, returnBinding: { name: variable, type: elementType } };
};

interface IArrPushOrUnshiftData {
  readonly arr: string;
  readonly value: string;
}

export const emitArrPush = (node: INode, ctx: IGoStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileGoExpr(data.arr, ctx, node.id);
  return `${arr} = append(${arr}, ${compileGoExpr(data.value, ctx, node.id)});`;
};

export const emitArrUnshift = (node: INode, ctx: IGoStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileGoExpr(data.arr, ctx, node.id);
  const elementType = resolveArrayIdentifierType(data.arr, ctx, node.id).elementType;
  const goType = variableInfoToGoType(elementType, ctx.params.structNames);
  return `${arr} = append([]${goType}{${compileGoExpr(data.value, ctx, node.id)}}, ${arr}...);`;
};

interface IArrInsertData {
  readonly arr: string;
  readonly start: string;
  readonly insertArr: string;
}

/**
 * The well-known safe Go slice-insert idiom: `arr[:start:start]` (a three-index "full slice
 * expression") caps the left half's *capacity* at `start`, forcing `append` to allocate a fresh
 * backing array instead of possibly overwriting `arr[start:]` in place while the outer `append` is
 * still reading from it — the naive two-index `arr[:start]` form has a well-documented aliasing bug
 * for exactly this "insert in the middle" case.
 */
export const emitArrInsert = (node: INode, ctx: IGoStatementContext): string => {
  const data = node.data as IArrInsertData;
  const arr = compileGoExpr(data.arr, ctx, node.id);
  const start = compileGoExpr(data.start, ctx, node.id);
  const insertArr = compileGoExpr(data.insertArr, ctx, node.id);
  return `${arr} = append(${arr}[:${start}:${start}], append(${insertArr}, ${arr}[${start}:]...)...);`;
};

interface IArrSliceData {
  readonly arr: string;
  readonly variable: string;
  readonly start: string;
  readonly end: string;
}

export const emitArrSlice = (
  node: INode,
  ctx: IGoStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrSliceData;
  const arrType = resolveArrayIdentifierType(data.arr, ctx, node.id);
  const arr = compileGoExpr(data.arr, ctx, node.id);
  const start = compileGoExpr(data.start, ctx, node.id);
  const end = compileGoExpr(data.end, ctx, node.id);
  const variable = data.variable.trim();
  // A bare slice expression isn't a valid Go statement on its own (Go only allows call/channel/
  // increment-style expression statements) — discard via `_` when the DSL gives no variable name.
  if (variable === '') return { code: `_ = ${arr}[${start}:${end}];` };
  const goType = variableInfoToGoType(arrType, ctx.params.structNames);
  const code = `var ${variable} ${goType} = ${arr}[${start}:${end}];`;
  return { code, returnBinding: { name: variable, type: arrType } };
};
