import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileTsExpr } from './compile-ts-expr.js';
import { NodeCompileError } from './node-compile-error.js';
import { outLevelOf } from './cycle-info.js';
import { splitLogSegments } from './log-template.js';
import { emitTsEmptyValue, variableInfoToTsTypeName } from './ts-type-name.js';
import { resolveTsArrayType } from './ts-array-type.js';
import type { ITsStatementContext } from './ts-statement-context.js';

/** `{ a: 1, b: 2 }`, or the bare `{ }` for zero entries (avoiding a naive `{ ${[].join(', ')} }`'s stray double space) — `emitCallApi`'s own object-literal argument, the only call site here that can legitimately have zero entries (unlike `emitCallFunction`, which always has at least `_falangGlobal`). */
const objectLiteral = (entries: readonly string[]): string =>
  entries.length === 0 ? '{ }' : `{ ${entries.join(', ')} }`;

interface ICreateVarData {
  readonly name: string;
  readonly variableType: TVariableInfo;
  readonly value?: string;
}

export const emitCreateVar = (node: INode, ctx: ITsStatementContext): string => {
  const data = node.data as ICreateVarData;
  const tsType = variableInfoToTsTypeName(data.variableType, ctx.params.structNames);
  if (data.value?.trim()) {
    return `let ${data.name}: ${tsType} = ${compileTsExpr(data.value, ctx, node.id)};`;
  }
  // No initial value — fills every field recursively rather than leaving `undefined`, matching the
  // old app's own `generateEmptyValue.ts` (see `ts-type-name.ts`'s `emitTsEmptyValue`).
  return `let ${data.name}: ${tsType} = ${emitTsEmptyValue(data.variableType, ctx.params.structDefinitions, node.id)};`;
};

export const emitAction = (node: INode, ctx: ITsStatementContext): string => {
  const raw = ((node.data as string | undefined) ?? '').trim().replace(/;$/, '');
  if (raw === '') return '';
  return `${compileTsExpr(raw, ctx, node.id)};`;
};

/** Escapes a literal `log` segment for embedding inside a TS template literal — backslash/backtick need escaping like any template literal, and a literal `${` (unlikely, but possible in free text) needs escaping too so it isn't mistaken for a real interpolation. */
const escapeTemplateLiteralText = (value: string): string =>
  value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('`', String.raw`\``)
    .replaceAll('${', '\\${');

/**
 * Unlike Go's `emitLog` (which needs `fmt.Sprint(...)` around every interpolated segment, since Go's
 * `+` only concatenates strings), a TS template literal already stringifies any interpolated value via
 * its own `.toString()`/default formatting — so this just re-assembles `splitLogSegments`'s segments
 * into a single backtick template, embedding each expression segment as `${...}` directly.
 */
export const emitLog = (node: INode, ctx: ITsStatementContext): string => {
  const segments = splitLogSegments((node.data as string | undefined) ?? '');
  const parts = segments.map((segment) =>
    segment.isExpr ? `\${${compileTsExpr(segment.text, ctx, node.id)}}` : escapeTemplateLiteralText(segment.text),
  );
  return `console.log(\`${parts.join('')}\`);`;
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

/**
 * `await <Fn>({ <p1>: <arg1>, ..., _falangGlobal })` — unlike Go/cpp's positional argument list, a TS
 * call always passes a single keyed object literal (Contract 4), so `data.parameters` (a positional
 * expression list, matching every other target) is zipped against the *callee's own* declared
 * parameter names (`signature.parameters`, see `ts-statement-context.ts`'s `ITsFunctionSignature`).
 */
export const emitCallFunction = (
  node: INode,
  ctx: ITsStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallFunctionData;
  const signature = ctx.params.functionSignatures.get(data.schemeId);
  if (!signature) throw new NodeCompileError(node.id, `call-function references unknown document "${data.schemeId}"`);
  const argEntries = signature.parameters.map((parameter, index) => {
    if (index >= data.parameters.length) {
      throw new NodeCompileError(
        node.id,
        `call-function is missing argument "${parameter.name}" for "${signature.tsName}"`,
      );
    }
    return `${parameter.name}: ${compileTsExpr(data.parameters[index], ctx, node.id)}`;
  });
  const call = `await ${signature.tsName}({ ${[...argEntries, '_falangGlobal'].join(', ')} })`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!signature.returnValue || signature.returnValue.type === 'void') {
    throw new NodeCompileError(node.id, `call-function sets "returnVariable" but "${signature.tsName}" returns void`);
  }
  const tsType = variableInfoToTsTypeName(signature.returnValue, ctx.params.structNames);
  return {
    code: `let ${variable}: ${tsType} = ${call};`,
    returnBinding: { name: variable, type: signature.returnValue },
  };
};

