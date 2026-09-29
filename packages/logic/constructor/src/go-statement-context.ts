import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IStructDefinition } from './struct-definition.js';
import type { IExternalApiEndpoint } from './external-api-registry.js';

/** Resolves a `call-function` node's target to the Go function it should call, plus its return type — same role as `cpp-statement-context.ts`'s `ICppFunctionSignature`. */
export interface IGoFunctionSignature {
  readonly goName: string;
  readonly returnValue?: TVariableInfo;
}

/** Project-wide inputs every statement/expression emitter needs, threaded down unchanged through the whole compile. */
export interface IGoCompileParams {
  readonly structNames: ReadonlyMap<string, string>;
  readonly structDefinitions: ReadonlyMap<string, IStructDefinition>;
  readonly functionSignatures: ReadonlyMap<string, IGoFunctionSignature>;
  readonly apiEndpoints: ReadonlyMap<string, IExternalApiEndpoint>;
}

/**
 * Unlike `ICppStatementContext` (which tracks `nesting`/`cycleInfo` for the `_break_level`/
 * `_switch_break` counter mechanism), Go supports real labeled `break`/`continue` — the same
 * mechanism `@falang/workflow-compiler`'s TS target already uses (`node-emitters.ts`'s
 * `loopLabels`/`usedLabels`). `loopLabels` grows one entry per enclosing loop (a `switch` doesn't
 * push one — `continue Label` can only ever target a Go `for` loop, never a `switch`, so labels are
 * only ever assigned to loop constructs); `usedLabels` is a single mutable `Set` shared across the
 * whole function compile so a loop, once its own body has been compiled, can tell whether its label
 * actually got referenced by a nested `break`/`continue` — an unused Go label is a compile error, so
 * the label prefix (`L1: for ...`) is only printed when it was.
 */
export interface IGoStatementContext {
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  /**
   * The enclosing function's own declared return type — `undefined` for a `void` function. Used only
   * by `go-leaf-emitters.ts`'s `emitReturn` to decide whether the compiled return expression needs an
   * explicit narrowing/widening cast to match it (Go has no implicit numeric conversion at all, unlike
   * C++'s implicit narrowing-on-return — see ADR 0019 (private)'s numeric-coercion follow-up).
   */
  readonly returnValue?: TVariableInfo;
  readonly loopLabels: readonly string[];
  readonly usedLabels: Set<string>;
  /**
   * A single mutable counter shared across the whole function compile, used to mint every loop's
   * label (`L<n>`). Go labels are scoped to the *entire enclosing function*, not to the lexical block
   * they're declared in — so naming a label after `loopLabels.length` (nesting depth) collides as soon
   * as two loops sit at the same depth in different branches (e.g. two `from-to-cycle`s in different
   * `switch-option`s, or two sequential top-level loops): both would compute the same "next" depth and
   * emit the same `L<n>` name, which `go build` rejects ("label L2 already defined"). A
   * monotonically-increasing counter guarantees every loop in a function gets a distinct label.
   */
  readonly labelCounter: { value: number };
  readonly params: IGoCompileParams;
}

export interface ICompileChildrenOptions {
  readonly scopeOverrides?: Readonly<Record<string, TVariableInfo>>;
  readonly loopLabels?: readonly string[];
}

/** Compiles a (possibly nested) statement list back into Go, scoped to the caller's own `ctx` plus any `scopeOverrides`/`loopLabels` override — same inversion-of-control shape as `cpp-statement-context.ts`'s `TCompileChildren`. */
export type TCompileChildren = (nodes: readonly INode[], options?: ICompileChildrenOptions) => string;

export const withScope = (ctx: IGoStatementContext, name: string, type: TVariableInfo): IGoStatementContext => ({
  ...ctx,
  scope: { ...ctx.scope, [name]: type },
});

/** A container's trailing `.out` jump (`break`/`continue`/`return`/`throw`), appended to its `children` — same convention as `cpp-statement-context.ts`'s `appendOut`. */
export const appendOut = (node: INode): readonly INode[] =>
  node.out ? [...(node.children ?? []), node.out] : (node.children ?? []);

export const wrapMarker = (node: INode, code: string): string =>
  code === '' ? code : `// icon-start:${node.name}:${node.id}\n${code}\n// icon-end:${node.name}:${node.id}`;
