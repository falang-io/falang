import type { NextFunction, Request, Response } from 'express';

/** Fail-closed shared-secret guard, mirroring `backend`'s `InternalApiGuard` posture — see ADR 0010. */
export const requireServiceSecret = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.ACTIVEPIECES_SERVICE_SECRET;
  if (!expected) {
    res.status(500).json({ message: 'ACTIVEPIECES_SERVICE_SECRET is not configured' });
    return;
  }
  if (req.header('x-internal-api-key') !== expected) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  next();
};
