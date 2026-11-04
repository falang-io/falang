import { reportError } from '../../shared/report-error.js';

/** Fire-and-forget for UI handlers: failures are reported, never left as unhandled rejections. */
export const runReporting = (promise: Promise<unknown>, what: string): void => {
  promise.catch((error: unknown) => reportError(what, error));
};
