import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { CaptchaService, type ICaptchaPublicConfig } from '../captcha/captcha.service.js';
import { MailService } from '../../mail/mail.service.js';
import { UsersService } from '../../users/users/users.service.js';
import { AuthService, type IAuthUser, type ILoginResult } from './auth.service.js';
import { AccountService, type TAccountStatus } from './account.service.js';
import { CurrentUser } from './current-user.decorator.js';
// Kept as a value import (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from this parameter's runtime type metadata, so erasing the import
// would silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { ChangePasswordDto } from './dto/change-password.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { ResetPasswordDto } from './dto/reset-password.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { VerifyEmailDto } from './dto/verify-email.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { LoginDto } from './dto/login.dto.js';
import { signupsTotal } from '../../metrics/metrics.js';
// oxlint-disable-next-line consistent-type-imports
import { RegisterDto } from './dto/register.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { UpdateLanguageDto } from './dto/update-language.dto.js';
import { getDisabledVendors } from '../../integrations/optional-vendors.js';
import { Public } from './public.decorator.js';
import { resolveSignupMode, type TSignupMode } from './signup-mode.js';
import type { IJwtPayloadUser } from './jwt.strategy.js';

@Controller('auth')
export class AuthController {
  private readonly authService: AuthService;
  private readonly usersService: UsersService;

  private readonly config: ConfigService;
  private readonly account: AccountService;
  private readonly captcha: CaptchaService;
  private readonly mail: MailService;

  constructor(
    @Inject(AuthService) authService: AuthService,
    @Inject(UsersService) usersService: UsersService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(AccountService) account: AccountService,
    @Inject(CaptchaService) captcha: CaptchaService,
    @Inject(MailService) mail: MailService,
  ) {
    this.authService = authService;
    this.usersService = usersService;
    this.config = config;
    this.account = account;
    this.captcha = captcha;
    this.mail = mail;
  }

  // Read per request (not cached in the constructor) so the flags follow the live environment.
  private signupMode(): TSignupMode {
    return resolveSignupMode(this.config);
  }

  private termsUrl(): string | null {
    const url = this.config.get<string>('TERMS_URL', '').trim();
    return url.length > 0 ? url : null;
  }

  /** Public: tells the login page whether to show the signup form (and which terms to accept). */
  @Public()
  @Get('config')
  getConfig(): {
    signupMode: TSignupMode;
    termsUrl: string | null;
    captcha: ICaptchaPublicConfig | null;
    mailConfigured: boolean;
    selfServiceSignup: boolean;
    disabledVendors: string[];
  } {
    const signupMode = this.signupMode();
    return {
      signupMode,
      termsUrl: this.termsUrl(),
      captcha: this.captcha.getPublicConfig(),
      mailConfigured: this.mail.isConfigured,
      selfServiceSignup: signupMode !== 'off',
      disabledVendors: getDisabledVendors(),
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto): Promise<ILoginResult> {
    const user = await this.authService.validateUser(body.username, body.password);
    return this.authService.login(user);
  }

  @Public()
  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ILoginResult | { status: 'pending_email' }> {
    const mode = this.signupMode();
    if (mode === 'off') {
      throw new ForbiddenException(
        'Self-service signup is disabled on this instance; ask an administrator for an account',
      );
    }
    await this.captcha.verify(body.captchaToken ?? null, req.ip ?? null);
    let termsAcceptedAt: Date | null = null;
    if (this.termsUrl()) {
      if (body.acceptTerms !== true) throw new BadRequestException('You must accept the terms to sign up');
      termsAcceptedAt = new Date();
    }
    if (mode === 'application') {
      if (!body.email || !body.companyName || !body.automationInterest) {
        throw new BadRequestException('email, companyName and automationInterest are required');
      }
      const result = await this.account.apply({
        email: body.email,
        companyName: body.companyName,
        automationInterest: body.automationInterest,
        termsAcceptedAt,
      });
      signupsTotal.inc({ mode });
      res.status(HttpStatus.ACCEPTED);
      return result;
    }
    if (!body.username || !body.password) throw new BadRequestException('username and password are required');
    const result = await this.authService.register(body.username, body.password, termsAcceptedAt, body.email ?? null);
    const user = body.email ? await this.usersService.findById(result.user.id) : null;
    if (user) await this.account.sendVerification(user, { respectCooldown: false });
    signupsTotal.inc({ mode });
    res.status(HttpStatus.CREATED);
    return result;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() body: VerifyEmailDto): Promise<{ status: TAccountStatus }> {
    return this.account.verifyEmail(body.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Body() body: ResendVerificationDto): Promise<void> {
    await this.account.resendVerification(body.email);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    await this.captcha.verify(body.captchaToken ?? null, req.ip ?? null);
    await this.account.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.account.resetPassword(body.token, body.password);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@CurrentUser() currentUser: IJwtPayloadUser, @Body() body: ChangePasswordDto): Promise<void> {
    await this.authService.changePassword(currentUser.id, body.currentPassword, body.newPassword);
  }

  @Get('me')
  async me(@CurrentUser() currentUser: IJwtPayloadUser): Promise<IAuthUser> {
    const user = await this.usersService.findById(currentUser.id);
    if (!user) throw new NotFoundException('User not found');
    return this.authService.toAuthUser(user);
  }

  @Patch('me')
  async updateMe(@CurrentUser() currentUser: IJwtPayloadUser, @Body() body: UpdateLanguageDto): Promise<IAuthUser> {
    const user = await this.usersService.updateLanguage(currentUser.id, body.language);
    return this.authService.toAuthUser(user);
  }
}
