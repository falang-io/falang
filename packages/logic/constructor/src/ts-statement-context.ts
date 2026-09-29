import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IStructDefinition } from './struct-definition.js';
import type { IFunctionBodyParameter } from './function-signature.js';

/** Resolves a `call-function` node's target to the TS function it should call — unlike `IGoFunctionSignature`, this also carries the callee's own declared parameter *names* (not just types), since a TS call compiles to a single keyed object argument (`await Fn({ a: x, _falangGlobal })`, see ADR 0019 (private)'s "TypeScript target" implementation notes) rather than Go/cpp's positional argument list. */
export interface ITsFunctionSignature {
  readonly tsName: string;
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
}

/**
 * A `call-api` node's target endpoint, scoped with the extra document/group hierarchy the TS target
 * needs to fully-qualify a call as `_falangGlobal.apis.<ApiDoc>.<Group>.<Endpoint>(...)` (Contract 4)
 * — unlike Go/cpp/C#, which each get one interface per *group* (`external-api-registry.ts`'s own
 * `apiName`) with no containing document concept at all. Built directly from
 * `buildExternalApiRegistry`'s own `documentName`/`apiName` fields (that registry already tracks
 * document ownership for `compileRustProject`'s flattened `<ApiDoc>_<Group>_<Endpoint>` naming, see
 * `external-api-registry.ts`) — nothing here re-walks the project's documents a second time.
 */
export interface ITsApiEndpoint {
  readonly apiDocName: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly name: string;
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
}

/** Project-wide inputs every TS statement/expression emitter needs, threaded down unchanged through the whole compile — the TS-target analogue of `IGoCompileParams`. */
export interface ITsCompileParams {
  readonly structNames: ReadonlyMap<string, string>;
  readonly structDefinitions: ReadonlyMap<string, IStructDefinition>;
  readonly functionSignatures: ReadonlyMap<string, ITsFunctionSignature>;
  readonly apiEndpoints: ReadonlyMap<string, ITsApiEndpoint>;
}

/**
 * TS, like Go and Rust, has real labeled `break`/`continue` — so multi-level break/continue uses the
 * exact same `loopLabels`/`usedLabels`/`counter` mechanism as `go-statement-context.ts`'s
 * `IGoStatementContext` (see that file's own doc comment for why a monotonic counter, not nesting
 * depth, mints each label). `counter` is also reused to mint a synthetic `foreach` index variable name
 * when the DSL's own `index` field is blank (`ts-control-flow-emitters.ts`'s `emitForeach`) — one
 * shared monotonic source for every name this compile needs to be unique, matching the "one counter,
 * multiple mint helpers" shape `nextLoopLabel`/`nextTempName` both use below.
 */
export interface ITsStatementContext {
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  readonly loopLabels: readonly string[];
  readonly usedLabels: Set<string>;
  readonly counter: { value: number };
  readonly params: ITsCompileParams;
}

export interface ICompileChildrenOptions {
  readonly scopeOverrides?: Readonly<Record<string, TVariableInfo>>;
  readonly loopLabels?: readonly string[];
}

/** Compiles a (possibly nested) statement list back into TS, scoped to the caller's own `ctx` plus any `scopeOverrides`/`loopLabels` override — same inversion-of-control shape as `go-statement-context.ts`'s `TCompileChildren`. */
export type TCompileChildren = (nodes: readonly INode[], options?: ICompileChildrenOptions) => string;

export const withScope = (ctx: ITsStatementContext, name: string, type: TVariableInfo): ITsStatementContext => ({
  ...ctx,
  scope: { ...ctx.scope, [name]: type },
});

/** A container's trailing `.out` jump (`break`/`continue`/`return`/`throw`), appended to its `children` — same convention as `go-statement-context.ts`'s own `appendOut`. */
export const appendOut = (node: INode): readonly INode[] =>
  node.out ? [...(node.children ?? []), node.out] : (node.children ?? []);

export const wrapMarker = (node: INode, code: string): string =>
  code === '' ? code : `// icon-start:${node.name}:${node.id}\n${code}\n// icon-end:${node.name}:${node.id}`;

/** Mints this loop's own label from the shared, function-wide `counter` — see this file's own doc comment on why a monotonic counter, not nesting depth, is needed. */
export const nextLoopLabel = (ctx: ITsStatementContext): string => {
  ctx.counter.value += 1;
  return `L${ctx.counter.value}`;
};

/** Mints a synthetic, function-wide-unique name (e.g. a `foreach` index variable when the DSL's own `index` field is blank) — same monotonic source as `nextLoopLabel`, just a different prefix. */
export const nextTempName = (ctx: ITsStatementContext, prefix: string): string => {
  ctx.counter.value += 1;
  return `${prefix}${ctx.counter.value}`;
};
