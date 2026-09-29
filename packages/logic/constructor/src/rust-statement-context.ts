import type { INode } from '@falang/dto';
import type { IArrayTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import type { IFunctionBodyParameter } from './function-signature.js';
import type { IStructDefinition } from './struct-definition.js';
import type { IExternalApiEndpoint } from './external-api-registry.js';
import {
  buildVirtualFileText,
  createCheckedProgram,
  findExprInitializer,
  getDiagnosticMessages,
} from './compile-expression.js';
import { resolveVariableInfo } from './numeric-coercion.js';
import { NodeCompileError } from './node-compile-error.js';

/**
 * Resolves a `call-function` node's target to the Rust function it should call, plus its signature —
 * same role as `cpp-statement-context.ts`'s `ICppFunctionSignature`/`go-statement-context.ts`'s
 * `IGoFunctionSignature`, but with one addition neither of those needs: `parameters`, so
 * `rust-leaf-emitters.ts`'s `emitCallFunction` can tell which arguments need a `.clone()` at the call
 * site (see that function's own doc comment for why Rust — unlike cpp/Go — needs this).
 */
export interface IRustFunctionSignature {
  /** The function's own bare name (`pub fn <rustName>(...)` inside its own document module file). */
  readonly rustName: string;
  /**
   * The owning `function` document's own name — the module path segment a caller in a *different*
   * generated file needs (`crate::falang::<documentName>::<rustName>(...)`, see `emitCallFunction`),
   * since ADR 0019 (private)'s "Rust target — old-app layout" pass gives every function document its
   * own `.rs` file/module instead of one flat single-file output.
   */
  readonly documentName: string;
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
}

/** Project-wide inputs every statement/expression emitter needs, threaded down unchanged through the whole compile. */
export interface IRustCompileParams {
  readonly structNames: ReadonlyMap<string, string>;
  readonly structDefinitions: ReadonlyMap<string, IStructDefinition>;
  /** thread id -> owning `objects-structure` document's own name, for `crate::falang::<DocName>::<Struct>` qualification (see `rust-type-name.ts`). */
  readonly structDocuments: ReadonlyMap<string, string>;
  readonly functionSignatures: ReadonlyMap<string, IRustFunctionSignature>;
  readonly apiEndpoints: ReadonlyMap<string, IExternalApiEndpoint>;
}

/**
 * Like Go (and unlike C++), Rust has real labeled `break`/`continue` (`'label: loop { break 'label; }`)
 * — so this mirrors `IGoStatementContext`'s `loopLabels`/`usedLabels`/`labelCounter` mechanism exactly,
 * not the cpp target's `_break_level`/`_continue_level`/`_switch_break` counters. One real difference
 * from Go worth noting: Rust labels are lexically scoped to where they're declared, not scoped to the
 * *entire enclosing function* the way Go's are — so two sibling loops at the same nesting depth in
 * different branches could safely reuse the same label name in Rust without a collision. This context
 * still mints every label from a single function-wide `labelCounter` anyway, both to keep the
 * implementation a direct, low-risk port of the already-verified Go mechanism, and because nothing
 * about correctness depends on reusing names — a monotonically increasing counter is simplest and can
 * never collide, regardless of which of the two languages' scoping rules actually applies.
 */
export interface IRustStatementContext {
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  /**
   * The enclosing function's own declared return type — `undefined` for a `()`-returning function.
   * Used only by `rust-leaf-emitters.ts`'s `emitReturn` to decide whether the compiled return
   * expression needs an explicit narrowing/widening cast to match it (Rust has no implicit numeric
   * conversion at all, unlike C++'s implicit narrowing-on-return — see ADR 0019 (private)'s
   * numeric-coercion follow-up).
   */
  readonly returnValue?: TVariableInfo;
  readonly loopLabels: readonly string[];
  readonly usedLabels: Set<string>;
  readonly labelCounter: { value: number };
  readonly params: IRustCompileParams;
}

export interface ICompileChildrenOptions {
  readonly scopeOverrides?: Readonly<Record<string, TVariableInfo>>;
  readonly loopLabels?: readonly string[];
}

/** Compiles a (possibly nested) statement list back into Rust, scoped to the caller's own `ctx` plus any `scopeOverrides`/`loopLabels` override — same inversion-of-control shape as `go-statement-context.ts`'s `TCompileChildren`. */
export type TCompileChildren = (nodes: readonly INode[], options?: ICompileChildrenOptions) => string;

export const withScope = (ctx: IRustStatementContext, name: string, type: TVariableInfo): IRustStatementContext => ({
  ...ctx,
  scope: { ...ctx.scope, [name]: type },
});

/** A container's trailing `.out` jump (`break`/`continue`/`return`/`throw`), appended to its `children` — same convention as `go-statement-context.ts`'s `appendOut`. */
export const appendOut = (node: INode): readonly INode[] =>
  node.out ? [...(node.children ?? []), node.out] : (node.children ?? []);

export const wrapMarker = (node: INode, code: string): string =>
  code === '' ? code : `// icon-start:${node.name}:${node.id}\n${code}\n// icon-end:${node.name}:${node.id}`;

/**
 * Resolves an arbitrary expression's own DSL-level array type — used by `rust-leaf-emitters.ts`'s
 * `arr-*` emitters and `rust-control-flow-emitters.ts`'s `emitForeach` to know an array's *element*
 * type. A real, previously-latent gap found only by compiling the user's own `example-snake` project
 * (ADR 0019 (private)'s "Rust target — old-app layout" implementation notes): the earlier version of
 * this check only accepted a *plain identifier* already in `ctx.scope` (`ctx.scope[arrExpression]`),
 * rejecting a property-path expression like `state.snake.body` — a real, load-bearing shape that
 * project's own `arr-push`/`arr-unshift`/`arr-pop` nodes use throughout. Re-parses/re-type-checks
 * `expression` the same way `resolve-expression-number-type.ts`'s `resolveExpressionNumberType` does
 * (an acceptable small duplication, not shared with that file directly, since this needs the *unnarrowed*
 * `TVariableInfo`, not just a number type) — walks it through `numeric-coercion.ts`'s `resolveVariableInfo`,
 * which already understands property access and array element access, not just bare identifiers.
 */
export const resolveRustArrayType = (
  expression: string,
  ctx: IRustStatementContext,
  nodeId: string,
): TVariableInfo & IArrayTypeInfo => {
  const fileText = buildVirtualFileText(
    expression,
    ctx.scope,
    new Map(ctx.params.structNames),
    ctx.params.structDefinitions,
  );
  const { program, sourceFile } = createCheckedProgram(fileText);
  // oxlint-disable no-undefined -- mirrors resolveExpressionNumberType's own identical "type-check
  // failed -> no resolvable type" branch (resolve-expression-number-type.ts); the ternary's other arm
  // is a real `TVariableInfo | undefined`-returning call, so this can't be rephrased as a boolean-`&&`
  // without also risking a `false` value flowing into the array-type narrowing below.
  const resolved =
    getDiagnosticMessages(program).length === 0
      ? resolveVariableInfo(findExprInitializer(sourceFile), {
          scope: ctx.scope,
          structDefinitions: ctx.params.structDefinitions,
        })
      : undefined;
  // oxlint-enable no-undefined
  if (!resolved || resolved.type !== 'array') {
    throw new NodeCompileError(
      nodeId,
      `"${expression}" must resolve to an array-typed expression for Rust compilation`,
    );
  }
  return resolved;
};
