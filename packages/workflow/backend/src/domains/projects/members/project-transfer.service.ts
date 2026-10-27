import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Project } from '../projects/project.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ProjectMember, type TProjectMemberRole } from './project-member.entity.js';
import { ProjectMembersService } from './project-members.service.js';

export interface ITransferProjectResult {
  readonly projectId: string;
  readonly previousOwnerId: string;
  readonly ownerId: string;
}

/**
 * Hands a project to another user (ADR 0070 (private), admin only). The new owner's member rows go (the owner is never a
 * member row), the previous owner keeps the roles the admin chose, and open tasks left with someone who is neither the
 * owner nor an executor are reassigned. Everything that follows `projects.owner_id` — limits, instance billing,
 * "suspend all the owner's projects" — moves with it; running pods, versions and the suspension flag are left as they are.
 */
@Injectable()
export class ProjectTransferService {
  private readonly projects: Repository<Project>;
  private readonly membersService: ProjectMembersService;
  private readonly projectsService: ProjectsService;

  constructor(
    @InjectRepository(Project) projects: Repository<Project>,
    @Inject(ProjectMembersService) membersService: ProjectMembersService,
    @Inject(ProjectsService) projectsService: ProjectsService,
  ) {
    this.projectsService = projectsService;
    this.projects = projects;
    this.membersService = membersService;
  }

  async transfer(
    projectId: string,
    adminId: string,
    login: string,
    previousOwnerRoles: readonly TProjectMemberRole[] = [],
  ): Promise<ITransferProjectResult> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Project "${projectId}" not found`);
    const user = await this.membersService.findByLogin(login);
    if (!user) throw new NotFoundException(`User "${login.trim()}" not found`);
    const previousOwnerId = project.ownerId;
    if (user.id === previousOwnerId) throw new BadRequestException('This user already owns the project');

    // The new owner's `maxProjects` applies to a transfer too (an admin can raise it first); the limit error is a 403 `project_limit`.
    await this.projectsService.assertUnderProjectLimit(user.id);

    await this.projects.manager.transaction(async (manager) => {
      await manager.update(Project, { id: project.id }, { ownerId: user.id });
      await manager.delete(ProjectMember, { projectId: project.id, userId: user.id });
      await manager.delete(ProjectMember, { projectId: project.id, userId: previousOwnerId });
      if (previousOwnerRoles.length > 0) {
        await manager.save(
          ProjectMember,
          previousOwnerRoles.map((role) =>
            manager.create(ProjectMember, { projectId: project.id, userId: previousOwnerId, role, addedBy: adminId }),
          ),
        );
      }
    });
    await this.membersService.reassignStrandedTasks(project.id, user.id);
    return { projectId: project.id, previousOwnerId, ownerId: user.id };
  }
}
