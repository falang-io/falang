import type { IUserLimits } from '../admin/user-limits/user-limits.types.js';

export interface ITtlContext {
  readonly ttlSeconds?: number;
  readonly createdBy: string;
  readonly workflowEnv?: 'dev' | 'prod';
}

const HOUR_MS = 3_600_000;

/**
 * The TTL rule from ADR 0038 (private) §2/§4 (contract), in priority
 * order: an explicit `x-file-ttl-seconds` always wins; otherwise a **dev** run's own upload
 * (`workflowEnv === 'dev'` and `createdBy` starts with `'run:'`) gets `devFileTtlHours`; a Telegram
 * ingress upload (`createdBy === 'ingress:telegram'`) gets `ingressFileTtlHours`; anything else
 * (a prod run, a manual upload from the Files tab) never expires.
 */
export const resolveExpiresAt = (now: Date, ctx: ITtlContext, limits: IUserLimits): Date | null => {
  if (typeof ctx.ttlSeconds === 'number') return new Date(now.getTime() + ctx.ttlSeconds * 1000);
  if (ctx.workflowEnv === 'dev' && ctx.createdBy.startsWith('run:')) {
    return new Date(now.getTime() + limits.devFileTtlHours * HOUR_MS);
  }
  if (ctx.createdBy === 'ingress:telegram') return new Date(now.getTime() + limits.ingressFileTtlHours * HOUR_MS);
  return null;
};
