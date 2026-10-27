// oxlint-disable no-undefined, no-await-in-loop -- timer handle starts unset; deletions run one by one.
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { Project } from '../../projects/projects/project.entity.js';
import { UsersService } from '../../users/users/users.service.js';
import { AuthToken } from '../auth-tokens/auth-token.entity.js';
import { MailLimitsService } from '../mail-limits/mail-limits.service.js';

const SWEEP_INTERVAL_MS = 60 * 60_000;
const BATCH_SIZE = 200;
const DEFAULT_TTL_HOURS = 168;

/** Removes applications whose e-mail was never confirmed (and that own nothing), plus expired mail-limit rows. */
@Injectable()
export class UnverifiedAccountGcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnverifiedAccountGcService.name);
  private readonly usersService: UsersService;
  private readonly limits: MailLimitsService;
  private readonly config: ConfigService;
  private readonly projects: Repository<Project>;
  private readonly tokens: Repository<AuthToken>;
  private handle: NodeJS.Timeout | undefined;

  constructor(
    @Inject(UsersService) usersService: UsersService,
    @Inject(MailLimitsService) limits: MailLimitsService,
    @Inject(ConfigService) config: ConfigService,
    @InjectRepository(Project) projects: Repository<Project>,
    @InjectRepository(AuthToken) tokens: Repository<AuthToken>,
  ) {
    this.usersService = usersService;
    this.limits = limits;
    this.config = config;
    this.projects = projects;
    this.tokens = tokens;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Unverified account sweep failed', error instanceof Error ? error.stack : error);
      });
    }, SWEEP_INTERVAL_MS);
    this.handle.unref();
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }

  private ttlMs(): number {
    const hours = Number(this.config.get<string>('UNVERIFIED_ACCOUNT_TTL_HOURS', String(DEFAULT_TTL_HOURS)));
    return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_TTL_HOURS) * 3_600_000;
  }

  /** Returns how many accounts were deleted. */
  async sweep(now: Date = new Date()): Promise<number> {
    await this.limits.deleteExpired(now);
    const candidates = await this.usersService.findStaleUnverified(new Date(now.getTime() - this.ttlMs()), BATCH_SIZE);
    const doomed: string[] = [];
    for (const user of candidates) {
      if ((await this.projects.count({ where: { ownerId: user.id } })) === 0) doomed.push(user.id);
    }
    if (doomed.length === 0) return 0;
    await this.tokens.delete({ userId: In(doomed) });
    await this.usersService.deleteByIds(doomed);
    this.logger.log(`Removed ${doomed.length} unconfirmed account(s)`);
    return doomed.length;
  }
}
