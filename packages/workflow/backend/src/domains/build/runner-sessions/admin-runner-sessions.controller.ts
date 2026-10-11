import { Controller, Get, Inject, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { UsersService } from '../../users/users/users.service.js';
import { RunnerSessionsService } from './runner-sessions.service.js';
import { parseSessionsQuery, toApiUserRunnerSession, type IApiUserRunnerSession } from './to-api-runner-session.js';

/** `GET /admin/users/:id/runner-sessions` — every project of the user, with the project's name. */
@UseGuards(AdminGuard)
@Controller('admin/users/:userId/runner-sessions')
export class AdminRunnerSessionsController {
  private readonly sessions: RunnerSessionsService;
  private readonly users: UsersService;

  constructor(
    @Inject(RunnerSessionsService) sessions: RunnerSessionsService,
    @Inject(UsersService) users: UsersService,
  ) {
    this.sessions = sessions;
    this.users = users;
  }

  @Get()
  async list(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<{ sessions: IApiUserRunnerSession[] }> {
    if (!(await this.users.findById(userId))) throw new NotFoundException(`User "${userId}" not found`);
    const rows = await this.sessions.listForUser(userId, parseSessionsQuery(limit, before));
    return { sessions: rows.map((row) => toApiUserRunnerSession(row)) };
  }
}
