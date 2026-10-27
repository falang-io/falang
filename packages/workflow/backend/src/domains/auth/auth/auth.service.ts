import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users/users.service.js';
import { PersonalAccessTokensService } from '../personal-access-tokens/personal-access-tokens.service.js';
import type { User } from '../../users/users/user.entity.js';

export interface ILoginResult {
  accessToken: string;
  user: IAuthUser;
}

export interface IAuthUser {
  id: string;
  username: string;
  language: string;
  role: string;
  email: string | null;
  emailVerified: boolean;
  /** ISO timestamp; `null` for an application that is not activated yet. */
  activatedAt: string | null;
  companyName: string | null;
  /** `true` only for the seeded `admin` account while its password is still `admin`. */
  defaultPasswordInUse: boolean;
}

/** Compared against for an unknown login so the response time doesn't tell whether the account exists. */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('falang-dummy-password', 10);

const SEEDED_ADMIN_USERNAME = 'admin';
const SEEDED_ADMIN_PASSWORD = 'admin';

@Injectable()
export class AuthService {
  private readonly usersService: UsersService;
  private readonly jwtService: JwtService;

  private readonly accessTokens: PersonalAccessTokensService;

  constructor(
    @Inject(UsersService) usersService: UsersService,
    @Inject(JwtService) jwtService: JwtService,
    @Inject(PersonalAccessTokensService) accessTokens: PersonalAccessTokensService,
  ) {
    this.usersService = usersService;
    this.jwtService = jwtService;
    this.accessTokens = accessTokens;
  }

  async validateUser(username: string, password: string): Promise<User> {
    const user = (await this.usersService.findByUsername(username)) ?? (await this.usersService.findByEmail(username));
    // Same cost and same answer for an unknown login and a wrong password.
    const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_PASSWORD_HASH);
    if (!user || !passwordOk) throw new UnauthorizedException('Invalid username or password');
    // Only after the password check, so the state of an account is not revealed to someone who doesn't know it.
    if (!user.activatedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        code: user.emailVerifiedAt ? 'not_activated' : 'email_not_verified',
        message: user.emailVerifiedAt ? 'Your application has not been activated yet' : 'Confirm your e-mail first',
      });
    }
    return user;
  }

  async toAuthUser(user: User): Promise<IAuthUser> {
    // Only the seeded username is ever compared against the well-known password, so this costs one
    // extra bcrypt round for that one account and nothing for anybody else.
    const defaultPasswordInUse =
      user.username === SEEDED_ADMIN_USERNAME && (await bcrypt.compare(SEEDED_ADMIN_PASSWORD, user.password));
    return {
      id: user.id,
      username: user.username,
      language: user.language,
      role: user.role,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      activatedAt: user.activatedAt ? user.activatedAt.toISOString() : null,
      companyName: user.companyName,
      defaultPasswordInUse,
    };
  }

  async login(user: User): Promise<ILoginResult> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      tv: user.tokenVersion,
    });
    return { accessToken, user: await this.toAuthUser(user) };
  }

  /** `open` mode: active immediately; an optional e-mail is stored (verification is sent by the caller). */
  async register(
    username: string,
    password: string,
    termsAcceptedAt: Date | null = null,
    email: string | null = null,
  ): Promise<ILoginResult> {
    const existing = await this.usersService.findByUsername(username);
    if (existing) throw new ConflictException('Username is already taken');
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    if (normalizedEmail && (await this.usersService.findByEmail(normalizedEmail))) {
      throw new ConflictException('E-mail is already taken');
    }
    const user = await this.usersService.create({
      username,
      password,
      termsAcceptedAt,
      email: normalizedEmail,
      signupSource: 'self-service',
    });
    return this.login(user);
  }

  /**
   * Sets the new password (which bumps `token_version`, signing out every other session), revokes the user's personal
   * access tokens and returns a fresh login so the caller's own session carries on.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<ILoginResult> {
    const user = await this.usersService.findById(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.usersService.setPassword(userId, newPassword);
    await this.accessTokens.revokeAllForUser(userId);
    const updated = await this.usersService.findById(userId);
    if (!updated) throw new BadRequestException('Current password is incorrect');
    return this.login(updated);
  }
}
