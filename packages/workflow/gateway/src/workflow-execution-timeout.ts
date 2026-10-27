import type { Duration } from '@temporalio/common';

/**
 * Default `workflowExecutionTimeout` of every execution the backend starts (webhook/trigger `signalWithStart`, manual and
 * debug runs, schedule fires) — security audit P1-4. Generous on purpose: a trigger workflow may legitimately wait weeks
 * for a human answer (`human-task`), so this only bounds a runaway or leaked execution, not a slow one.
 * Override with `WORKFLOW_EXECUTION_TIMEOUT` (`"30 days"`, `"12h"`, …); `0`, `off` or `none` disables the bound.
 */
export const DEFAULT_WORKFLOW_EXECUTION_TIMEOUT = '30 days';

const DURATION_PATTERN = /^\d+(\.\d+)?\s*(ms|s|m|h|d|w|seconds?|minutes?|hours?|days?|weeks?)$/i;

/** Parses `WORKFLOW_EXECUTION_TIMEOUT`; throws on a malformed value so a typo fails the boot, not every start. */
export const parseWorkflowExecutionTimeout = (raw: string | undefined): Duration | undefined => {
  const text = (raw ?? DEFAULT_WORKFLOW_EXECUTION_TIMEOUT).trim();
  if (text === '0' || /^(off|none)$/i.test(text)) return;
  if (!DURATION_PATTERN.test(text)) {
    throw new Error(`Invalid WORKFLOW_EXECUTION_TIMEOUT "${text}" (expected e.g. "30 days" or "12h"; "off" disables)`);
  }
  return text as Duration;
};

/** The `workflowExecutionTimeout` option fragment (empty when disabled) for `client.workflow.start`/`signalWithStart`. */
export const executionTimeoutOptions = (timeout: Duration | undefined): { workflowExecutionTimeout?: Duration } =>
  timeout ? { workflowExecutionTimeout: timeout } : {};
