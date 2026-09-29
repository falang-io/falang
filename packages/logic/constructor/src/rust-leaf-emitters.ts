import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileRustExpr } from './compile-rust-expr.js';
import { variableInfoToRustType } from './rust-type-name.js';
import { rustAdapter } from './languages/rust-adapter.js';
import { NodeCompileError } from './node-compile-error.js';
import { outLevelOf } from './cycle-info.js';
import { splitLogSegments } from './log-template.js';
import { resolveRustArrayType, type IRustStatementContext } from './rust-statement-context.js';
import { rustApiMethodName } from './emit-rust-api-declarations.js';
import { toOwnedRustValue, toRustArgValue } from './rust-value.js';

interface ICreateVarData {
  readonly name: string;
  readonly variableType: TVariableInfo;
  readonly value?: string;
}

/** `Default::default()` covers every type this compiler ever declares a variable of — unlike Go's zero-value-by-declaration (`var name Type;`), Rust has no such implicit-init form, but every generated struct derives `Default` (see `emit-rust-struct-declarations.ts`) and `Vec<T>`/`String`/the numeric/`bool` primitives all implement it in `std` already, so one call covers every case uniformly (same "never left as uninitialized garbage" intent as the cpp/Go analogues). */
export const emitCreateVar = (node: INode, ctx: IRustStatementContext): string => {
  const data = node.data as ICreateVarData;
  const rustType = variableInfoToRustType(data.variableType, ctx.params.structNames, ctx.params.structDocuments);
  if (data.value?.trim()) {
    const value = toOwnedRustValue(compileRustExpr(data.value, ctx, node.id), data.variableType.type);
    return `let mut ${data.name}: ${rustType} = ${value};`;
  }
  return `let mut ${data.name}: ${rustType} = Default::default();`;
};

export const emitAction = (node: INode, ctx: IRustStatementContext): string => {
  const raw = ((node.data as string | undefined) ?? '').trim().replace(/;$/, '');
  if (raw === '') return '';
  return `${compileRustExpr(raw, ctx, node.id)};`;
};

/**
 * `println!` needs its own format-string literal with `{}` placeholders (unlike Go's `fmt.Println`,
 * which just concatenates already-rendered `fmt.Sprint(...)` pieces with `+`) — every interpolated
 * (`isExpr`) segment becomes a `{}` placeholder plus a trailing macro argument, and every literal
 * segment's own `{`/`}` characters (if any) are doubled first, since those are the macro's own escape
 * syntax for a literal brace. The combined format text is then run through the same
 * `rustAdapter.formatStringLiteral` every other string literal in this target uses, for its
 * quote/backslash/newline escaping — safe to apply *after* the brace-doubling, since that function
 * never touches `{`/`}` itself.
 */
