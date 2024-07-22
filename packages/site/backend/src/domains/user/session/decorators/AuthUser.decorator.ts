import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

import { User } from '../../user/entites/User.entity';

export const AuthUser = createParamDecorator(
  (data: keyof User, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<Request>().user as User;
    if (!user || !user.id) throw new ForbiddenException('Not authorized');
    return data ? user && user[data] : user;
  },
);
