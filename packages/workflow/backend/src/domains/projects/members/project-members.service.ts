import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { Task } from '../../tasks/task.entity.js';
import { User } from '../../users/users/user.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { PROJECT_MEMBER_ROLES, ProjectMember, type TProjectMemberRole } from './project-member.entity.js';
import type { IProjectMemberInfo, IProjectMembers } from './project-members.types.js';

/**
 * Project members (ADR 0070 (private)): editors and executors, managed by the owner, an editor or a platform admin, and
 * the task assignment rule — a new task goes to the project's executor with the fewest open tasks in it, else to the
 * owner.
 */
@Injectable()
export class ProjectMembersService {
  private readonly members: Repository<ProjectMember>;
  private readonly users: Repository<User>;
  private readonly tasks: Repository<Task>;
  private readonly projectsService: ProjectsService;

  constructor(
    @InjectRepository(ProjectMember) members: Repository<ProjectMember>,
    @InjectRepository(User) users: Repository<User>,
    @InjectRepository(Task) tasks: Repository<Task>,
    @Inject(ProjectsService) projectsService: ProjectsService,
  ) {
    this.members = members;
    this.users = users;
    this.tasks = tasks;
    this.projectsService = projectsService;
  }

  /**
   * Members are managed by whoever passes the `'read'` check — exactly the owner, an editor, or a (DB-verified) admin,
   * the three the ADR allows; an executor or a stranger gets 404.
   */
  private assertCanManage(projectId: string, callerId: string) {
    return this.projectsService.getOwnedProject(projectId, callerId, 'read');
  }

  async list(projectId: string, callerId: string): Promise<IProjectMembers> {
    const project = await this.assertCanManage(projectId, callerId);
    return this.describe(project.id, project.ownerId);
  }

  async add(
    projectId: string,
    callerId: string,
    login: string,
    roles: readonly TProjectMemberRole[],
  ): Promise<IProjectMembers> {
    const project = await this.assertCanManage(projectId, callerId);
    const user = await this.findByLogin(login);
    if (!user) throw new NotFoundException(`User "${login.trim()}" not found`);
    if (user.id === project.ownerId) throw new BadRequestException('The owner is already in the project');
    const existing = await this.members.find({ where: { projectId: project.id, userId: user.id } });
    const missing = roles.filter((role) => !existing.some((row) => row.role === role));
    if (missing.length > 0) {
      await this.members.save(
        missing.map((role) => this.members.create({ projectId: project.id, userId: user.id, role, addedBy: callerId })),
      );
    }
    return this.describe(project.id, project.ownerId);
  }

  /** Replaces a member's roles; an empty list removes them. Losing the executor role hands their open tasks on. */
  async setRoles(
    projectId: string,
    callerId: string,
    userId: string,
    roles: readonly TProjectMemberRole[],
  ): Promise<IProjectMembers> {
    const project = await this.assertCanManage(projectId, callerId);
    if (userId === project.ownerId) throw new BadRequestException('The owner’s access cannot be changed');
    const existing = await this.members.find({ where: { projectId: project.id, userId } });
    if (existing.length === 0) throw new NotFoundException(`User "${userId}" is not a member of this project`);
    const removed = existing.filter((row) => !roles.includes(row.role));
    const added = roles.filter((role) => !existing.some((row) => row.role === role));
    if (removed.length > 0) await this.members.remove(removed);
    if (added.length > 0) {
      await this.members.save(
        added.map((role) => this.members.create({ projectId: project.id, userId, role, addedBy: callerId })),
      );
    }
    if (removed.some((row) => row.role === 'executor'))
      await this.reassignOpenTasks(project.id, project.ownerId, userId);
    return this.describe(project.id, project.ownerId);
  }

  remove(projectId: string, callerId: string, userId: string): Promise<IProjectMembers> {
    return this.setRoles(projectId, callerId, userId, []);
  }

