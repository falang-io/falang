import type { IActivityOptions, IWorkflowIntegration } from '@falang/workflow-integrations-common';

/**
 * One activity name/signature `buildWorkflowPreamble` proxies at module scope, plus the
 * `IActionDescriptor.activityOptions`/`IQuestionDescriptor.activityOptions`/`IChoiceDescriptor.activityOptions`
 * that descriptor asked for — absent means today's local/10s/SDK-default behavior, see
 * `IActivityOptions`. Split out of `compile-project.ts` (ADR 0038 (private)
 * §3) purely to keep that file under the repo's `max-lines` lint budget.
 */
export interface IActivityProxyEntry {
  readonly name: string;
  readonly signature: string;
  readonly options?: IActivityOptions;
}

const LOG_ACTIVITY_PROXY: IActivityProxyEntry = {
  name: 'logActivity',
  signature: 'logActivity(message: string): Promise<string>',
};

/** Backs the single generic `activepieces-action` node kind — see `leaf-emitters.ts`/`compile-activities.ts`. */
const RUN_ACTIVEPIECES_ACTION_PROXY: IActivityProxyEntry = {
  name: 'runActivepiecesAction',
  signature:
    'runActivepiecesAction(credentialId: string, pieceName: string, actionName: string, propsValue: Record<string, unknown>): Promise<unknown>',
};

/** `IActionDescriptor.activitySignature` is `'<name>(...): Promise<...>'` — the bare name is everything before the first `(`. */
const parseActivityName = (signature: string): string => signature.slice(0, signature.indexOf('(')).trim();

/** `integrations` should already be only the ones the project uses (see `selectUsedIntegrations`); `includeActivepiecesAction` (default `true`) gates `runActivepiecesAction` the same way. */
export const collectActivityProxyEntries = (
  integrations: readonly IWorkflowIntegration[],
  options: { readonly includeActivepiecesAction?: boolean } = {},
): readonly IActivityProxyEntry[] => [
  LOG_ACTIVITY_PROXY,
  ...((options.includeActivepiecesAction ?? true) ? [RUN_ACTIVEPIECES_ACTION_PROXY] : []),
  ...integrations.flatMap((integration) => [
    ...integration.actions.map((action) => ({
      name: parseActivityName(action.activitySignature),
      signature: action.activitySignature,
      options: action.activityOptions,
    })),
    // Ask, resolve, and (when set) close share one question's `activityOptions` — see its own doc
    // comment; `closeActivitySignature` is optional (ADR 0040 (private) §4), unlike the other two.
    ...(integration.questions ?? []).flatMap((question) => {
      const entries: IActivityProxyEntry[] = [
        {
          name: parseActivityName(question.askActivitySignature),
          signature: question.askActivitySignature,
          options: question.activityOptions,
        },
        {
          name: parseActivityName(question.resolveActivitySignature),
          signature: question.resolveActivitySignature,
          options: question.activityOptions,
        },
      ];
      if (question.closeActivitySignature) {
        entries.push({
          name: parseActivityName(question.closeActivitySignature),
          signature: question.closeActivitySignature,
          options: question.activityOptions,
        });
      }
      return entries;
    }),
    ...(integration.choices ?? []).map((choice) => ({
      name: parseActivityName(choice.activitySignature),
      signature: choice.activitySignature,
      options: choice.activityOptions,
    })),
  ]),
];

/** `IActivityOptions` with every default filled in and every optional field either present or entirely absent (never `undefined`) — see `canonicalizeActivityOptions`. */
export interface ICanonicalActivityOptions {
  readonly kind: 'local' | 'regular';
  readonly startToCloseTimeout: string;
  readonly heartbeatTimeout?: string;
  readonly retry?: { readonly maximumAttempts?: number; readonly nonRetryableErrorTypes?: readonly string[] };
}

/** The options every entry gets when its descriptor leaves `activityOptions` unset — today's only behavior, kept as the always-first preamble group (see `groupActivityProxyEntries`'s doc comment). */
const DEFAULT_ACTIVITY_OPTIONS: ICanonicalActivityOptions = { kind: 'local', startToCloseTimeout: '10 seconds' };

