import { AgentQuotaError } from './agent/agent-quota-error.js';
import { ApiCodedError } from './api-coded-error.js';

/**
 * Maps the refusals of a server start (dev start/run/debug, prod start/activate/publish — ADR 0067 (private)) to a
 * locale key: `423 project_suspended` (with its `reason`) and `402 insufficient_balance` (thrown only by a cloud
 * start guard). `null` = not one of these, the caller shows the server's own message.
 */
export const startErrorKey = (error: unknown): string | null => {
  if (error instanceof ApiCodedError) {
    if (error.code === 'project_suspended') {
      const reason = (error.body as { reason?: unknown } | undefined)?.reason;
      return reason === 'admin' ? 'client:start-errors.suspended-admin' : 'client:start-errors.suspended-balance';
    }
    if (error.code === 'insufficient_balance') return 'client:start-errors.insufficient-balance';
    return null;
  }
  if (error instanceof AgentQuotaError) {
    const code = (error.body as { code?: unknown } | null)?.code;
    if (code === 'insufficient_balance') return 'client:start-errors.insufficient-balance';
  }
  return null;
};

/** Localised text of a failed start, else the error's own message, else `fallback`. */
export const describeStartError = (error: unknown, t: (key: string) => string, fallback: string): string => {
  const key = startErrorKey(error);
  if (key) return t(key);
  return error instanceof Error ? error.message : fallback;
};
