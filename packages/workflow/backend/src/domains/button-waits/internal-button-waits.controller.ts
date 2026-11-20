import { Body, Controller, Delete, HttpCode, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
// Value import: Nest's ValidationPipe reads the runtime class metadata.
// oxlint-disable-next-line consistent-type-imports
import { RegisterButtonWaitDto } from './dto/register-button-wait.dto.js';
import { ButtonWaitsService } from './button-waits.service.js';

@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/projects/:projectId/button-waits')
export class InternalButtonWaitsController {
  private readonly service: ButtonWaitsService;

  constructor(@Inject(ButtonWaitsService) service: ButtonWaitsService) {
    this.service = service;
  }

  @Post()
  async register(
    @Param('projectId') projectId: string,
    @Body() body: RegisterButtonWaitDto,
  ): Promise<{ waitId: string }> {
    return { waitId: await this.service.register(projectId, body) };
  }

  @Delete(':waitId')
  @HttpCode(204)
  async release(@Param('projectId') projectId: string, @Param('waitId') waitId: string): Promise<void> {
    if (!(await this.service.release(projectId, waitId))) throw new NotFoundException('No such button wait');
  }
}
