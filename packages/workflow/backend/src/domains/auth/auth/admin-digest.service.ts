// oxlint-disable no-undefined -- timer handle starts unset.
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AppSettingsService } from '../../admin/app-settings/app-settings.service.js';
import { MailService } from '../../mail/mail.service.js';
import { adminDigestMail } from '../../mail/mail-templates.js';
import { UsersService } from '../../users/users/users.service.js';

const SWEEP_INTERVAL_MS = 60_000;
/** At most one digest per admin in this window (the digest goes to every admin at once, so it is one window for all). */
export const ADMIN_DIGEST_MIN_INTERVAL_MS = 15 * 60_000;
const LAST_SENT_KEY = 'auth.adminDigestLastSentAt';

/**
 * New applications / signups used to mail every admin one message each, so a bot could turn the admins' mailboxes into
 * a weapon. Now they are collected (`users.admin_notified_at IS NULL`) and sent as one digest, at most every 15 minutes.
 */
@Injectable()
export class AdminDigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminDigestService.name);
  private readonly usersService: UsersService;
  private readonly mail: MailService;
  private readonly settings: AppSettingsService;
  private handle: NodeJS.Timeout | undefined;

  constructor(
    @Inject(UsersService) usersService: UsersService,
    @Inject(MailService) mail: MailService,
    @Inject(AppSettingsService) settings: AppSettingsService,
  ) {
    this.usersService = usersService;
    this.mail = mail;
    this.settings = settings;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Admin digest sweep failed', error instanceof Error ? error.stack : error);
      });
    }, SWEEP_INTERVAL_MS);
    this.handle.unref();
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }

  /** Sends the digest if something is waiting and the previous one is old enough. Returns the number of signups listed. */
  async sweep(now: Date = new Date()): Promise<number> {
    const pending = await this.usersService.findUnannounced();
    if (pending.length === 0) return 0;
    const last = Number(await this.settings.get(LAST_SENT_KEY));
    if (Number.isFinite(last) && last > 0 && now.getTime() - last < ADMIN_DIGEST_MIN_INTERVAL_MS) return 0;
    const items = pending.map((user) => ({
      email: user.email ?? user.username,
      companyName: user.companyName,
      automationInterest: user.automationInterest,
      activated: user.activatedAt !== null,
    }));
    const admins = await this.usersService.findAdminEmails();
    await Promise.all(
      admins.map((admin) => {
        const content = adminDigestMail(admin.language, items);
        return this.mail.send({
          to: admin.email ?? '',
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
      }),
    );
    await this.usersService.markAdminNotified(pending.map((user) => user.id));
    await this.settings.set(LAST_SENT_KEY, String(now.getTime()));
    return pending.length;
  }
}
