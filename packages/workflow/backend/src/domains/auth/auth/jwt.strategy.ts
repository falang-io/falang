import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from '../../../config/validate-secrets.js';
import type { TUserRole } from '../../users/users/user.entity.js';

export interface IJwtPayload {
  sub: string;
  username: string;
  role: TUserRole;
}

export interface IJwtPayloadUser {
  id: string;
  username: string;
  role: TUserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ConfigService) config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config.get<string>('JWT_SECRET'), config.get<string>('NODE_ENV')),
    });
  }

  validate(payload: IJwtPayload): IJwtPayloadUser {
    return { id: payload.sub, username: payload.username, role: payload.role };
  }
}
