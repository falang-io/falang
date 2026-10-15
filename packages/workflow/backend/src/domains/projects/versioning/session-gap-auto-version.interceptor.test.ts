import { Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionGapAutoVersionInterceptor } from './session-gap-auto-version.interceptor.js';
import type { VersioningService } from './versioning.service.js';

const makeContext = (request: Record<string, unknown>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

const handler: CallHandler = { handle: () => of('response') };

const writeRequest = (overrides: Record<string, unknown> = {}) => ({
  method: 'PATCH',
  path: '/projects/p1/documents/d1',
  url: '/projects/p1/documents/d1',
  params: { projectId: 'p1' },
  user: { id: 'u1' },
  ...overrides,
});

const makeInterceptor = (
  service: Partial<Record<'autoVersionBeforeEdit' | 'markEdited', ReturnType<typeof vi.fn>>>,
) => {
  const full = {
    autoVersionBeforeEdit: vi.fn().mockResolvedValue(undefined),
    markEdited: vi.fn().mockResolvedValue(undefined),
    ...service,
  };
  return { interceptor: new SessionGapAutoVersionInterceptor(full as unknown as VersioningService), service: full };
};

describe('SessionGapAutoVersionInterceptor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-versions before and marks edited after a matching write', async () => {
    const { interceptor, service } = makeInterceptor({});

    await expect(firstValueFrom(interceptor.intercept(makeContext(writeRequest()), handler))).resolves.toBe('response');

    expect(service.autoVersionBeforeEdit).toHaveBeenCalledWith('p1', 'u1');
    expect(service.markEdited).toHaveBeenCalledWith('p1');
  });

  it.each([
    ['a request without a user', writeRequest({ user: undefined })],
    ['a request without a projectId', writeRequest({ params: {} })],
    ['a GET', writeRequest({ method: 'GET' })],
    ['a non-content route', writeRequest({ path: '/projects/p1/commits' })],
  ])('passes %s through without touching versioning', async (_name, request) => {
    const { interceptor, service } = makeInterceptor({});

    await expect(firstValueFrom(interceptor.intercept(makeContext(request), handler))).resolves.toBe('response');

    expect(service.autoVersionBeforeEdit).not.toHaveBeenCalled();
    expect(service.markEdited).not.toHaveBeenCalled();
  });

  it('logs a markEdited failure and still returns the response', async () => {
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { interceptor } = makeInterceptor({ markEdited: vi.fn().mockRejectedValue(new Error('db down')) });

    await expect(firstValueFrom(interceptor.intercept(makeContext(writeRequest()), handler))).resolves.toBe('response');
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('markEdited failed'), expect.any(String));
  });

  it('logs an auto-version failure and still lets the edit through', async () => {
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { interceptor, service } = makeInterceptor({
      autoVersionBeforeEdit: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(firstValueFrom(interceptor.intercept(makeContext(writeRequest()), handler))).resolves.toBe('response');

    expect(logger).toHaveBeenCalledWith(expect.stringContaining('autoVersionBeforeEdit failed'), expect.any(String));
    expect(service.markEdited).toHaveBeenCalled();
  });
});
