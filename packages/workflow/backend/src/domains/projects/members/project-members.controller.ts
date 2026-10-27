import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Value imports (not `import type`): Nest's `ValidationPipe` reads the DTO class from the parameter's type metadata.
// oxlint-disable-next-line consistent-type-imports
import { AddProjectMemberDto } from './dto/add-project-member.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { SetProjectMemberRolesDto } from './dto/set-project-member-roles.dto.js';
import { ProjectMembersService } from './project-members.service.js';
import type { IProjectMembers } from './project-members.types.js';

/** "Project → Users" (ADR 0070 (private)) — the owner, an editor or a platform admin. */
@Controller('projects/:projectId/members')
export class ProjectMembersController {
  private readonly membersService: ProjectMembersService;

  constructor(@Inject(ProjectMembersService) membersService: ProjectMembersService) {
    this.membersService = membersService;
  }

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IProjectMembers> {
    return this.membersService.list(projectId, user.id);
  }

  @Post()
  add(
    @Param('projectId') projectId: string,
    @Body() body: AddProjectMemberDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectMembers> {
    return this.membersService.add(projectId, user.id, body.login, body.roles);
  }

  @Put(':userId')
  setRoles(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() body: SetProjectMemberRolesDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectMembers> {
    return this.membersService.setRoles(projectId, user.id, userId, body.roles);
  }

  @Delete(':userId')
  remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectMembers> {
    return this.membersService.remove(projectId, user.id, userId);
  }
}
