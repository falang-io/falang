import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../users/users/user.entity.js';
import type { UsersService } from '../../users/users/users.service.js';
import { AuthService } from './auth.service.js';

const makeUser = async (username: string, password: string): Promise<User> =>
  ({
    id: 'user-1',
    username,
    password: await bcrypt.hash(password, 4),
    createdAt: new Date(),
    email: null,
    emailVerifiedAt: null,
    activatedAt: new Date(),
    companyName: null,
  }) as User;

describe('AuthService', () => {
  // oxlint-disable-next-line init-declarations
  let usersService: Pick<UsersService, 'findByUsername' | 'findByEmail' | 'create'>;
  // oxlint-disable-next-line init-declarations
  let jwtService: Pick<JwtService, 'sign'>;
  // oxlint-disable-next-line init-declarations
  let authService: AuthService;

  beforeEach(() => {
    usersService = { findByUsername: vi.fn(), findByEmail: vi.fn().mockResolvedValue(null), create: vi.fn() };
    jwtService = { sign: vi.fn(() => 'signed-token') };
    authService = new AuthService(usersService as UsersService, jwtService as JwtService);
  });

  it('validates correct credentials', async () => {
    const user = await makeUser('admin', 'admin');
    vi.mocked(usersService.findByUsername).mockResolvedValue(user);

    const result = await authService.validateUser('admin', 'admin');

    expect(result).toBe(user);
  });

  it('rejects a wrong password', async () => {
    const user = await makeUser('admin', 'admin');
    vi.mocked(usersService.findByUsername).mockResolvedValue(user);

    await expect(authService.validateUser('admin', 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown username', async () => {
    vi.mocked(usersService.findByUsername).mockResolvedValue(null);

    await expect(authService.validateUser('missing', 'admin')).rejects.toThrow(UnauthorizedException);
  });

  it('signs a JWT keyed on the user id, username and role', async () => {
    const user = await makeUser('someone', 'admin');
    user.role = 'user';
    user.language = 'en';

    const result = await authService.login(user);

    expect(jwtService.sign).toHaveBeenCalledWith({ sub: user.id, username: user.username, role: 'user' });
    expect(result).toEqual({
      accessToken: 'signed-token',
      user: {
        id: user.id,
        username: user.username,
        language: 'en',
        role: 'user',
        email: null,
        emailVerified: false,
        activatedAt: user.activatedAt?.toISOString(),
        companyName: null,
        defaultPasswordInUse: false,
      },
    });
  });

  it('flags defaultPasswordInUse only for the seeded admin still on the default password', async () => {
    const stillDefault = await makeUser('admin', 'admin');
    const changed = await makeUser('admin', 'a-better-password');
    const defaultResult = await authService.toAuthUser(stillDefault);
    const changedResult = await authService.toAuthUser(changed);
    expect(defaultResult.defaultPasswordInUse).toBe(true);
    expect(changedResult.defaultPasswordInUse).toBe(false);
  });

  it('registers a new user and logs them in', async () => {
    vi.mocked(usersService.findByUsername).mockResolvedValue(null);
    const created = await makeUser('newbie', 'password123');
    vi.mocked(usersService.create).mockResolvedValue(created);

    const result = await authService.register('newbie', 'password123');

    expect(usersService.create).toHaveBeenCalledWith({
      username: 'newbie',
      password: 'password123',
      termsAcceptedAt: null,
      email: null,
      signupSource: 'self-service',
    });
    expect(result.accessToken).toBe('signed-token');
    expect(result.user.username).toBe('newbie');
  });

  it('rejects registering an already-taken username', async () => {
    const existing = await makeUser('taken', 'admin');
    vi.mocked(usersService.findByUsername).mockResolvedValue(existing);

    await expect(authService.register('taken', 'password123')).rejects.toThrow(ConflictException);
    expect(usersService.create).not.toHaveBeenCalled();
  });
});
