import { Body, Controller, Delete, HttpCode, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
// Value import on purpose — Nest's `ValidationPipe` reads the DTO class from this parameter's runtime metadata.
// oxlint-disable-next-line consistent-type-imports
import { RegisterMessageWaitDto } from './dto/register-message-wait.dto.js';
import { MessageWaitsService } from './message-waits.service.js';

/**
 * Where a reply-wait node's activities register and release a wait (ADR 0079 (private)). Under `/internal/`, so it is
 * served on the internal port only; `projectId` comes from the route (the guard checks the pod's token against it).
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/projects/:projectId/message-waits')
export class InternalMessageWaitsController {
  private readonly service: MessageWaitsService;

  constructor(@Inject(MessageWaitsService) service: MessageWaitsService) {
    this.service = service;
  }

  @Post()
  async register(
    @Param('projectId') projectId: string,
    @Body() body: RegisterMessageWaitDto,
  ): Promise<{ waitId: string }> {
    return { waitId: await this.service.register(projectId, body) };
  }

  @Delete(':waitId')
  @HttpCode(204)
  async release(@Param('projectId') projectId: string, @Param('waitId') waitId: string): Promise<void> {
    if (!(await this.service.release(projectId, waitId))) throw new NotFoundException('No such wait');
  }
}
