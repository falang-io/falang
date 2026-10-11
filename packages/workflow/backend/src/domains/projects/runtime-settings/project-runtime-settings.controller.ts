import { Body, Controller, Get, Inject, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Value import: Nest's global `ValidationPipe` resolves the DTO class from this parameter's runtime type metadata.
// oxlint-disable-next-line consistent-type-imports
import { UpdateRuntimeSettingsDto } from './dto/update-runtime-settings.dto.js';
import { ProjectRuntimeSettingsService, type IRuntimeSettings } from './project-runtime-settings.service.js';

/** `GET`/`PUT /projects/:id/runtime-settings` — ADR 0067 (private) §2. Reading is open to an admin (read-only), writing to the owner. */
@Controller('projects/:projectId/runtime-settings')
export class ProjectRuntimeSettingsController {
  private readonly settings: ProjectRuntimeSettingsService;

  constructor(@Inject(ProjectRuntimeSettingsService) settings: ProjectRuntimeSettingsService) {
    this.settings = settings;
  }

  @Get()
  get(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IRuntimeSettings> {
    return this.settings.get(projectId, user.id, 'read');
  }

  @Put()
  update(
    @Param('projectId') projectId: string,
    @Body() body: UpdateRuntimeSettingsDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IRuntimeSettings> {
    return this.settings.update(projectId, user.id, body);
  }
}
