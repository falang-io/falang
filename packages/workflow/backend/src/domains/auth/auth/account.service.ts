import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { AuthTokensService } from '../auth-tokens/auth-tokens.service.js';
import { emailVerificationsTotal } from '../../metrics/metrics.js';
import { MailService } from '../../mail/mail.service.js';
import {
  confirmEmailMail,
  newApplicationMail,
  resetPasswordMail,
  type IMailContent,
} from '../../mail/mail-templates.js';
import type { User } from '../../users/users/user.entity.js';
import { UsersService } from '../../users/users/users.service.js';

const RESEND_COOLDOWN_MS = 60 * 1000;

export type TAccountStatus = 'pending_email' | 'pending_activation' | 'active';

export interface IApplicationInput {
  readonly email: string;
  readonly companyName: string;
  readonly automationInterest: string;
  readonly termsAcceptedAt: Date | null;
}

/** E-mail verification, the closed-beta application flow and password reset. Mail failures never fail a request. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly usersService: UsersService;
  private readonly tokens: AuthTokensService;
  private readonly mail: MailService;

  constructor(
    @Inject(UsersService) usersService: UsersService,
    @Inject(AuthTokensService) tokens: AuthTokensService,
    @Inject(MailService) mail: MailService,
  ) {
    this.usersService = usersService;
    this.tokens = tokens;
    this.mail = mail;
  }

  private async sendTo(user: User, content: IMailContent): Promise<void> {
    if (!user.email) return;
    await this.mail.send({ to: user.email, subject: content.subject, text: content.text, html: content.html });
  }

  /** Issues a verification token and mails it, unless one was issued within the cooldown. */
  async sendVerification(user: User, opts: { respectCooldown: boolean }): Promise<void> {
    if (!user.email) return;
    if (opts.respectCooldown) {
      const last = await this.tokens.lastIssuedAt(user.id, 'verify-email');
      if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) return;
    }
    const token = await this.tokens.issue(user.id, 'verify-email');
    const url = this.mail.buildClientLink(`/?verifyEmail=${encodeURIComponent(token)}`);
    await this.sendTo(user, confirmEmailMail(user.language, url));
  }

  /** `application` mode: creates a not-yet-activated account with no usable password. */
  async apply(input: IApplicationInput): Promise<{ status: 'pending_email' }> {
    const email = input.email.trim().toLowerCase();
    const existing = (await this.usersService.findByEmail(email)) ?? (await this.usersService.findByUsername(email));
    if (existing) {
      if (existing.emailVerifiedAt)
        throw new ConflictException('An application or account with this e-mail already exists');
      await this.sendVerification(existing, { respectCooldown: true });
      return { status: 'pending_email' };
    }
    const user = await this.usersService.create({
      username: email,
      password: '-',
      email,
      companyName: input.companyName.trim(),
      automationInterest: input.automationInterest.trim(),
      activatedAt: null,
      signupSource: 'self-service',
      termsAcceptedAt: input.termsAcceptedAt,
    });
    await this.usersService.setUnusablePassword(user.id);
    await this.sendVerification(user, { respectCooldown: false });
    return { status: 'pending_email' };
  }

  async verifyEmail(rawToken: string): Promise<{ status: TAccountStatus }> {
    const userId = await this.tokens.consume(rawToken, 'verify-email');
    const user = userId ? await this.usersService.findById(userId) : null;
    if (!user) throw new BadRequestException('Invalid or expired token');
    const alreadyVerified = user.emailVerifiedAt !== null;
    if (!alreadyVerified) {
      await this.usersService.markEmailVerified(user.id);
      emailVerificationsTotal.inc();
    }
    if (user.activatedAt) return { status: 'active' };
    if (!alreadyVerified) await this.notifyAdmins(user);
    return { status: 'pending_activation' };
  }

  private async notifyAdmins(applicant: User): Promise<void> {
    const admins = await this.usersService.findAdminEmails();
    await Promise.all(
      admins.map((admin) =>
        this.sendTo(
          admin,
          newApplicationMail(admin.language, {
            email: applicant.email ?? applicant.username,
            companyName: applicant.companyName,
            automationInterest: applicant.automationInterest,
          }),
        ),
      ),
    );
  }

  /** Always resolves; only an existing, not-yet-verified account gets a mail (60 s cooldown). */
  async resendVerification(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerification(user, { respectCooldown: true });
  }

  /** Always resolves; mails only a verified, activated account. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.emailVerifiedAt || !user.activatedAt) return;
    const last = await this.tokens.lastIssuedAt(user.id, 'reset-password');
    if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) return;
    const token = await this.tokens.issue(user.id, 'reset-password');
    const url = this.mail.buildClientLink(`/?resetPassword=${encodeURIComponent(token)}`);
    await this.sendTo(user, resetPasswordMail(user.language, url));
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const userId = await this.tokens.consume(rawToken, 'reset-password');
    const user = userId ? await this.usersService.findById(userId) : null;
    if (!user || !user.activatedAt) throw new BadRequestException('Invalid or expired token');
    await this.usersService.setPassword(user.id, password);
    this.logger.log(`Password reset for user ${user.id}`);
  }
}
