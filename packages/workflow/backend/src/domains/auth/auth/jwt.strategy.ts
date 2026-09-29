import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
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
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
    });
  }

  validate(payload: IJwtPayload): IJwtPayloadUser {
    return { id: payload.sub, username: payload.username, role: payload.role };
  }
}
