import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { UsersService } from './users.service.js';
import type { User } from './user.entity.js';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'alice',
    password: 'hash',
    language: 'en',
    role: 'user',
    createdAt: new Date(),
    ...overrides,
  }) as User;

interface IMockUsersRepo {
  count: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  findOneBy: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

describe('UsersService.onModuleInit — ADMIN_USERNAMES promotion', () => {
  // oxlint-disable-next-line init-declarations
  let usersRepo: IMockUsersRepo;
  // oxlint-disable-next-line init-declarations
  let configValues: Record<string, string>;
  // oxlint-disable-next-line init-declarations
  let service: UsersService;

  beforeEach(() => {
    configValues = { SEED_DEFAULT_ADMIN: 'false' };
    const config = {
      get: vi.fn((key: string, defaultValue?: string) => configValues[key] ?? defaultValue),
    } as unknown as ConfigService;
    usersRepo = {
      count: vi.fn(() => Promise.resolve(1)),
      create: vi.fn((input: Partial<User>) => input),
      save: vi.fn((user: User) => Promise.resolve(user)),
      findOneBy: vi.fn(),
      update: vi.fn(() => Promise.resolve({})),
    };
    service = new UsersService(usersRepo as unknown as Repository<User>, config);
  });

  it('promotes every listed existing user to admin', async () => {
    configValues['ADMIN_USERNAMES'] = 'alice, bob';
    const alice = makeUser({ id: 'user-1', username: 'alice', role: 'user' });
    const bob = makeUser({ id: 'user-2', username: 'bob', role: 'user' });
    usersRepo.findOneBy.mockImplementation((where: Partial<User>) => {
      if (where.username === 'alice' || where.id === 'user-1') return Promise.resolve(alice);
      if (where.username === 'bob' || where.id === 'user-2') return Promise.resolve(bob);
      return Promise.resolve(null);
    });

    await service.onModuleInit();

    expect(usersRepo.update).toHaveBeenCalledWith({ id: 'user-1' }, { role: 'admin' });
    expect(usersRepo.update).toHaveBeenCalledWith({ id: 'user-2' }, { role: 'admin' });
  });

  it('does not re-promote a user who is already admin', async () => {
    configValues['ADMIN_USERNAMES'] = 'alice';
    usersRepo.findOneBy.mockResolvedValue(makeUser({ role: 'admin' }));

    await service.onModuleInit();

    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  it('ignores an unknown username in ADMIN_USERNAMES', async () => {
    configValues['ADMIN_USERNAMES'] = 'ghost';
    usersRepo.findOneBy.mockResolvedValue(null);

    await service.onModuleInit();

    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  it('does nothing when ADMIN_USERNAMES is unset', async () => {
    await service.onModuleInit();

    expect(usersRepo.findOneBy).not.toHaveBeenCalled();
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  it('does not seed the default admin when SEED_DEFAULT_ADMIN is unset', async () => {
    delete configValues['SEED_DEFAULT_ADMIN'];
    usersRepo.count.mockResolvedValue(0);

    await service.onModuleInit();

    expect(usersRepo.save).not.toHaveBeenCalled();
  });

  it('seeds the default admin/admin user with role admin when no users exist', async () => {
    configValues['SEED_DEFAULT_ADMIN'] = 'true';
    usersRepo.count.mockResolvedValue(0);

    await service.onModuleInit();

    expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin', role: 'admin' }));
  });

  it('promotes an existing "admin" user back to role admin on a pre-existing database', async () => {
    configValues['SEED_DEFAULT_ADMIN'] = 'true';
    usersRepo.count.mockResolvedValue(1);
    const admin = makeUser({ id: 'admin-id', username: 'admin', role: 'user' });
    usersRepo.findOneBy.mockImplementation((where: Partial<User>) =>
      Promise.resolve(where.username === 'admin' || where.id === 'admin-id' ? admin : null),
    );

    await service.onModuleInit();

    expect(usersRepo.update).toHaveBeenCalledWith({ id: 'admin-id' }, { role: 'admin' });
  });

  it('leaves an existing "admin" user with role user untouched when SEED_DEFAULT_ADMIN is false', async () => {
    configValues['SEED_DEFAULT_ADMIN'] = 'false';
    usersRepo.count.mockResolvedValue(1);
    const admin = makeUser({ id: 'admin-id', username: 'admin', role: 'user' });
    usersRepo.findOneBy.mockImplementation((where: Partial<User>) =>
      Promise.resolve(where.username === 'admin' || where.id === 'admin-id' ? admin : null),
    );

    await service.onModuleInit();

    expect(usersRepo.findOneBy).not.toHaveBeenCalled();
    expect(usersRepo.update).not.toHaveBeenCalled();
  });
});
