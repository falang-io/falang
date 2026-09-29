import type { IProjectDocument } from '@falang/dto';
import { findTriggerDescriptor, type ITriggerFunctionBodyData } from '@falang/workflow-compiler';
import { TRIGGER_FUNCTION_NAME, type TTriggerFunctionBodyData } from '@falang/workflow-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';

export interface IStartDeliveryResolution {
  /** Whether this document can serve an ad-hoc "Run now" execution at all. */
  readonly runnable: boolean;
  /** Args to start the execution with, when `runnable`. `undefined` when it isn't. */
  readonly args?: readonly unknown[];
}

/**
 * Decides whether `document` can serve `BuildService.startDevRun`'s ad-hoc "Run now", and with which
 * args — see ADR 0037 (private) §7 ("Toolbar 'Run' for a `delivery: 'start'`
 * trigger-function: starts it with a synthesized `fire`").
 *
 * - A plain `function` document is always runnable, with the client's own `args` unchanged.
 * - A `trigger-function` is runnable only when its bound trigger declares `delivery: 'start'` (a
 *   `schedule-*` trigger — the only kind today — which can only ever be *started*, never signalled).
 *   A `delivery: 'signal'` trigger-function (the default — Telegram, webhook, …) is not runnable this
 *   way, same as before this existed (it was never accepted by `startDevRun`'s own
 *   `document.type === 'function'` check).
 * - Anything else (an unbound/unknown vendor, a document with no root, any other document type) is
 *   not runnable.
 *
 * The synthesized args mirror the vendor's own payload shape (`{ scheduledAt, timezone }`, see
 * `@falang/workflow-integrations-schedule`'s `Fire` struct). `scheduledAt` is overwritten anyway by
 * the compiled `'start'` preamble's own `TemporalScheduledStartTime` fallback
 * (`@falang/workflow-compiler`'s `compileTriggerFunction`) when there's no real Temporal Schedule
 * behind a manual run — but is still filled in here so a run started with no `args` at all still gets
 * a readable payload. `timezone` is **not** recomputed by the compiler, so it has to come from here:
 * `triggerConfig.timezone` if the trigger was configured with one, else `'UTC'`.
 */
export const resolveStartDeliveryArgs = (
  document: Pick<IProjectDocument, 'type' | 'root'>,
  integrations: readonly IWorkflowIntegration[],
  clientArgs: readonly unknown[],
): IStartDeliveryResolution => {
  if (document.type === 'function') return { runnable: true, args: clientArgs };
  if (document.type !== TRIGGER_FUNCTION_NAME) return { runnable: false };

  const [, body] = document.root?.children ?? [];
  if (!body) return { runnable: false };

  const bodyData = body.data as TTriggerFunctionBodyData;
  const trigger = findTriggerDescriptor(bodyData as ITriggerFunctionBodyData, integrations);
  if (trigger?.delivery !== 'start') return { runnable: false };

  return {
    runnable: true,
    args: [{ scheduledAt: new Date().toISOString(), timezone: bodyData.triggerConfig?.timezone ?? 'UTC' }],
  };
};
