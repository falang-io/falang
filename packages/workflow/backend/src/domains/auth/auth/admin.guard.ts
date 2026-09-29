import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { UsersService } from '../../users/users/users.service.js';
import type { IJwtPayloadUser } from './jwt.strategy.js';

/**
 * Guards every `/admin/*` route (ADR 0030 (private)).
 * Runs after the global JWT/PAT guard (`@UseGuards(AdminGuard)` on a controller composes with the
 * globally-registered `JwtAuthGuard`, which runs first and populates `request.user`) — but
 * deliberately re-reads the user's role from the database rather than trusting the JWT payload's own
 * `role` claim: revoking admin access must take effect immediately, and admin traffic is tiny enough
 * that the extra lookup per request is not a concern.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly usersService: UsersService;

  constructor(@Inject(UsersService) usersService: UsersService) {
    this.usersService = usersService;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: IJwtPayloadUser }>();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Admin access required');
    const user = await this.usersService.findById(userId);
    if (!user || user.role !== 'admin') throw new ForbiddenException('Admin access required');
    return true;
  }
}