interface ICallApiData {
  readonly iconId?: string | null;
  readonly parameters: readonly string[];
  readonly returnVariable: string;
}

/**
 * `await _falangGlobal.apis.<ApiDoc>.<Group>.<Endpoint>({ ... })` — never a real network call, matching
 * the old app's own `call_api` codegen (see ADR 0019 (private)'s "Implementation notes"). Same
 * "`iconId` alone resolves the endpoint" posture as the Go target's own `emitCallApi`, but the resolved
 * `ITsApiEndpoint` also carries the owning document/group names this target's three-level call path
 * needs (see `ts-statement-context.ts`'s own doc comment).
 */
export const emitCallApi = (
  node: INode,
  ctx: ITsStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallApiData;
  const endpoint = data.iconId ? ctx.params.apiEndpoints.get(data.iconId) : null;
  if (!endpoint) throw new NodeCompileError(node.id, `call-api references unknown endpoint "${data.iconId}"`);
  const argEntries = endpoint.parameters.map((parameter, index) => {
    if (index >= data.parameters.length) {
      throw new NodeCompileError(node.id, `call-api is missing argument "${parameter.name}" for "${endpoint.name}"`);
    }
    return `${parameter.name}: ${compileTsExpr(data.parameters[index], ctx, node.id)}`;
  });
  const call = `await _falangGlobal.apis.${endpoint.apiDocName}.${endpoint.groupName}.${endpoint.name}(${objectLiteral(argEntries)})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!endpoint.returnValue || endpoint.returnValue.type === 'void') {
    throw new NodeCompileError(node.id, `call-api sets "returnVariable" but endpoint "${endpoint.name}" returns void`);
  }
  const tsType = variableInfoToTsTypeName(endpoint.returnValue, ctx.params.structNames);
  return {
    code: `let ${variable}: ${tsType} = ${call};`,
    returnBinding: { name: variable, type: endpoint.returnValue },
  };
};

export const emitReturn = (node: INode, ctx: ITsStatementContext): string => {
  const expression = ((node.data as string | undefined) ?? '').trim();
  if (expression === '') return 'return;';
  // An `async` function's declared return type is always `Promise<Ret>` (see `ts-type-name.ts`'s
  // `tsReturnTypeName`) — returning a bare `Ret` here needs no explicit `Promise`/cast wrapping, TS
  // auto-wraps it, unlike Go/Rust's own `emitReturn` which needs an explicit numeric-width cast (TS has
  // only one numeric type, see `ts-type-name.ts`'s own doc comment).
  return `return ${compileTsExpr(expression, ctx, node.id)};`;
};

/** `throw new Error(<expr>)` — same "wrap in the target language's real exception type" posture as `cpp-leaf-emitters.ts`'s `std::runtime_error`/`sharp-leaf-emitters.ts`'s `new Exception(...)`. */
export const emitThrow = (node: INode, ctx: ITsStatementContext): string =>
  `throw new Error(${compileTsExpr(((node.data as string | undefined) ?? '').trim(), ctx, node.id)});`;

/** Resolves `outLevel` against `ctx.loopLabels` (one entry pushed per enclosing loop, see `ts-statement-context.ts`) and marks that label used — identical mechanism to `go-leaf-emitters.ts`'s own `resolveLoopLabel`, since TS also has real labeled break/continue (Contract 4). */
const resolveLoopLabel = (node: INode, ctx: ITsStatementContext): string => {
  const outLevel = outLevelOf(node);
  const label = ctx.loopLabels[ctx.loopLabels.length - outLevel];
  if (!label) throw new NodeCompileError(node.id, `Targets a loop level ${outLevel} that doesn't exist`);
  ctx.usedLabels.add(label);
  return label;
};

