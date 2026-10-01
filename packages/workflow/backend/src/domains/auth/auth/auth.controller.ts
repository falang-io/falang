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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users/users.service.js';
import { AuthService, type IAuthUser, type ILoginResult } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
// Kept as a value import (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from this parameter's runtime type metadata, so erasing the import
// would silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { ChangePasswordDto } from './dto/change-password.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { LoginDto } from './dto/login.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { RegisterDto } from './dto/register.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { UpdateLanguageDto } from './dto/update-language.dto.js';
import { getDisabledVendors } from '../../integrations/optional-vendors.js';
import { Public } from './public.decorator.js';
import type { IJwtPayloadUser } from './jwt.strategy.js';

@Controller('auth')
export class AuthController {
  private readonly authService: AuthService;
  private readonly usersService: UsersService;

  private readonly config: ConfigService;

  constructor(
    @Inject(AuthService) authService: AuthService,
    @Inject(UsersService) usersService: UsersService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.authService = authService;
    this.usersService = usersService;
    this.config = config;
  }

  // Read per request (not cached in the constructor) so the flags follow the live environment.
  private selfServiceSignup(): boolean {
    return this.config.get<string>('SELF_SERVICE_SIGNUP', 'false') === 'true';
  }

  private termsUrl(): string | null {
    const url = this.config.get<string>('TERMS_URL', '').trim();
    return url.length > 0 ? url : null;
  }

  /** Public: tells the login page whether to show the signup form (and which terms to accept). */
  @Public()
  @Get('config')
  getConfig(): { selfServiceSignup: boolean; termsUrl: string | null; disabledVendors: string[] } {
    return {
      selfServiceSignup: this.selfServiceSignup(),
      termsUrl: this.termsUrl(),
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
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: RegisterDto): Promise<ILoginResult> {
    if (!this.selfServiceSignup()) {
      throw new ForbiddenException(
        'Self-service signup is disabled on this instance; ask an administrator for an account',
      );
    }
    let termsAcceptedAt: Date | null = null;
    if (this.termsUrl()) {
      if (body.acceptTerms !== true) throw new BadRequestException('You must accept the terms to sign up');
      termsAcceptedAt = new Date();
    }
    return this.authService.register(body.username, body.password, termsAcceptedAt);
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
