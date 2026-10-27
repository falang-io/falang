import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Kept as a value import (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from this parameter's runtime type metadata, so erasing the import
// would silently disable body validation on this route.
// oxlint-disable-next-line consistent-type-imports
import { CreateProjectDto } from './dto/create-project.dto.js';
import type { Project } from './project.entity.js';
import { type IProjectInfo, ProjectsService, type TAccessibleProject } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  private readonly projectsService: ProjectsService;

  constructor(@Inject(ProjectsService) projectsService: ProjectsService) {
    this.projectsService = projectsService;
  }

  /** Owned projects plus those the caller is a member of (ADR 0070 (private)), each with `myRoles`. */
  @Get()
  list(@CurrentUser() user: IJwtPayloadUser): Promise<TAccessibleProject[]> {
    return this.projectsService.listAccessible(user.id);
  }

  /** The owner, a member, or an admin viewing read-only — see `TProjectAccess` and `IProjectInfo`. */
  @Get(':projectId')
  get(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IProjectInfo> {
    return this.projectsService.getProjectInfo(projectId, user.id);
  }

  @Post()
  create(@CurrentUser() user: IJwtPayloadUser, @Body() body: CreateProjectDto): Promise<Project> {
    return this.projectsService.create(user.id, body.name);
  }
}
