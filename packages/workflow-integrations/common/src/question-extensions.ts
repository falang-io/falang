import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * `IQuestionDescriptor`'s three extensions (ADR 0040 (private) §4),
 * split into their own file purely to keep `types.ts` under the repo's soft `max-lines` budget —
 * `IQuestionDescriptor` itself (`types.ts`) `extends` this.
 */
export interface IQuestionDescriptorExtensions {
  /**
   * Name of a `text`-kind field among `contextFields`/`questionFields` holding a duration string
   * (`parseDurationToMs`'s syntax, e.g. `'48h'`/`'10m'`) — an empty value means "no timeout" (the
   * question waits forever, today's behavior). When non-empty, `question-emitters.ts` waits with
   * `condition(() => hasAnswer, ms)` instead of a bare `condition(() => hasAnswer)`; on expiry it
   * calls `closeActivitySignature` (if set) with `reason: 'expired'` and takes a fixed, automatic
   * `timeout` branch — see `buildQuestionNodeConfig`, which adds that branch to every node of a
   * descriptor with this field set, not user-deletable/renamable/reorderable.
   */
  readonly timeoutField?: string;
  /**
   * Binds the signal payload into scope inside every option branch — `variableName`/`type` are
   * always bound (e.g. a `human-task`'s `task: Task`); `perOptionData: true` additionally binds the
   * payload's `data` inside each *non-`void`* option's own branch, typed by that option's own
   * `dataType` (`optionDataTypes` below) — the exact per-branch typed-scope mechanism
   * `call-ai-choice-option` already uses (`@falang/typescript-common`'s `getContainerScopeContribution`),
   * reused here via a *dynamically* registered contributor (`registerQuestionScopeContributors`,
   * `question-scope-contributor.ts`) since the option's node name/variable name/type all come from
   * this descriptor at runtime rather than being statically known ahead of time. Setting this widens
   * the signal payload type the compiled `setHandler` accepts from `{ messageid, value }` to also
   * carry `data`/`resolvedBy`/`resolvedAt` — see `question-emitters.ts`.
   */
  readonly answerScope?: {
    readonly variableName: string;
    readonly type: TVariableInfo;
    readonly perOptionData?: boolean;
  };
  /**
   * Called on the timeout path (`reason: 'expired'`) and from a `try/finally` around the whole wait
   * (`reason: 'cancelled'`, inside `CancellationScope.nonCancellable`, so a cancelled workflow still
   * gets to close whatever it was waiting on) — e.g. a `human-task`'s "mark this row closed" call, or
   * `telegram-question`'s own `resolve` activity repurposed to strip the buttons and say "expired"/
   * "cancelled" instead of "you picked X". Signature is
   * `'<name>(...contextArgs, messageId: string, reason: "expired" | "cancelled"): Promise<void>'`.
   * Both fields are optional together — a descriptor with neither `timeoutField` nor a cancellable
   * wait it cares about closing simply omits both, same as today.
   */
  readonly closeActivitySignature?: string;
  readonly closeActivityCode?: string;
  /**
   * When set, every `<name>-option` carries `{ label, dataType, prompt? }` instead of a bare
   * `{ label }` — `dataType` (`TTaskOptionDataType`) is the type of the value a resolver supplies for
   * that option (`'void'` for a bare button), `prompt` is that input's on-page caption. See
   * `build-question-node-config.ts`.
   */
  readonly optionDataTypes?: boolean;
}

/** The three scalar-or-void types a `human-task`/similar option's resolution value may have — see `optionDataTypes` above. `'void'` is a bare button, no value collected. */
export type TTaskOptionDataType = 'void' | 'string' | 'number' | 'boolean';

/** An option's `data` shape when its descriptor sets `optionDataTypes: true` — see `buildQuestionNodeConfig`. */
export interface IQuestionOptionDataWithType {
  readonly label: string;
  readonly dataType: TTaskOptionDataType;
  readonly prompt?: string;
  /** Set only on the automatic `timeout` option `timeoutField` adds — never user-deletable/renamable, always last. */
  readonly fixed?: boolean;
}

/** `TTaskOptionDataType` → the `TVariableInfo` `answerScope.perOptionData`'s bound `data` variable is typed as inside that option's own branch. `'void'` has no mapping — callers must check for it first (no `data` variable is bound at all for a void option). */
export const taskOptionDataTypeToVariableInfo = (dataType: Exclude<TTaskOptionDataType, 'void'>): TVariableInfo => {
  if (dataType === 'number') return { type: 'number', numberType: { type: 'any' } };
  if (dataType === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
};
