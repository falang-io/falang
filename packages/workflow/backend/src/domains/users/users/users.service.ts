import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { Repository } from 'typeorm';
import { User, type TSignupSource, type TUserRole } from './user.entity.js';

const SALT_ROUNDS = 10;
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

/**
 * Seeds a default `admin`/`admin` user on boot, behind `SEED_DEFAULT_ADMIN` (default `true`) —
 * dev/test convenience so there's always an account to log in with without registering one. See
 * ADR 0016 (private) Phase 0: a public deployment must set
 * `SEED_DEFAULT_ADMIN=false`, now that `POST /auth/register` (`AuthService.register`) is the real
 * signup path — an auto-created well-known admin/admin credential pair is a vulnerability once
 * accounts are public, not just an onboarding nicety.
 *
 * Whenever seeding is enabled, boot also re-promotes an existing `admin` user back to role
 * `admin` if it isn't one — a database that existed before migration `1789700000000-UserRole.ts`
 * (any local dev/e2e stack with a persistent volume) already has the seeded `admin` row, and that
 * migration's `DEFAULT 'user'` leaves it as a plain user, locking it out of `/admin`. See
 * ADR 0030 (private)'s "Implementation notes (package
 * C — verification + docs)" section.
 */
@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly users: Repository<User>;
  private readonly config: ConfigService;

  constructor(@InjectRepository(User) users: Repository<User>, @Inject(ConfigService) config: ConfigService) {
    this.users = users;
    this.config = config;
  }

  async onModuleInit(): Promise<void> {
    // `ConfigService.get` returns raw env strings, not real booleans — compare against the
    // string 'false' explicitly, since e.g. the non-empty string "false" is JS-truthy.
    if (this.config.get<string>('SEED_DEFAULT_ADMIN', 'true') !== 'false') {
      const count = await this.users.count();
      if (count === 0) {
        await this.create({ username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD, role: 'admin' });
        this.logger.warn(
          `Seeded default user "${DEFAULT_ADMIN_USERNAME}"/"${DEFAULT_ADMIN_PASSWORD}" — change this password.`,
        );
      } else {
        const admin = await this.findByUsername(DEFAULT_ADMIN_USERNAME);
        if (admin && admin.role !== 'admin') {
          await this.updateRole(admin.id, 'admin');
          this.logger.warn(`Promoted existing user "${DEFAULT_ADMIN_USERNAME}" back to role "admin".`);
        }
      }
    }
    await this.promoteAdminUsernames();
  }

  /**
   * Bootstraps further admins on a hosted deployment (`SEED_DEFAULT_ADMIN=false`): the operator
   * signs up normally, sets `ADMIN_USERNAMES` (comma-separated) and restarts once — every listed
   * existing user is promoted to `admin` here. Further admins are promoted from the admin UI
   * itself. See ADR 0030 (private).
   */
  private async promoteAdminUsernames(): Promise<void> {
    const raw = this.config.get<string>('ADMIN_USERNAMES', '');
    const usernames = raw
      .split(',')
      .map((username) => username.trim())
      .filter((username) => username.length > 0);
    for (const username of usernames) {
      // oxlint-disable-next-line no-await-in-loop -- boot-time, a handful of names at most; sequential keeps this simple.
      const user = await this.findByUsername(username);
      // oxlint-disable-next-line no-await-in-loop -- see above.
      if (user && user.role !== 'admin') await this.updateRole(user.id, 'admin');
    }
  }

  findByUsername(username: string): Promise<User | null> {
    return this.users.findOneBy({ username });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: email.trim().toLowerCase() });
  }

  /** Admins that can receive mail (the seeded `admin` has no e-mail and is skipped). */
  async findAdminEmails(): Promise<User[]> {
    const admins = await this.users.find({ where: { role: 'admin' } });
    return admins.filter((admin) => typeof admin.email === 'string' && admin.email.length > 0);
  }

  /** A random hash nobody knows the preimage of — an application has no password until activation. */
  async setUnusablePassword(id: string): Promise<void> {
    await this.setPassword(id, randomBytes(32).toString('base64url'));
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.users.update({ id }, { emailVerifiedAt: new Date() });
  }

  async markActivated(id: string): Promise<void> {
    await this.users.update({ id }, { activatedAt: new Date() });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findAll(): Promise<User[]> {
    return this.users.find({ order: { createdAt: 'ASC' } });
  }

  async create(input: {
    username: string;
    password: string;
    role?: TUserRole;
    termsAcceptedAt?: Date | null;
    email?: string | null;
    emailVerifiedAt?: Date | null;
    /** Omitted = active now; pass `null` for an application awaiting activation. */
    activatedAt?: Date | null;
    companyName?: string | null;
    automationInterest?: string | null;
    signupSource?: TSignupSource;
    language?: string;
  }): Promise<User> {
    const password = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = this.users.create({
      username: input.username,
      password,
      role: input.role ?? 'user',
      termsAcceptedAt: input.termsAcceptedAt ?? null,
      email: input.email ?? null,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      activatedAt: 'activatedAt' in input ? (input.activatedAt ?? null) : new Date(),
      companyName: input.companyName ?? null,
      automationInterest: input.automationInterest ?? null,
      signupSource: input.signupSource ?? 'admin',
      ...(input.language ? { language: input.language } : {}),
    });
    return this.users.save(user);
  }

  /** ~16 URL-safe characters from a CSPRNG — handed to an admin exactly once, never stored in plaintext or logged. */
  generatePassword(): string {
    return randomBytes(12).toString('base64url');
  }

  async setPassword(id: string, plainPassword: string): Promise<void> {
    const password = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    await this.users.update({ id }, { password });
  }

  async updateLanguage(id: string, language: string): Promise<User> {
    await this.users.update({ id }, { language });
    const user = await this.findById(id);
    if (!user) throw new Error(`User "${id}" not found after updating language`);
    return user;
  }

  async updateRole(id: string, role: TUserRole): Promise<User> {
    await this.users.update({ id }, { role });
    const user = await this.findById(id);
    if (!user) throw new Error(`User "${id}" not found after updating role`);
    return user;
  }
}
