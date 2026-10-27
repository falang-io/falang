import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { httpRateLimitedTotal } from '../domains/metrics/metrics.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';

const MINUTE = 60_000;

type TKeyFn = (req: Request) => string | null;

export interface IRatePolicy {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly matches: (req: Request) => boolean;
  /** Keys to count the request under; every key must stay within the limit. */
  readonly keys: TKeyFn;
}

const ip = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';
const post = (req: Request, pattern: RegExp): boolean => req.method === 'POST' && pattern.test(req.path);

const normalizeLogin = (req: Request): string | null => {
  const body = req.body as { username?: unknown; email?: unknown; login?: unknown } | undefined;
  const raw = body?.username ?? body?.email ?? body?.login;
  return typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase().slice(0, 256) : null;
};

const AUTH_MAIL_PATH =
  /^\/+auth\/(register|forgot-password|resend-verification|reset-password|verify-email|change-password)\/?$/i;
const PROJECT_ACTION_PATH =
  /^\/+projects\/([^/]+)\/(build|run|runs|publish|debug\/start|versions\/start|versions\/[^/]+\/activate|agent\/chat)\/?$/i;

/** Windows and numbers of security audit item P1-1; scaled by `RATE_LIMIT_MULTIPLIER`. */
export const buildRatePolicies = (multiplier: number): IRatePolicy[] => {
  const scale = (n: number): number => Math.max(1, Math.round(n * multiplier));
  return [
    {
      name: 'login-ip',
      limit: scale(10),
      windowMs: MINUTE,
      matches: (req) => post(req, /^\/+auth\/login\/?$/i),
      keys: (req) => `ip:${ip(req)}`,
    },
    {
      name: 'login-account',
      limit: scale(10),
      windowMs: 15 * MINUTE,
      matches: (req) => post(req, /^\/+auth\/login\/?$/i),
      keys: (req) => {
        const login = normalizeLogin(req);
        return login ? `login:${login}` : null;
      },
    },
    {
      name: 'auth-account-ops',
      limit: scale(5),
      windowMs: MINUTE,
      matches: (req) => post(req, AUTH_MAIL_PATH),
      keys: (req) => `ip:${ip(req)}`,
    },
    {
      name: 'webhooks',
      limit: scale(120),
      windowMs: MINUTE,
      matches: (req) => req.method === 'POST' && /^\/+webhooks\//i.test(req.path),
      keys: (req) => `ip:${ip(req)}`,
    },
    {
      // Runs before the JWT guard, so the user is unknown: keyed by client IP + project.
      name: 'build-run',
      limit: scale(30),
      windowMs: MINUTE,
      matches: (req) => post(req, PROJECT_ACTION_PATH),
      keys: (req) => `ip:${ip(req)}:project:${PROJECT_ACTION_PATH.exec(req.path)?.[1] ?? ''}`,
    },
    {
      name: 'general',
      limit: scale(600),
      windowMs: MINUTE,
      matches: () => true,
      keys: (req) => `ip:${ip(req)}`,
    },
  ];
};

const isExempt = (req: Request, internalPort?: number): boolean =>
  (typeof internalPort === 'number' && req.socket.localPort === internalPort) ||
  /^\/+(health|internal)(\/|$)/i.test(req.path);

export interface IRateLimitOptions {
  readonly internalPort?: number;
  readonly multiplier?: number;
  readonly now?: () => number;
}

/** Reads `RATE_LIMIT_ENABLED` (`false` disables) and `RATE_LIMIT_MULTIPLIER` (default 1). */
export const readRateLimitEnv = (env: NodeJS.ProcessEnv): { enabled: boolean; multiplier: number } => {
  const multiplier = Number(env.RATE_LIMIT_MULTIPLIER ?? 1);
  return {
    enabled: (env.RATE_LIMIT_ENABLED ?? 'true').toLowerCase() !== 'false',
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
  };
};

/** Express middleware applying every matching policy; the first exceeded one answers 429. Specific policies run before `general`. */
export const rateLimitMiddleware = (options: IRateLimitOptions = {}): RequestHandler => {
  const policies = buildRatePolicies(options.multiplier ?? 1);
  const limiters = new Map(policies.map((p) => [p.name, new FixedWindowRateLimiter(p.limit, p.windowMs)]));
  const now = options.now ?? Date.now;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isExempt(req, options.internalPort)) return next();
    for (const policy of policies) {
      if (!policy.matches(req)) continue;
      const key = policy.keys(req);
      if (key === null) continue;
      const result = limiters.get(policy.name)?.hit(key, now());
      if (result && !result.allowed) {
        httpRateLimitedTotal.inc({ policy: policy.name });
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({ statusCode: 429, message: 'Too many requests' });
        return;
      }
    }
    next();
  };
};
