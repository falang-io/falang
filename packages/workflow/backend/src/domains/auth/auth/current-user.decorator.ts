import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IJwtPayloadUser } from './jwt.strategy.js';

/** Reads the user attached to the request by `JwtStrategy.validate`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): IJwtPayloadUser => {
  const request = ctx.switchToHttp().getRequest<{ user: IJwtPayloadUser }>();
  return request.user;
});