/**
 * Fills in every `IActivityOptions` default and drops `undefined` optional fields, so two
 * `activityOptions` values that only differ in which fields their descriptor happened to omit still
 * canonicalize (and therefore group, see `groupActivityProxyEntries`) identically.
 */
const canonicalizeActivityOptions = (options: IActivityOptions | undefined): ICanonicalActivityOptions => ({
  kind: options?.kind ?? DEFAULT_ACTIVITY_OPTIONS.kind,
  startToCloseTimeout: options?.startToCloseTimeout ?? DEFAULT_ACTIVITY_OPTIONS.startToCloseTimeout,
  ...(options?.heartbeatTimeout ? { heartbeatTimeout: options.heartbeatTimeout } : {}),
  ...(options?.retry
    ? {
        retry: {
          ...(typeof options.retry.maximumAttempts === 'number'
            ? { maximumAttempts: options.retry.maximumAttempts }
            : {}),
          ...(options.retry.nonRetryableErrorTypes
            ? { nonRetryableErrorTypes: options.retry.nonRetryableErrorTypes }
            : {}),
        },
      }
    : {}),
});

/** A stable, field-order-independent key for a canonicalized `IActivityOptions` — see `canonicalizeActivityOptions`'s doc comment for why canonicalizing first matters. Field insertion order is fixed by `canonicalizeActivityOptions` itself, so `JSON.stringify` alone is deterministic here. */
const activityOptionsKey = (options: ICanonicalActivityOptions): string => JSON.stringify(options);

export interface IActivityProxyGroup {
  readonly options: ICanonicalActivityOptions;
  readonly entries: readonly IActivityProxyEntry[];
}

/**
 * Groups activity proxy entries by their canonicalized `activityOptions`, one `proxyLocalActivities`/
 * `proxyActivities` destructuring per group — entries with no `activityOptions` (or an
 * options-equivalent explicit one) land in one group together, keyed by `DEFAULT_ACTIVITY_OPTIONS`.
 * `logActivity` is always the first entry `collectActivityProxyEntries` returns and always
 * default-options, so that group is always non-empty and — since `Map` preserves
 * insertion order — always the first group iterated, without needing to special-case "put the default
 * group first": every other group then follows in the order its first entry appeared.
 */
export const groupActivityProxyEntries = (entries: readonly IActivityProxyEntry[]): readonly IActivityProxyGroup[] => {
  const groups = new Map<string, { options: ICanonicalActivityOptions; entries: IActivityProxyEntry[] }>();
  for (const entry of entries) {
    const options = canonicalizeActivityOptions(entry.options);
    const key = activityOptionsKey(options);
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(key, { options, entries: [entry] });
    }
  }
  return [...groups.values()];
};

/** `retry`'s own fields, inlined as one object-literal line — only the fields the group's canonicalized options actually carry. */
const buildRetryLiteral = (retry: NonNullable<ICanonicalActivityOptions['retry']>): string => {
  const fields: string[] = [];
  if (typeof retry.maximumAttempts === 'number') fields.push(`maximumAttempts: ${retry.maximumAttempts}`);
  if (retry.nonRetryableErrorTypes)
    fields.push(`nonRetryableErrorTypes: ${JSON.stringify(retry.nonRetryableErrorTypes)}`);
  return `{ ${fields.join(', ')} }`;
};

/** One `const { ... } = proxyLocalActivities<{ ... }>({ ... });`/`proxyActivities<...>` block for one group. */
export const buildActivityProxyGroupCode = (group: IActivityProxyGroup): string => {
  const names = group.entries.map((entry) => entry.name).join(', ');
  const signatures = group.entries.map((entry) => entry.signature).join('; ');
  const proxyFn = group.options.kind === 'regular' ? 'proxyActivities' : 'proxyLocalActivities';
  const optionsLines = [
    `  startToCloseTimeout: '${group.options.startToCloseTimeout}',`,
    ...(group.options.heartbeatTimeout ? [`  heartbeatTimeout: '${group.options.heartbeatTimeout}',`] : []),
    ...(group.options.retry ? [`  retry: ${buildRetryLiteral(group.options.retry)},`] : []),
  ];
  return [`const { ${names} } = ${proxyFn}<{ ${signatures} }>({`, ...optionsLines, '});'].join('\n');
};
