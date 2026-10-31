import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService, UsersService } from '@falang/workflow-backend';
import { checkControlToken, LocalControlController } from './local-control.js';

describe('checkControlToken', () => {
  it('is not-found without a configured token, forbidden on a wrong or missing one, ok on a match', () => {
    expect(checkControlToken(null, 'x')).toBe('not-found');
    expect(checkControlToken('abc', '')).toBe('forbidden');
    expect(checkControlToken('abc', 'abd')).toBe('forbidden');
    expect(checkControlToken('abc', 'abcd')).toBe('forbidden');
    expect(checkControlToken('abc', 'abc')).toBe('ok');
  });
});

describe('LocalControlController', () => {
  const build = (token: string | null) => {
    const onShutdownRequested = vi.fn();
    const login = vi.fn().mockResolvedValue({ accessToken: 'jwt' });
    const controller = new LocalControlController(
      { token, onShutdownRequested },
      { login } as unknown as AuthService,
      { findByUsername: vi.fn().mockResolvedValue({ id: 'u1' }) } as unknown as UsersService,
    );
    return { controller, onShutdownRequested };
  };

  it('auto-login: 404 / 403 / token', async () => {
    await expect(build(null).controller.autoLogin('t')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build('t').controller.autoLogin('bad')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build('t').controller.autoLogin('t')).resolves.toEqual({ accessToken: 'jwt' });
  });

  it('shutdown: only with the token, and asynchronously', async () => {
    const { controller, onShutdownRequested } = build('t');
    expect(() => controller.shutdown('bad')).toThrow(ForbiddenException);
    expect(onShutdownRequested).not.toHaveBeenCalled();
    expect(controller.shutdown('t')).toEqual({ ok: true });
    expect(onShutdownRequested).not.toHaveBeenCalled();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    expect(onShutdownRequested).toHaveBeenCalledOnce();
  });
});
