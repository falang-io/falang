import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users/users.service.js';
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
  /** `true` only for the seeded `admin` account while its password is still `admin`. */
  defaultPasswordInUse: boolean;
}

const SEEDED_ADMIN_USERNAME = 'admin';
const SEEDED_ADMIN_PASSWORD = 'admin';

@Injectable()
export class AuthService {
  private readonly usersService: UsersService;
  private readonly jwtService: JwtService;

  constructor(@Inject(UsersService) usersService: UsersService, @Inject(JwtService) jwtService: JwtService) {
    this.usersService = usersService;
    this.jwtService = jwtService;
  }

  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.usersService.findByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid username or password');
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
      defaultPasswordInUse,
    };
  }

  async login(user: User): Promise<ILoginResult> {
    const accessToken = this.jwtService.sign({ sub: user.id, username: user.username, role: user.role });
    return { accessToken, user: await this.toAuthUser(user) };
  }

  async register(username: string, password: string, termsAcceptedAt: Date | null = null): Promise<ILoginResult> {
    const existing = await this.usersService.findByUsername(username);
    if (existing) throw new ConflictException('Username is already taken');
    const user = await this.usersService.create({ username, password, termsAcceptedAt });
    return this.login(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.usersService.setPassword(userId, newPassword);
  }
}
