import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthTokensService } from '../auth-tokens/auth-tokens.service.js';
import { MailLimitsService } from '../mail-limits/mail-limits.service.js';
import { PersonalAccessTokensService } from '../personal-access-tokens/personal-access-tokens.service.js';
import { activationsTotal, emailVerificationsTotal } from '../../metrics/metrics.js';
import { MailService } from '../../mail/mail.service.js';
import {
  accountExistsMail,
  confirmEmailMail,
  resetPasswordMail,
  welcomeMail,
  type IMailContent,
} from '../../mail/mail-templates.js';
import type { User } from '../../users/users/user.entity.js';
import { UsersService } from '../../users/users/users.service.js';
import { resolveSignupAutoActivate } from './signup-mode.js';

const RESEND_COOLDOWN_MS = 60 * 1000;

export type TAccountStatus = 'pending_email' | 'pending_activation' | 'active';

export interface IVerifyEmailResult {
  readonly status: TAccountStatus;
  /** Set only when this confirmation activated the account (`SIGNUP_AUTO_ACTIVATE`): the caller signs the user in. */
  readonly activatedUser?: User;
}

export interface IApplicationInput {
  readonly email: string;
  readonly companyName: string;
  readonly automationInterest: string;
  readonly termsAcceptedAt: Date | null;
}

/**
 * E-mail verification, the application flow (reviewed by an admin, or activated on confirmation with
 * `SIGNUP_AUTO_ACTIVATE`) and password reset. Mail failures never fail a request.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly usersService: UsersService;
  private readonly tokens: AuthTokensService;
  private readonly mail: MailService;
  private readonly config: ConfigService;
  private readonly limits: MailLimitsService;
  private readonly accessTokens: PersonalAccessTokensService;

  constructor(
    @Inject(UsersService) usersService: UsersService,
    @Inject(AuthTokensService) tokens: AuthTokensService,
    @Inject(MailService) mail: MailService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(MailLimitsService) limits: MailLimitsService,
    @Inject(PersonalAccessTokensService) accessTokens: PersonalAccessTokensService,
  ) {
    this.limits = limits;
    this.accessTokens = accessTokens;
    this.usersService = usersService;
    this.tokens = tokens;
    this.mail = mail;
    this.config = config;
  }

  // Read per call so the flag follows the live environment.
  private autoActivate(): boolean {
    return resolveSignupAutoActivate(this.config);
  }

  private async sendTo(user: User, content: IMailContent): Promise<void> {
    if (!user.email) return;
    await this.mail.send({ to: user.email, subject: content.subject, text: content.text, html: content.html });
  }

  /** Issues a verification token and mails it, unless one was issued within the cooldown. */
  async sendVerification(user: User, opts: { respectCooldown: boolean; ip?: string | null }): Promise<void> {
    if (!user.email) return;
    if (opts.respectCooldown) {
      const last = await this.tokens.lastIssuedAt(user.id, 'verify-email');
      if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) return;
    }
    if (!(await this.limits.tryConsume('verify-email', user.email, opts.ip ?? null))) return;
    const token = await this.tokens.issue(user.id, 'verify-email');
    const url = this.mail.buildClientLink(`/?verifyEmail=${encodeURIComponent(token)}`);
    await this.sendTo(user, confirmEmailMail(user.language, url, this.autoActivate() ? 'signup' : 'application'));
  }

  /** `application` mode: creates a not-yet-activated account with no usable password. */
  async apply(input: IApplicationInput, ip: string | null = null): Promise<{ status: 'pending_email' }> {
    const email = input.email.trim().toLowerCase();
    const existing = (await this.usersService.findByEmail(email)) ?? (await this.usersService.findByUsername(email));
    if (existing) {
      if (existing.emailVerifiedAt) {
        // Same answer as for a new application (no enumeration); the owner of the address is told by mail.
        if (existing.email && (await this.limits.tryConsume('account-exists', existing.email, ip))) {
          await this.sendTo(existing, accountExistsMail(existing.language, this.mail.buildClientLink('/')));
        }
        return { status: 'pending_email' };
      }
      await this.sendVerification(existing, { respectCooldown: true, ip });
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
    await this.sendVerification(user, { respectCooldown: false, ip });
    return { status: 'pending_email' };
  }

  async verifyEmail(rawToken: string): Promise<IVerifyEmailResult> {
    const userId = await this.tokens.consume(rawToken, 'verify-email');
    const user = userId ? await this.usersService.findById(userId) : null;
    if (!user) throw new BadRequestException('Invalid or expired token');
    const alreadyVerified = user.emailVerifiedAt !== null;
    if (!alreadyVerified) {
      await this.usersService.markEmailVerified(user.id);
      emailVerificationsTotal.inc();
    }
    if (user.activatedAt) return { status: 'active' };
    if (this.autoActivate()) {
      const activatedUser = await this.activateOnSignup(user);
      return { status: 'active', activatedUser };
    }
    return { status: 'pending_activation' };
  }

  /** Same as the admin's "Activate", except the password goes out as a welcome mail (the user is signed in anyway). */
  private async activateOnSignup(user: User): Promise<User> {
    const password = this.usersService.generatePassword();
    await this.usersService.setPassword(user.id, password);
    await this.usersService.markActivated(user.id);
    activationsTotal.inc();
    const { sent } = await this.mail.send({
      to: user.email ?? user.username,
      ...welcomeMail(user.language, { login: user.username, password, loginUrl: this.mail.buildClientLink('/') }),
    });
    // The user is signed in by the caller; without the mail they can still set a password via "Forgot password?".
    if (!sent) this.logger.warn(`Welcome mail with the password was not sent to user ${user.id}`);
    const activated = await this.usersService.findById(user.id);
    if (!activated) throw new BadRequestException('Invalid or expired token');
    return activated;
  }

  /** Always resolves; only an existing, not-yet-verified account gets a mail (60 s cooldown). */
  async resendVerification(email: string, ip: string | null = null): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerification(user, { respectCooldown: true, ip });
  }

  /** Always resolves; mails only a verified, activated account. */
  async forgotPassword(email: string, ip: string | null = null): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.emailVerifiedAt || !user.activatedAt) return;
    const last = await this.tokens.lastIssuedAt(user.id, 'reset-password');
    if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) return;
    if (!user.email || !(await this.limits.tryConsume('reset-password', user.email, ip))) return;
    const token = await this.tokens.issue(user.id, 'reset-password');
    const url = this.mail.buildClientLink(`/?resetPassword=${encodeURIComponent(token)}`);
    await this.sendTo(user, resetPasswordMail(user.language, url));
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const userId = await this.tokens.consume(rawToken, 'reset-password');
    const user = userId ? await this.usersService.findById(userId) : null;
    if (!user || !user.activatedAt) throw new BadRequestException('Invalid or expired token');
    await this.usersService.setPassword(user.id, password);
    await this.accessTokens.revokeAllForUser(user.id);
    this.logger.log(`Password reset for user ${user.id}`);
  }
}
