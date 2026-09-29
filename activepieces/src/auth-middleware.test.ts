import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { requireServiceSecret } from './auth-middleware.js';

const makeReq = (header?: string): Request => ({ header: () => header }) as unknown as Request;
const makeRes = (): Response => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

describe('requireServiceSecret', () => {
  const originalSecret = process.env.ACTIVEPIECES_SERVICE_SECRET;
  afterEach(() => {
    process.env.ACTIVEPIECES_SERVICE_SECRET = originalSecret;
  });

  it('fails closed with 500 when the service has no secret configured at all', () => {
    delete process.env.ACTIVEPIECES_SERVICE_SECRET;
    const res = makeRes();
    const next = vi.fn();
    requireServiceSecret(makeReq('anything'), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a request with a missing or wrong header as 401', () => {
    process.env.ACTIVEPIECES_SERVICE_SECRET = 'right-secret';
    const res = makeRes();
    const next = vi.fn();
    requireServiceSecret(makeReq('wrong-secret'), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the header matches the configured secret', () => {
    process.env.ACTIVEPIECES_SERVICE_SECRET = 'right-secret';
    const res = makeRes();
    const next = vi.fn();
    requireServiceSecret(makeReq('right-secret'), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
