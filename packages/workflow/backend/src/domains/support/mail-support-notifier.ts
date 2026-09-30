import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service.js';
import { supportNewMessageMail, supportReplyMail, type IMailContent } from '../mail/mail-templates.js';
import { UsersService } from '../users/users/users.service.js';
import type { ISupportNotifier } from './support-notifier.js';
import type { IApiSupportMessage } from './support.types.js';

export const SUPPORT_NOTIFY_DEBOUNCE_MS = 10 * 60 * 1000;

type TDirection = 'toAdmins' | 'toUser';

/**
 * E-mails support chat activity when mail is configured: a user message goes to every admin with an e-mail (or to
 * `SUPPORT_NOTIFY_EMAILS`), an admin reply to the thread's user if their e-mail is verified. At most one mail per
 * thread per direction per `SUPPORT_NOTIFY_DEBOUNCE_MS` (in memory — a restart resets it).
 */
@Injectable()
export class MailSupportNotifier implements ISupportNotifier {
  private readonly logger = new Logger(MailSupportNotifier.name);
  private readonly lastSent = new Map<string, number>();
  private readonly mail: MailService;
  private readonly users: UsersService;
  private readonly config: ConfigService;

  constructor(
    @Inject(MailService) mail: MailService,
    @Inject(UsersService) users: UsersService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.mail = mail;
    this.users = users;
    this.config = config;
  }

  async notifyAdminsOfUserMessage(userId: string, message: IApiSupportMessage): Promise<void> {
    try {
      if (!this.mail.isConfigured || !this.claim(userId, 'toAdmins')) return;
      const author = await this.users.findById(userId);
      const username = author?.username ?? userId;
      const adminUrl = this.mail.buildClientLink('/admin');
      const overrides = (this.config.get<string>('SUPPORT_NOTIFY_EMAILS', '') ?? '')
        .split(',')
        .map((address) => address.trim())
        .filter((address) => address.length > 0);
      const recipients: { email: string; language: string }[] =
        overrides.length > 0 ? overrides.map((email) => ({ email, language: 'en' })) : await this.adminRecipients();
      await Promise.all(
        recipients.map((recipient) =>
          this.deliver(
            recipient.email,
            supportNewMessageMail(recipient.language, { username, text: message.text, adminUrl }),
          ),
        ),
      );
    } catch (error) {
      this.logger.warn(`Support mail to admins failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async notifyUserOfAdminReply(userId: string, message: IApiSupportMessage): Promise<void> {
    try {
      if (!this.mail.isConfigured) return;
      const user = await this.users.findById(userId);
      if (!user?.email || !user.emailVerifiedAt) return;
      if (!this.claim(userId, 'toUser')) return;
      await this.deliver(
        user.email,
        supportReplyMail(user.language, { text: message.text, clientUrl: this.mail.buildClientLink('/') }),
      );
    } catch (error) {
      this.logger.warn(`Support mail to user failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async adminRecipients(): Promise<{ email: string; language: string }[]> {
    const admins = await this.users.findAdminEmails();
    return admins.map((admin) => ({ email: admin.email ?? '', language: admin.language }));
  }

  /** True (and records the time) when no mail went out for this thread+direction within the debounce window. */
  private claim(userId: string, direction: TDirection): boolean {
    const key = `${userId}:${direction}`;
    const now = Date.now();
    const previous = this.lastSent.get(key);
    if (typeof previous === 'number' && now - previous < SUPPORT_NOTIFY_DEBOUNCE_MS) return false;
    this.lastSent.set(key, now);
    return true;
  }

  private async deliver(to: string, content: IMailContent): Promise<void> {
    const result = await this.mail.send({ to, ...content });
    if (!result.sent) this.logger.debug(`Support mail to ${to} was not sent`);
  }
}
