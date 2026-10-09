import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Kept as a value import (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from this parameter's runtime type metadata, so erasing the import
// would silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { ImportProjectDto } from './dto/import-project.dto.js';
import type { Project } from '../projects/project.entity.js';
import { ProjectExportService, type IProjectExportPayload } from './project-export.service.js';

@Controller('projects')
export class ProjectExportController {
  private readonly projectExportService: ProjectExportService;

  constructor(@Inject(ProjectExportService) projectExportService: ProjectExportService) {
    this.projectExportService = projectExportService;
  }

  @Get(':projectId/export')
  exportProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectExportPayload> {
    return this.projectExportService.exportProject(projectId, user.id, 'read');
  }

  @Post('import')
  importProject(@CurrentUser() user: IJwtPayloadUser, @Body() body: ImportProjectDto): Promise<Project> {
    return this.projectExportService.importProject(user.id, body);
  }
}
