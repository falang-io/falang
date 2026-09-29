import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import type { User } from '../../users/users/user.entity.js';
import type { UsersService } from '../../users/users/users.service.js';
import { PersonalAccessTokensService } from './personal-access-tokens.service.js';
import type { PersonalAccessToken } from './personal-access-token.entity.js';

const HOUR_MS = 60 * 60 * 1000;

const makeUser = (): User =>
  ({
    id: 'user-1',
    username: 'admin',
    password: 'hash',
    language: 'en',
    role: 'user',
    createdAt: new Date(),
  }) as User;

describe('PersonalAccessTokensService.resolve', () => {
  // oxlint-disable-next-line init-declarations
  let tokensRepo: Pick<Repository<PersonalAccessToken>, 'findOneBy' | 'update' | 'create' | 'save' | 'find'>;
  // oxlint-disable-next-line init-declarations
  let usersService: Pick<UsersService, 'findById'>;
  // oxlint-disable-next-line init-declarations
  let service: PersonalAccessTokensService;

  beforeEach(() => {
    tokensRepo = {
      findOneBy: vi.fn(),
      update: vi.fn(() => Promise.resolve({}) as never),
      create: vi.fn(),
      save: vi.fn(),
      find: vi.fn(),
    };
    usersService = { findById: vi.fn() };
    service = new PersonalAccessTokensService(
      tokensRepo as Repository<PersonalAccessToken>,
      usersService as UsersService,
    );
  });

  it('returns null for a token that does not start with the flg_pat_ prefix', async () => {
    const result = await service.resolve('not-a-pat-token');

    expect(result).toBeNull();
    expect(tokensRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('returns null for an unknown token hash', async () => {
    vi.mocked(tokensRepo.findOneBy).mockResolvedValue(null);

    const result = await service.resolve('flg_pat_unknown');

    expect(result).toBeNull();
  });

  it('returns null for a revoked token', async () => {
    vi.mocked(tokensRepo.findOneBy).mockResolvedValue({
      id: 'pat-1',
      userId: 'user-1',
      projectId: null,
      expiresAt: null,
      revokedAt: new Date(),
    } as PersonalAccessToken);

    const result = await service.resolve('flg_pat_revoked');

    expect(result).toBeNull();
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('returns null for an expired token', async () => {
    vi.mocked(tokensRepo.findOneBy).mockResolvedValue({
      id: 'pat-1',
      userId: 'user-1',
      projectId: null,
      expiresAt: new Date(Date.now() - HOUR_MS),
      revokedAt: null,
    } as PersonalAccessToken);

    const result = await service.resolve('flg_pat_expired');

    expect(result).toBeNull();
  });

  it('resolves a valid, unscoped, non-expiring token and bumps last_used_at', async () => {
    vi.mocked(tokensRepo.findOneBy).mockResolvedValue({
      id: 'pat-1',
      userId: 'user-1',
      projectId: null,
      expiresAt: null,
      revokedAt: null,
    } as PersonalAccessToken);
    vi.mocked(usersService.findById).mockResolvedValue(makeUser());

    const result = await service.resolve('flg_pat_valid');

    expect(result).toEqual({
      user: { id: 'user-1', username: 'admin', role: 'user' },
      projectScope: null,
      tokenId: 'pat-1',
    });
    expect(tokensRepo.update).toHaveBeenCalledWith({ id: 'pat-1' }, { lastUsedAt: expect.any(Date) });
  });

  it('resolves a valid, project-scoped, not-yet-expired token', async () => {
    vi.mocked(tokensRepo.findOneBy).mockResolvedValue({
      id: 'pat-1',
      userId: 'user-1',
      projectId: 'project-1',
      expiresAt: new Date(Date.now() + HOUR_MS),
      revokedAt: null,
    } as PersonalAccessToken);
    vi.mocked(usersService.findById).mockResolvedValue(makeUser());

    const result = await service.resolve('flg_pat_scoped');

    expect(result).toEqual({
      user: { id: 'user-1', username: 'admin', role: 'user' },
      projectScope: 'project-1',
      tokenId: 'pat-1',
    });
  });

  it('returns null when the token references a since-deleted user', async () => {
    vi.mocked(tokensRepo.findOneBy).mockResolvedValue({
      id: 'pat-1',
      userId: 'ghost',
      projectId: null,
      expiresAt: null,
      revokedAt: null,
    } as PersonalAccessToken);
    vi.mocked(usersService.findById).mockResolvedValue(null);

    const result = await service.resolve('flg_pat_ghost');

    expect(result).toBeNull();
  });
});