  /**
   * Who a new task of `projectId` goes to: the executor with the fewest open tasks of this project (ties: the earliest
   * executor, then the user id), else the owner. Two concurrent asks may pick the same executor — accepted.
   */
  async pickTaskAssignee(projectId: string, ownerId: string): Promise<string> {
    const executors = await this.members.find({
      where: { projectId, role: 'executor' },
      order: { createdAt: 'ASC', userId: 'ASC' },
    });
    if (executors.length === 0) return ownerId;
    const counts = await this.openTaskCounts(
      projectId,
      executors.map((row) => row.userId),
    );
    let best = executors[0];
    for (const candidate of executors) {
      if ((counts.get(candidate.userId) ?? 0) < (counts.get(best.userId) ?? 0)) best = candidate;
    }
    return best.userId;
  }

  /** Moves `fromUserId`'s open tasks of `projectId` to the remaining executors (one by one, least loaded first), or the owner. */
  private async reassignOpenTasks(projectId: string, ownerId: string, fromUserId: string): Promise<void> {
    const open = await this.tasks.find({
      select: { id: true },
      where: { projectId, assigneeId: fromUserId, status: 'open' },
      order: { createdAt: 'ASC' },
    });
    for (const task of open) {
      // oxlint-disable-next-line no-await-in-loop -- each pick must see the previous reassignment.
      const assigneeId = await this.pickTaskAssignee(projectId, ownerId);
      // oxlint-disable-next-line no-await-in-loop
      await this.tasks.update({ id: task.id, status: 'open' }, { assigneeId });
    }
  }

  /**
   * Hands on the open tasks of `projectId` whose assignee is neither `ownerId` nor an executor any more (after an
   * ownership transfer the previous owner may be neither), the same way as on losing the executor role.
   */
  async reassignStrandedTasks(projectId: string, ownerId: string): Promise<void> {
    const executors = await this.members.find({ select: { userId: true }, where: { projectId, role: 'executor' } });
    const keep = new Set([ownerId, ...executors.map((row) => row.userId)]);
    const open = await this.tasks.find({ select: { assigneeId: true }, where: { projectId, status: 'open' } });
    const stranded = new Set(
      open.flatMap((task) => (task.assigneeId && !keep.has(task.assigneeId) ? [task.assigneeId] : [])),
    );
    for (const userId of stranded) {
      // oxlint-disable-next-line no-await-in-loop -- each pick must see the previous reassignment.
      await this.reassignOpenTasks(projectId, ownerId, userId);
    }
  }

  private async openTaskCounts(projectId: string, userIds: readonly string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.tasks.find({
      select: { id: true, assigneeId: true },
      where: { projectId, status: 'open', assigneeId: In([...userIds]) },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.assigneeId) counts.set(row.assigneeId, (counts.get(row.assigneeId) ?? 0) + 1);
    }
    return counts;
  }

  /** Username (case-insensitive) or e-mail. */
  findByLogin(login: string): Promise<User | null> {
    const value = login.trim().toLowerCase();
    if (!value) return Promise.resolve(null);
    return this.users
      .createQueryBuilder('user')
      .where('LOWER(user.username) = :value', { value })
      .orWhere('LOWER(user.email) = :value', { value })
      .orderBy('user.createdAt', 'ASC')
      .getOne();
  }

  private async describe(projectId: string, ownerId: string): Promise<IProjectMembers> {
    const rows = await this.members.find({ where: { projectId }, order: { createdAt: 'ASC' } });
    const userIds = [...new Set([ownerId, ...rows.map((row) => row.userId)])];
    const users = await this.users.find({
      select: { id: true, username: true, email: true },
      where: { id: In(userIds) },
    });
    const userById = new Map(users.map((user) => [user.id, user]));
    const counts = await this.openTaskCounts(projectId, userIds);

    const byUser = new Map<string, IProjectMemberInfo>();
    for (const row of rows) {
      const user = userById.get(row.userId);
      if (!user) continue;
      const current = byUser.get(row.userId);
      const roles = current ? [...current.roles, row.role] : [row.role];
      byUser.set(row.userId, {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: PROJECT_MEMBER_ROLES.filter((role) => roles.includes(role)),
        openTasks: counts.get(user.id) ?? 0,
        addedAt: current ? current.addedAt : row.createdAt.toISOString(),
      });
    }
    const owner = userById.get(ownerId);
    return {
      owner: owner
        ? { id: owner.id, username: owner.username, email: owner.email, openTasks: counts.get(owner.id) ?? 0 }
        : null,
      members: [...byUser.values()],
    };
  }
}
