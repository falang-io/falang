import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IFunctionBodyParameter } from './function-signature.js';
import type { IStructDefinition } from './struct-definition.js';
import type { ICycleInfo, TNestingFrame } from './cycle-info.js';
import type { IExternalApiEndpoint } from './external-api-registry.js';

export type { ICycleInfo, TNestingFrame } from './cycle-info.js';

/**
 * Resolves a `call-function` node's target to the C# method it should call, plus its signature. Like
 * `IRustFunctionSignature` (and unlike the cpp/Go ones) this carries `parameters` too, so
 * `sharp-leaf-emitters.ts`'s `emitCallFunction` can copy/cast each argument to its declared parameter
 * type — see `sharp-value.ts`'s `toSharpTypedValue` for why C# needs that.
 */
export interface ISharpFunctionSignature {
  readonly sharpName: string;
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
}

/** Project-wide inputs every statement/expression emitter needs, threaded down unchanged through the whole compile. */
export interface ISharpCompileParams {
  readonly structNames: ReadonlyMap<string, string>;
  readonly structDefinitions: ReadonlyMap<string, IStructDefinition>;
  readonly functionSignatures: ReadonlyMap<string, ISharpFunctionSignature>;
  readonly apiEndpoints: ReadonlyMap<string, IExternalApiEndpoint>;
}

/**
 * C#, like C++ (and unlike TS/Go/Rust), has **no labeled `break`/`continue`** — a native `break;`
 * inside a `switch` escapes only the switch, and there is no way to name an outer loop. So this
 * target reuses the cpp target's own `_break_level`/`_continue_level`/`_switch_break` counter
 * mechanism verbatim (`nesting`/`cycleInfo`, computed by the shared `cycle-info.ts`), not Go's/Rust's
 * label mechanism — the same mechanism the old app's own C# codegen used, for the same reason
 * (confirmed by reading old `sharpLogicIconsBuilder.ts`'s `writeCycleBottomInfo`/`switch` builders,
 * which emit the identical counter bookkeeping).
 *
 * C# does have `goto Label;`, which *can* jump out of a loop and would be an alternative multi-level
 * mechanism — deliberately not used: the counter scheme is already proven on this repo's cpp target
 * (and on the old app's own C# output), while `goto`-based unwinding would be new, unproven output
 * shape whose interaction with `continue` (which needs a label at the *end* of the target loop's body,
 * not after the loop) is materially trickier than the flag it would replace.
 *
 * `returnValue` is the *current function's* declared return type — needed by `emitReturn` to cast the
 * returned expression (C# has no implicit narrowing conversion, unlike C++); it's the one field no
 * other target's statement context carries.
 */
export interface ISharpStatementContext {
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  readonly nesting: readonly TNestingFrame[];
  readonly cycleInfo: ICycleInfo;
  readonly returnValue?: TVariableInfo;
  readonly params: ISharpCompileParams;
}

export interface ICompileChildrenOptions {
  readonly scopeOverrides?: Readonly<Record<string, TVariableInfo>>;
  readonly nesting?: readonly TNestingFrame[];
}

/** Compiles a (possibly nested) statement list back into C#, scoped to the caller's own `ctx` plus any `scopeOverrides`/`nesting` override — same inversion-of-control shape as `cpp-statement-context.ts`'s `TCompileChildren`. */
export type TCompileChildren = (nodes: readonly INode[], options?: ICompileChildrenOptions) => string;

export const withScope = (ctx: ISharpStatementContext, name: string, type: TVariableInfo): ISharpStatementContext => ({
  ...ctx,
  scope: { ...ctx.scope, [name]: type },
});

/** A container's trailing `.out` jump (`break`/`continue`/`return`/`throw`), appended to its `children` — same convention as every other target's own `appendOut`. */
export const appendOut = (node: INode): readonly INode[] =>
  node.out ? [...(node.children ?? []), node.out] : (node.children ?? []);

export const wrapMarker = (node: INode, code: string): string =>
  code === '' ? code : `// icon-start:${node.name}:${node.id}\n${code}\n// icon-end:${node.name}:${node.id}`;
