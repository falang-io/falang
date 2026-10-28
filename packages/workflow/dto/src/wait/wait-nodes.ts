import { zod, type IDataInfo, type INodeConfig } from '@falang/dto';

export const WAIT_NAME = 'wait';

const waitDataType = {
  type: zod
    .string()
    .describe(
      "TypeScript expression for how long to pause: milliseconds as a number (e.g. `24 * 60 * 60 * 1000`, `bookingAt - Date.now()`) or a duration string literal (e.g. `'30 minutes'`, `'1 day'`). A negative number waits 0.",
    ),
  default: () => "'1 hour'",
} as const satisfies IDataInfo;

/**
 * A durable pause (`@temporalio/workflow`'s `sleep`): the run waits without holding a worker, survives
 * restarts and an idle-scaled pod. A leaf statement; the duration is a TypeScript expression.
 */
export const waitNodesGroup: readonly INodeConfig[] = [{ name: WAIT_NAME, data: waitDataType }];
