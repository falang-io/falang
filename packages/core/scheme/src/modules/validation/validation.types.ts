import { createSchemeToken } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { NodeStore } from '../../store/node.store.js';

export type TValidationSeverity = 'error' | 'warning';

/** One problem found on a node. Runtime state only — never persisted (see ADR 0068 (private)). */
export interface IValidationIssue {
  nodeId: string;
  /** The field of the node's block the problem belongs to, when known. */
  field?: string;
  message: string;
  severity: TValidationSeverity;
  /** The validator that produced it (`typescript`, `workflow`, …). Issues of different sources never overwrite each other. */
  source: string;
}

/** What a validator returns: `nodeId` defaults to the checked node, `source` is filled in by the module. */
export type TIssueDraft = Omit<IValidationIssue, 'nodeId' | 'source'> & { nodeId?: string };

export interface IValidationContext {
  readonly scheme: Scheme;
}

/**
 * A validation layer. `describe` is synchronous and cheap and may read any observable state (the node, other nodes,
 * registries): the module runs it inside a MobX reaction, so whatever it reads becomes its dependency and a change
 * re-runs it for exactly the nodes that depend on it. `check` does the actual work, possibly asynchronously, and is
 * only called (through the shared `ValidationQueue`) when the described input changed.
 *
 * Declared with method syntax on purpose, so a `INodeValidator<Specific>` is assignable to `INodeValidator<unknown>`.
 */
export interface INodeValidator<TInput = unknown> {
  readonly source: string;
  /** `null` — nothing to check; the source's issues for this node are cleared. */
  describe(node: NodeStore, ctx: IValidationContext): TInput | null;
  check(input: TInput, ctx: IValidationContext): TIssueDraft[] | Promise<TIssueDraft[]>;
  /** Equality key of an input; an unchanged key never re-queues. Default: `JSON.stringify(input)`. */
  key?(input: TInput): string;
}

/**
 * Validators contributed by other modules or hosts: register each one with
 * `scheme.container.registerInstance(TOKEN_NODE_VALIDATORS, validator)` in `register()` (several registrations
 * are fine); `ValidationModule` resolves them all in `initialize()`.
 */
export const TOKEN_NODE_VALIDATORS = createSchemeToken<INodeValidator>('NODE_VALIDATORS');