/**
 * Always emits a *labeled* break/continue, never bare — a bare `break;`/`continue;` inside a `switch`
 * case would target the switch itself in TS/JS (same rule as Go), but this DSL's `break`/`continue`
 * nodes always mean "jump the enclosing loop", so `ts-control-flow-emitters.ts`'s `emitSwitch` reserves
 * the one bare, unlabeled `break;` it appends per case purely for fallthrough prevention.
 */
export const emitBreak = (node: INode, ctx: ITsStatementContext): string => `break ${resolveLoopLabel(node, ctx)};`;
export const emitContinue = (node: INode, ctx: ITsStatementContext): string =>
  `continue ${resolveLoopLabel(node, ctx)};`;

interface IArrPopOrShiftData {
  readonly arr: string;
  readonly variable: string;
}

/**
 * `Array.prototype.pop`/`shift` mutate `arr` in place and return `T | undefined` even when `arr` is
 * statically known non-empty — the `!` non-null assertion is the standard, deliberate TS idiom for
 * this exact situation (this DSL gives no way to prove non-emptiness to the type checker), matching
 * the reference `code/ts` output's own manual `if (!oldPoint) throw ...` guard's *intent* without
 * needing a runtime check this compiler has no way to synthesize a meaningful error message for.
 */
export const emitArrPop = (node: INode, ctx: ITsStatementContext): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileTsExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.pop();` };
  const elementType = resolveTsArrayType(data.arr, ctx, node.id).elementType;
  const tsType = variableInfoToTsTypeName(elementType, ctx.params.structNames);
  return { code: `let ${variable}: ${tsType} = ${arr}.pop()!;`, returnBinding: { name: variable, type: elementType } };
};

export const emitArrShift = (
  node: INode,
  ctx: ITsStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileTsExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.shift();` };
  const elementType = resolveTsArrayType(data.arr, ctx, node.id).elementType;
  const tsType = variableInfoToTsTypeName(elementType, ctx.params.structNames);
  return {
    code: `let ${variable}: ${tsType} = ${arr}.shift()!;`,
    returnBinding: { name: variable, type: elementType },
  };
};

interface IArrPushOrUnshiftData {
  readonly arr: string;
  readonly value: string;
}

export const emitArrPush = (node: INode, ctx: ITsStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileTsExpr(data.arr, ctx, node.id);
  return `${arr}.push(${compileTsExpr(data.value, ctx, node.id)});`;
};

export const emitArrUnshift = (node: INode, ctx: ITsStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileTsExpr(data.arr, ctx, node.id);
  return `${arr}.unshift(${compileTsExpr(data.value, ctx, node.id)});`;
};

interface IArrInsertData {
  readonly arr: string;
  readonly start: string;
  readonly insertArr: string;
}

/** `Array.prototype.splice` with a zero delete-count and the spread of `insertArr` is the direct, idiomatic TS equivalent of "insert this array's items starting at this index" — no aliasing hazard to work around the way Go's slice-based `emitArrInsert` has, since TS arrays are always a single mutable heap object. */
export const emitArrInsert = (node: INode, ctx: ITsStatementContext): string => {
  const data = node.data as IArrInsertData;
  const arr = compileTsExpr(data.arr, ctx, node.id);
  const start = compileTsExpr(data.start, ctx, node.id);
  const insertArr = compileTsExpr(data.insertArr, ctx, node.id);
  return `${arr}.splice(${start}, 0, ...${insertArr});`;
};

interface IArrSliceData {
  readonly arr: string;
  readonly variable: string;
  readonly start: string;
  readonly end: string;
}

export const emitArrSlice = (
  node: INode,
  ctx: ITsStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrSliceData;
  const arrType = resolveTsArrayType(data.arr, ctx, node.id);
  const arr = compileTsExpr(data.arr, ctx, node.id);
  const start = compileTsExpr(data.start, ctx, node.id);
  const end = compileTsExpr(data.end, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.slice(${start}, ${end});` };
  const tsType = variableInfoToTsTypeName(arrType, ctx.params.structNames);
  return {
    code: `let ${variable}: ${tsType} = ${arr}.slice(${start}, ${end});`,
    returnBinding: { name: variable, type: arrType },
  };
};