export const emitLog = (node: INode, ctx: IRustStatementContext): string => {
  const segments = splitLogSegments((node.data as string | undefined) ?? '');
  if (segments.length === 0) return 'println!();';
  let format = '';
  const args: string[] = [];
  for (const segment of segments) {
    if (segment.isExpr) {
      format += '{}';
      args.push(compileRustExpr(segment.text, ctx, node.id));
    } else {
      format += segment.text.replaceAll('{', '{{').replaceAll('}', '}}');
    }
  }
  const formatLiteral = rustAdapter.formatStringLiteral(format);
  return args.length === 0 ? `println!(${formatLiteral});` : `println!(${formatLiteral}, ${args.join(', ')});`;
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
 * ADR 0019 (private)'s "Rust target — old-app layout" pass moved struct/array parameters to `&T`
 * references (`rust-type-name.ts`'s `isRustByRefType`) instead of Go/C++-style pass-by-value copies —
 * see `toRustArgValue`'s own doc comment for why a plain `&(<expr>)` borrow is now enough at the call
 * site, no `.clone()` needed (unlike `string`, still owned by-value, still going through
 * `toOwnedRustValue`'s `.to_string()`). Every compiled function also takes a trailing `_apis: &mut dyn
 * crate::falang::falang_global::Apis` parameter unconditionally (even one that never calls an API
 * itself, since Rust has no optional/variadic parameters this could be conditional on) — passing the
 * caller's own `_apis` binding directly relies on Rust's implicit `&mut` reborrowing at a call-argument
 * position (confirmed against the reference `example-snake` project's own generated `main.rs`, which
 * does exactly this repeatedly in a loop), not a move, so the caller's own `_apis` stays usable for
 * every subsequent statement.
 */
export const emitCallFunction = (
  node: INode,
  ctx: IRustStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallFunctionData;
  const signature = ctx.params.functionSignatures.get(data.schemeId);
  if (!signature) throw new NodeCompileError(node.id, `call-function references unknown document "${data.schemeId}"`);
  const args = data.parameters.map((parameter, index) => {
    const code = compileRustExpr(parameter, ctx, node.id);
    const parameterType = signature.parameters[index]?.type;
    return parameterType ? toRustArgValue(code, parameterType) : code;
  });
  const qualifiedName = `crate::falang::${signature.documentName}::${signature.rustName}`;
  const call = `${qualifiedName}(${[...args, '_apis'].join(', ')})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!signature.returnValue) {
    throw new NodeCompileError(node.id, `call-function sets "returnVariable" but "${data.schemeId}" returns void`);
  }
  return { code: `let mut ${variable} = ${call};`, returnBinding: { name: variable, type: signature.returnValue } };
};

interface ICallApiData {
  readonly iconId?: string | null;
  readonly parameters: readonly string[];
  readonly returnVariable: string;
}

/**
 * Calls straight through the `_apis: &mut dyn crate::falang::falang_global::Apis` parameter every
 * compiled function now receives (`_apis.<ApiDoc>_<Group>_<Endpoint>(args)`) — never a real network
 * call, matching the old app's own `call_api` codegen (see ADR 0019 (private)'s "Rust target —
 * old-app layout" implementation notes for why this replaced the previous `OnceLock`-guarded-static
 * design). Same `toRustArgValue` argument wrapping `emitCallFunction` uses and for the same reason: a
 * struct/array-typed argument is now passed by `&` reference (the trait's own parameter type, see
 * `emit-rust-api-declarations.ts`), not cloned.
 */
export const emitCallApi = (
  node: INode,
  ctx: IRustStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as ICallApiData;
  const endpoint = data.iconId ? ctx.params.apiEndpoints.get(data.iconId) : null;
  if (!endpoint) throw new NodeCompileError(node.id, `call-api references unknown endpoint "${data.iconId}"`);
  const args = data.parameters
    .map((parameter, index) => {
      const code = compileRustExpr(parameter, ctx, node.id);
      const parameterType = endpoint.parameters[index]?.type;
      return parameterType ? toRustArgValue(code, parameterType) : code;
    })
    .join(', ');
  const call = `_apis.${rustApiMethodName(endpoint)}(${args})`;
  const variable = data.returnVariable.trim();
  if (variable === '') return { code: `${call};` };
  if (!endpoint.returnValue) {
    throw new NodeCompileError(node.id, `call-api sets "returnVariable" but endpoint "${endpoint.name}" returns void`);
  }
  return { code: `let mut ${variable} = ${call};`, returnBinding: { name: variable, type: endpoint.returnValue } };
};

/** Rust has no exceptions — `panic!` is the closest analogue (unwinds, aborts the program unless caught by `catch_unwind`), matching `throw`'s "this function bails out abnormally" intent. `{:?}` (`Debug`, not `Display`) is used since every type this compiler can produce a value of — primitives, `String`, `Vec<T>`, and every generated struct (which always derives `Debug`, see `emit-rust-struct-declarations.ts`) — implements it, unlike `Display`, which a struct wouldn't get for free. */
export const emitThrow = (node: INode, ctx: IRustStatementContext): string =>
  `panic!("{:?}", ${compileRustExpr(((node.data as string | undefined) ?? '').trim(), ctx, node.id)});`;

/** Resolves `outLevel` against `ctx.loopLabels` (one entry pushed per enclosing loop, see `rust-statement-context.ts`) and marks that label used, so the target loop knows to print its own `'L\d+:` prefix — a direct port of `go-leaf-emitters.ts`'s own `resolveLoopLabel`. */
const resolveLoopLabel = (node: INode, ctx: IRustStatementContext): string => {
  const outLevel = outLevelOf(node);
  const label = ctx.loopLabels[ctx.loopLabels.length - outLevel];
  if (!label) throw new NodeCompileError(node.id, `Targets a loop level ${outLevel} that doesn't exist`);
  ctx.usedLabels.add(label);
  return label;
};

export const emitBreak = (node: INode, ctx: IRustStatementContext): string => `break '${resolveLoopLabel(node, ctx)};`;
export const emitContinue = (node: INode, ctx: IRustStatementContext): string =>
  `continue '${resolveLoopLabel(node, ctx)};`;

interface IArrPopOrShiftData {
  readonly arr: string;
  readonly variable: string;
}

export const emitArrPop = (
  node: INode,
  ctx: IRustStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileRustExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.pop();` };
  const elementType = resolveRustArrayType(data.arr, ctx, node.id).elementType;
  return { code: `let mut ${variable} = ${arr}.pop().unwrap();`, returnBinding: { name: variable, type: elementType } };
};

/** `Vec` has no `shift` — `.remove(0)` is the standard equivalent (returns the owned element directly, not wrapped in `Option`, unlike `.pop()` — panics on an empty vec instead, the same behavior the DSL's `arr-shift` already assumes). */
export const emitArrShift = (
  node: INode,
  ctx: IRustStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrPopOrShiftData;
  const arr = compileRustExpr(data.arr, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `${arr}.remove(0);` };
  const elementType = resolveRustArrayType(data.arr, ctx, node.id).elementType;
  return { code: `let mut ${variable} = ${arr}.remove(0);`, returnBinding: { name: variable, type: elementType } };
};

interface IArrPushOrUnshiftData {
  readonly arr: string;
  readonly value: string;
}

/**
 * The pushed value is wrapped through `toOwnedRustValue` (using the array's own `elementType`, since a
 * value expression can be an arbitrary expression, not just a plain identifier `resolveArrayIdentifierType`
 * could look up on its own) for the same reason `emitCreateVar`'s value already is: a struct/array
 * element value that happens to be an existing variable elsewhere in scope (e.g. `state.snake.body.push(
 * snakePoint)` while `snakePoint` is used again afterward — a real, load-bearing case in the user's own
 * `example-snake` project's `main` document, see ADR 0019 (private)'s "Rust target — old-app layout"
 * implementation notes) must not be moved into the `Vec`, only copied into it.
 */
export const emitArrPush = (node: INode, ctx: IRustStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileRustExpr(data.arr, ctx, node.id);
  const elementType = resolveRustArrayType(data.arr, ctx, node.id).elementType;
  const value = toOwnedRustValue(compileRustExpr(data.value, ctx, node.id), elementType.type);
  return `${arr}.push(${value});`;
};

/** `Vec` has no `unshift` — `.insert(0, value)` is the standard equivalent. Same clone-the-pushed-value reasoning as `emitArrPush`. */
export const emitArrUnshift = (node: INode, ctx: IRustStatementContext): string => {
  const data = node.data as IArrPushOrUnshiftData;
  const arr = compileRustExpr(data.arr, ctx, node.id);
  const elementType = resolveRustArrayType(data.arr, ctx, node.id).elementType;
  const value = toOwnedRustValue(compileRustExpr(data.value, ctx, node.id), elementType.type);
  return `${arr}.insert(0, ${value});`;
};

interface IArrInsertData {
  readonly arr: string;
  readonly start: string;
  readonly insertArr: string;
}

/**
 * `Vec::splice(range, replace_with)` with an empty `start..start` range inserts every element of
 * `replace_with` at `start` without removing anything — the standard-library, allocation-safe
 * equivalent of cpp's own three-index full-slice-expression idiom (`emitArrInsert` in
 * `cpp-leaf-emitters.ts`), needing no manual capacity trick here since `splice` already handles the
 * shifting internally. `splice` returns a draining iterator that performs the actual insertion when
 * dropped — calling it as a bare statement (never binding or iterating the result) is the standard way
 * to use it purely for this side effect. `insertArr` is unconditionally `.clone()`d (via
 * `toOwnedRustValue`, `'array'` typeKind) — `Vec::splice`'s `replace_with` argument consumes its
 * iterator by value, and `insertArr` is itself an arbitrary array-typed expression (e.g. an existing
 * variable used again afterward), the same ownership concern `emitArrPush`/`emitArrUnshift` already
 * solve for a single pushed element.
 */
export const emitArrInsert = (node: INode, ctx: IRustStatementContext): string => {
  const data = node.data as IArrInsertData;
  const arr = compileRustExpr(data.arr, ctx, node.id);
  const start = compileRustExpr(data.start, ctx, node.id);
  const insertArr = toOwnedRustValue(compileRustExpr(data.insertArr, ctx, node.id), 'array');
  return `${arr}.splice((${start} as usize)..(${start} as usize), ${insertArr});`;
};

interface IArrSliceData {
  readonly arr: string;
  readonly variable: string;
  readonly start: string;
  readonly end: string;
}

/** `.to_vec()` turns the borrowed `&[T]` slice expression into a new, owned `Vec<T>` (needs `T: Clone`, satisfied uniformly — see `emitCallFunction`'s own doc comment on why every struct this compiler emits derives `Clone`). */
export const emitArrSlice = (
  node: INode,
  ctx: IRustStatementContext,
): { code: string; returnBinding?: IReturnBinding } => {
  const data = node.data as IArrSliceData;
  const arrType = resolveRustArrayType(data.arr, ctx, node.id);
  const arr = compileRustExpr(data.arr, ctx, node.id);
  const start = compileRustExpr(data.start, ctx, node.id);
  const end = compileRustExpr(data.end, ctx, node.id);
  const variable = data.variable.trim();
  if (variable === '') return { code: `let _ = &${arr}[(${start} as usize)..(${end} as usize)];` };
  const code = `let mut ${variable} = ${arr}[(${start} as usize)..(${end} as usize)].to_vec();`;
  return { code, returnBinding: { name: variable, type: arrType } };
};
