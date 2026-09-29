import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IDebugTracePoint } from '@falang/debug';
import type { IStructDefinition } from './struct-definition.js';
import type { ILanguageAdapter } from './language-adapter.js';
import type { ICycleInfo, TNestingFrame } from './cycle-info.js';
import type { IExternalApiEndpoint } from './external-api-registry.js';

/** Resolves a `call-function` node's target (`schemeId`, another `function` document in the project) to the cpp function it should call, plus its signature — the return type is needed to declare `returnVariable`'s C++ type (unlike TS's `const x = ...`, C++ can't infer it from an opaque call alone here). */
export interface ICppFunctionSignature {
  readonly cppName: string;
  readonly returnValue?: TVariableInfo;
}

/** Project-wide inputs every statement/expression emitter needs, threaded down unchanged through the whole compile (see `ICppStatementContext`). `adapter` drives every expression `compileExpr` compiles (see `compile-cpp-expr.ts`) — passing a different `ILanguageAdapter` (e.g. an Arduino-specific one built outside this package) is the intended way to reuse this whole statement compiler for a different C++-family target without this package ever needing to know about it. `extraDeclarations` (see `ICompileExpressionWithAdapterParams`) is the same idea for globals that aren't scope variables at all — a target platform's builtin API. */
export interface ICppCompileParams {
  readonly structNames: ReadonlyMap<string, string>;
  readonly structDefinitions: ReadonlyMap<string, IStructDefinition>;
  readonly functionSignatures: ReadonlyMap<string, ICppFunctionSignature>;
  readonly adapter: ILanguageAdapter;
  readonly extraDeclarations?: readonly string[];
  readonly apiEndpoints: ReadonlyMap<string, IExternalApiEndpoint>;
}

// `TNestingFrame`/`ICycleInfo` live in `cycle-info.ts` (shared with the C# target, whose multi-level
// break/continue mechanism is the same counter scheme for the same language reason — no labeled
// break/continue), re-exported here so `ICppStatementContext`'s own consumers keep importing them
// from this file.
export type { ICycleInfo, TNestingFrame } from './cycle-info.js';

/**
 * A target's own text emitter for the opt-in debug-instrumentation pass (ADR 0021 (private) §4/§6)
 * — the compiler (`compile-cpp-statements.ts`/`compile-cpp-function.ts`) decides *when* to call this
 * (assigns dense trace-point indexes, assembles the `IDebugMap`) and never inspects what text comes
 * back; a target (Arduino's `falang_debug.h`, a future host-cpp stdio tracer, see the ADR's Phase 3
 * backlog) knows how to turn `(node, index, scope)` into a real trace call. `emitEnter`/`emitLeave`
 * bracket one compiled function's body for call-depth tracking (needed for "step over") — in C++ this
 * is naturally an RAII guard, so a target may return the guard's declaration from `emitEnter` and `''`
 * from `emitLeave` (the guard's destructor fires on every return path, including early `return`s).
 */
export interface ITraceEmitter {
  emitTrace(node: INode, index: number, scope: Readonly<Record<string, TVariableInfo>>): string;
  emitEnter(): string;
  emitLeave(): string;
  /**
   * Narrows/reorders the scope a trace point actually reports — e.g. Arduino's tracer drops types
   * `falang_var` has no overload for (arrays, structs, strings; see its own file comment). The
   * compiler runs this *before* both recording `IDebugMap`'s `variables` entry for this site and
   * calling `emitTrace`, so the two never disagree about which positional `varIdx` means which
   * variable — omitted, every scope variable is traced (workflow-style "snapshot everything").
   */
  selectVariables?(scope: Readonly<Record<string, TVariableInfo>>): Readonly<Record<string, TVariableInfo>>;
}

/**
 * Per-document debug-compile state, threaded through `ICppStatementContext.debug`. `allocateIndex` is
 * a project-wide shared counter supplied by the caller (e.g. `compileArduinoProject`), so trace-point
 * indexes stay dense and unique across every document in one project — the same "one counter, many
 * documents" shape `@falang/workflow-compiler`'s own debug-emit options use. `onTracePoint` is called
 * once per allocated index so the caller can assemble the final `@falang/debug` `IDebugMap`.
 */
export interface IDebugCompileOptions {
  readonly tracer: ITraceEmitter;
  readonly documentId: string;
  readonly allocateIndex: () => number;
  readonly onTracePoint: (site: IDebugTracePoint) => void;
}

/** Threaded through the whole statement compile — `scope`/`nesting` grow going *down* into a nested block and never leak back *up* to sibling statements (block scoping), while `cycleInfo`/`params`/`debug` are fixed for the whole function. `debug` is only set when this compile has opted into trace instrumentation (see `ITraceEmitter`); its absence must leave the emitted code byte-identical to a pre-debug compile. */
export interface ICppStatementContext {
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  readonly nesting: readonly TNestingFrame[];
  readonly cycleInfo: ICycleInfo;
  readonly params: ICppCompileParams;
  readonly debug?: IDebugCompileOptions;
}

export interface ICompileChildrenOptions {
  readonly scopeOverrides?: Readonly<Record<string, TVariableInfo>>;
  readonly nesting?: readonly TNestingFrame[];
}

/** Compiles a (possibly nested) statement list back into C++, scoped to the caller's own `ctx` plus any `scopeOverrides`/`nesting` override — the same "inversion of control" shape `@falang/workflow-compiler`'s own `TCompileChildren` uses to let `cpp-control-flow-emitters.ts` recurse into `compile-cpp-statements.ts` without a circular import. */
export type TCompileChildren = (nodes: readonly INode[], options?: ICompileChildrenOptions) => string;

export const withScope = (ctx: ICppStatementContext, name: string, type: TVariableInfo): ICppStatementContext => ({
  ...ctx,
  scope: { ...ctx.scope, [name]: type },
});

/** A container's trailing `.out` jump (`break`/`continue`/`return`/`throw`), appended to its `children` — mirrors `@falang/workflow-compiler`'s `appendOut` (`.out` is never part of `children` itself). */
export const appendOut = (node: INode): readonly INode[] =>
  node.out ? [...(node.children ?? []), node.out] : (node.children ?? []);

export const wrapMarker = (node: INode, code: string): string =>
  code === '' ? code : `// icon-start:${node.name}:${node.id}\n${code}\n// icon-end:${node.name}:${node.id}`;
