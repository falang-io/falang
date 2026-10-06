import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface IRequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<IRequestContext>();

export const getRequestId = (): string | undefined => storage.getStore()?.requestId;

export const runWithRequestContext = <T>(context: IRequestContext, fn: () => T): T => storage.run(context, fn);

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** An incoming `x-request-id` is trusted only when it is short and made of safe characters; otherwise a fresh UUID. */
export const resolveRequestId = (incoming: unknown): string =>
  typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();

/** Installed before every route (ADR 0060 (private)): sets the `x-request-id` response header and the async-local request context. */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  res.setHeader('x-request-id', requestId);
  runWithRequestContext({ requestId }, next);
};
