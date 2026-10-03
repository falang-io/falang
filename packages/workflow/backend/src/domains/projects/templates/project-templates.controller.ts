import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import type { Project } from '../projects/project.entity.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { CreateProjectFromTemplateDto } from './dto/create-project-from-template.dto.js';
import { ProjectTemplatesService, type IProjectTemplateSummary } from './project-templates.service.js';

/**
 * User-facing half. The controllers of this module are registered before `ProjectsModule`'s
 * `:projectId` ones in `AppModule`, but `POST /projects/from-template/:id` has a literal second
 * segment that none of those parametrised routes can match anyway (covered by a test).
 */
@Controller()
export class ProjectTemplatesController {
  private readonly service: ProjectTemplatesService;

  constructor(@Inject(ProjectTemplatesService) service: ProjectTemplatesService) {
    this.service = service;
  }

  @Get('project-templates')
  list(): Promise<IProjectTemplateSummary[]> {
    return this.service.listEnabled();
  }

  @Post('projects/from-template/:templateId')
  createFromTemplate(
    @CurrentUser() user: IJwtPayloadUser,
    @Param('templateId') templateId: string,
    @Body() body: CreateProjectFromTemplateDto,
  ): Promise<Project> {
    return this.service.createProjectFromTemplate(user.id, templateId, body.name);
  }
}
