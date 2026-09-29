import type { IActivityOptions, IFieldSelectOption } from '@falang/workflow-integrations-common';

/** Every op is a long-running, heartbeating call into the `media` service — never a 10s local activity. See ADR 0041 (private) §3. */
export const MEDIA_ACTIVITY_OPTIONS: IActivityOptions = {
  kind: 'regular',
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '1 minute',
};

export const emitCall = (call: string, resultVariable: string): string =>
  resultVariable ? `const ${resultVariable} = ${call};` : `${call};`;

/** A `text`/`select`-kind field's stored value flows into activity code verbatim as a `string` (see `@falang/workflow-compiler`'s `resolveFieldExpression`) — `TIntegrationFieldKind` has no dedicated boolean kind, so every op's boolean-shaped param (`reencode`/`mono`) is one of these two `select` options instead, parsed with `=== 'true'` (default `false`) inside the action's own `activityCode`. */
export const BOOLEAN_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'true', label: 'True' },
  { value: 'false', label: 'False' },
];
