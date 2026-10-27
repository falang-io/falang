import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users/users.service.js';
import { resolveJwtSecret } from '../../../config/validate-secrets.js';
import type { TUserRole } from '../../users/users/user.entity.js';

export interface IJwtPayload {
  sub: string;
  username: string;
  role: TUserRole;
  /** `token_version` at issue time; absent on tokens issued before revocation existed (read as 0). */
  tv?: number;
}

export interface IJwtPayloadUser {
  id: string;
  username: string;
  role: TUserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly usersService: UsersService;

  constructor(@Inject(ConfigService) config: ConfigService, @Inject(UsersService) usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get<string>('JWT_SECRET'), config.get<string>('NODE_ENV')),
    });
    this.usersService = usersService;
  }

  /** Rejects a token whose user is gone or whose `tv` no longer matches (password changed/reset since). */
  async validate(payload: IJwtPayload): Promise<IJwtPayloadUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user || user.tokenVersion !== (payload.tv ?? 0)) throw new UnauthorizedException();
    return { id: user.id, username: user.username, role: user.role };
  }
}
