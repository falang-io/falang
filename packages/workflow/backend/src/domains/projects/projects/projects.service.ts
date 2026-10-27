import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
import { In, type Repository } from 'typeorm';
import { UserLimitsService } from '../../admin/user-limits/user-limits.service.js';
import { User } from '../../users/users/user.entity.js';
import { Document } from '../documents/document.entity.js';
import { ensureFixedFolders } from '../layout/project-layout.js';
import { ProjectMember, type TProjectMemberRole } from '../members/project-member.entity.js';
import { Project, type TSuspendedReason } from './project.entity.js';

/**
 * How a caller may touch a project (ADR 0063, ADR 0070 (private)):
 * - `'owner'` — the owner only (deleting the project);
 * - `'edit'` (default — every write, run, build, agent call, member management) — the owner or an editor;
 * - `'read'` — the owner, an editor, or a platform admin viewing read-only (GET routes only);
 * - `'tasks'` — the owner, an editor or an executor (task list / detail / resolve);
 * - `'info'` — any of the above (`GET /projects/:id`).
 * Anyone else gets 404, so a project's existence never leaks.
 */
export type TProjectAccess = 'owner' | 'edit' | 'read' | 'tasks' | 'info';

/** The caller's relation to a project — `'owner'` plus any member roles. */
export type TProjectRole = 'owner' | TProjectMemberRole;

/** `GET /projects/:id` — the project plus who owns it, the caller's roles and whether the caller may only look. */
export interface IProjectInfo {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  owner: { id: string; username: string; email: string | null } | null;
  /** The caller's roles (empty for an admin who is not a member). */
  myRoles: TProjectRole[];
  /** The caller can't edit (an admin or an executor-only member). */
  readOnly: boolean;
  /** The caller may open the project's contents (owner, editor, admin); `false` = an executor-only member, who sees only tasks. */
  canRead: boolean;
}

/** `GET /projects` — a project the caller owns or is a member of. */
export type TAccessibleProject = Project & { myRoles: TProjectRole[] };

const canEdit = (roles: ReadonlySet<TProjectRole>): boolean => roles.has('owner') || roles.has('editor');

const ROLE_ORDER: readonly TProjectRole[] = ['owner', 'editor', 'executor'];
const sortRoles = (roles: ReadonlySet<TProjectRole>): TProjectRole[] => ROLE_ORDER.filter((role) => roles.has(role));

@Injectable()
export class ProjectsService {
  private readonly projects: Repository<Project>;
  private readonly documents: Repository<Document>;
  private readonly users: Repository<User>;
  private readonly members: Repository<ProjectMember>;
  private readonly userLimits: UserLimitsService | undefined;

  constructor(
    @InjectRepository(Project) projects: Repository<Project>,
    @InjectRepository(Document) documents: Repository<Document>,
    @InjectRepository(User) users: Repository<User>,
    @InjectRepository(ProjectMember) members: Repository<ProjectMember>,
    // Optional so a lightweight test module without the limits table still builds; the real app always provides it.
    @Optional() @Inject(UserLimitsService) userLimits?: UserLimitsService,
  ) {
    this.userLimits = userLimits;
    this.projects = projects;
    this.documents = documents;
    this.users = users;
    this.members = members;
  }

  /** Projects `ownerId` owns — owner-scoped uses only (suspension, limits); a user's visible projects are `listAccessible`. */
  list(ownerId: string): Promise<Project[]> {
    return this.projects.find({ where: { ownerId }, order: { createdAt: 'ASC' } });
  }

  /**
   * Projects `userId` owns or is a member of, each with the caller's roles, oldest first. `minimum: 'edit'` keeps only
   * those the caller may edit (owner/editor) — the run listing, MCP; `'tasks'` (default) every one (the project list,
   * the Tasks page).
   */
  async listAccessible(userId: string, minimum: 'edit' | 'tasks' = 'tasks'): Promise<TAccessibleProject[]> {
    const owned = await this.list(userId);
    const memberships = await this.members.find({ where: { userId } });
    const rolesByProject = new Map<string, Set<TProjectRole>>();
    for (const project of owned) rolesByProject.set(project.id, new Set<TProjectRole>(['owner']));
    for (const membership of memberships) {
      const roles = rolesByProject.get(membership.projectId) ?? new Set<TProjectRole>();
      roles.add(membership.role);
      rolesByProject.set(membership.projectId, roles);
    }
    const sharedIds = [...rolesByProject.keys()].filter((id) => !owned.some((project) => project.id === id));
    const shared = sharedIds.length > 0 ? await this.projects.find({ where: { id: In(sharedIds) } }) : [];
    return [...owned, ...shared]
      .map((project) => {
        const roles = rolesByProject.get(project.id) ?? new Set<TProjectRole>();
        return { project, roles };
      })
      .filter(({ roles }) => minimum === 'tasks' || canEdit(roles))
      .toSorted((a, b) => a.project.createdAt.getTime() - b.project.createdAt.getTime())
      .map(({ project, roles }) => Object.assign(project, { myRoles: sortRoles(roles) }));
  }

  /** The caller's roles in `project` (`owner` plus member roles). */
  async rolesOf(project: Pick<Project, 'id' | 'ownerId'>, userId: string): Promise<Set<TProjectRole>> {
    const roles = new Set<TProjectRole>();
    if (project.ownerId === userId) roles.add('owner');
    const memberships = await this.members.find({
      select: { id: true, role: true },
      where: { projectId: project.id, userId },
    });
    for (const membership of memberships) roles.add(membership.role);
    return roles;
  }

  /**
   * Throws `403 { code: 'project_limit' }` when `ownerId` already owns `maxProjects` projects (`UserLimitsService`).
   * `extra` projects about to be added (default 1) count too. Every project-creating path (REST, import, templates, MCP)
   * goes through `create`; an admin transfer calls this with the new owner.
   */
  async assertUnderProjectLimit(ownerId: string, extra = 1): Promise<void> {
    if (!this.userLimits) return;
    const { maxProjects } = await this.userLimits.getLimits(ownerId);
    const owned = await this.projects.count({ where: { ownerId } });
    if (owned + extra > maxProjects) {
      throw new ForbiddenException({
        code: 'project_limit',
        message: `Project limit reached (${maxProjects}). Delete a project or ask an administrator to raise the limit.`,
      });
    }
  }

  async create(ownerId: string, name: string): Promise<Project> {
    await this.assertUnderProjectLimit(ownerId);
    const project = this.projects.create({ name, ownerId });
    const savedProject = await this.projects.save(project);
    await this.seedIntegrationsDocument(savedProject.id);
    await ensureFixedFolders(this.projects.manager, savedProject.id);
    return savedProject;
  }

  /**
   * Every project gets one pinned, non-deletable, non-movable `integrations` document at its root —
   * see ADR 0006. Not going through `DocumentsService` to avoid a circular module dependency between
   * `ProjectsModule` and `DocumentsModule` (which already depends on `ProjectsModule` for ownership checks).
   */
  private async seedIntegrationsDocument(projectId: string): Promise<void> {
    const document = this.documents.create({
      id: randomUUID(),
      type: INTEGRATIONS_DOCUMENT_TYPE,
      name: 'Integrations',
      folderId: null,
      projectId,
      pinned: true,
      root: null,
      data: { instances: [] },
    });
    await this.documents.save(document);
  }

  /**
   * Resolves project `id` if `userId` may touch it at `access` (see `TProjectAccess`), or throws 404 — the one
   * authorization check before touching a project's contents, never leaking whether a project exists. The admin role is
   * re-read from the database, never taken from the JWT claim, same as `AdminGuard`.
   */
  async getOwnedProject(id: string, userId: string, access: TProjectAccess = 'edit'): Promise<Project> {
    const project = await this.projects.findOneBy({ id });
    if (project && (await this.isAllowed(project, userId, access))) return project;
    throw new NotFoundException(`Project "${id}" not found`);
  }

  private async isAllowed(project: Project, userId: string, access: TProjectAccess): Promise<boolean> {
    if (project.ownerId === userId) return true;
    if (access === 'owner') return false;
    const roles = await this.rolesOf(project, userId);
    if (roles.has('editor')) return true;
    if (access === 'tasks' && roles.has('executor')) return true;
    if (access === 'info' && roles.has('executor')) return true;
    return (access === 'read' || access === 'info') && (await this.isAdmin(userId));
  }

  /** `GET /projects/:id` — for the owner, members, and (read-only) an admin. */
  async getProjectInfo(id: string, userId: string): Promise<IProjectInfo> {
    const project = await this.getOwnedProject(id, userId, 'info');
    const roles = await this.rolesOf(project, userId);
    const owner = await this.users.findOne({
      select: { id: true, username: true, email: true },
      where: { id: project.ownerId },
    });
    const editable = canEdit(roles);
    return {
      id: project.id,
      name: project.name,
      ownerId: project.ownerId,
      createdAt: project.createdAt,
      owner: owner ? { id: owner.id, username: owner.username, email: owner.email } : null,
      myRoles: sortRoles(roles),
      readOnly: !editable,
      canRead: editable || (await this.isAdmin(userId)),
    };
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.users.findOne({ select: { id: true, role: true }, where: { id: userId } });
    return user?.role === 'admin';
  }

  /** The owning user's id for `projectId`, or throws 404 — for resolving per-owner limits (`UserLimitsService`) where no caller identity is at hand. */
  async getOwnerId(id: string): Promise<string> {
    const project = await this.projects.findOneBy({ id });
    if (!project) throw new NotFoundException(`Project "${id}" not found`);
    return project.ownerId;
  }

  /** Persists the client's prod Start/Stop toggle — see `Project.prodEnabled`. Returns whether a project row was updated. */
  async setProdEnabled(id: string, enabled: boolean): Promise<boolean> {
    const result = await this.projects.update({ id }, { prodEnabled: enabled });
    return (result.affected ?? 0) > 0;
  }

  /** `Project.prodBuildId` of `id`, or `null` (also for an unknown project). */
  async getProdBuildId(id: string): Promise<string | null> {
    const project = await this.projects.findOne({ select: { id: true, prodBuildId: true }, where: { id } });
    return project?.prodBuildId ?? null;
  }

  /** Records which published version production runs — see `Project.prodBuildId`. */
  async setProdBuildId(id: string, buildId: string | null): Promise<void> {
    await this.projects.update({ id }, { prodBuildId: buildId });
  }

  /** The run journal's text policy for a project (`null` when the project doesn't exist) — see `RunJournalService`. */
  async getJournalStoreTexts(projectId: string): Promise<boolean | null> {
    const row = await this.projects.findOne({
      select: { id: true, journalStoreTexts: true },
      where: { id: projectId },
    });
    return row ? row.journalStoreTexts : null;
  }

  async setJournalStoreTexts(projectId: string, storeTexts: boolean): Promise<void> {
    await this.projects.update({ id: projectId }, { journalStoreTexts: storeTexts });
  }

  /** `Project.suspendedReason` of `id` (`null` also for an unknown project). */
  async getSuspendedReason(id: string): Promise<TSuspendedReason | null> {
    const project = await this.projects.findOne({ select: { id: true, suspendedReason: true }, where: { id } });
    return project?.suspendedReason ?? null;
  }

  /** Sets (or, with `null`, clears) the suspension reason; returns whether a project row was updated. */
  async setSuspendedReason(id: string, reason: TSuspendedReason | null): Promise<boolean> {
    const result = await this.projects.update({ id }, { suspendedReason: reason });
    return (result.affected ?? 0) > 0;
  }

  /** `ownerId` + `suspendedReason` of a project in one read, for the runner start gate; throws 404 for an unknown project. */
  async getStartGateInfo(id: string): Promise<{ ownerId: string; suspendedReason: TSuspendedReason | null }> {
    const project = await this.projects.findOne({
      select: { id: true, ownerId: true, suspendedReason: true },
      where: { id },
    });
    if (!project) throw new NotFoundException(`Project "${id}" not found`);
    return { ownerId: project.ownerId, suspendedReason: project.suspendedReason };
  }

  /** Ids of every suspended project — `BuildService` never restores their ingress on boot. */
  async listSuspendedIds(): Promise<string[]> {
    const rows = await this.projects.find({ select: { id: true, suspendedReason: true } });
    return rows.filter((row) => row.suspendedReason !== null).map((row) => row.id);
  }

  /** Ids of every project whose production is turned on — `BuildService` re-activates their prod ingress on boot. */
  async listProdEnabledIds(): Promise<string[]> {
    const rows = await this.projects.find({ select: { id: true }, where: { prodEnabled: true } });
    return rows.map((row) => row.id);
  }

  /**
   * Removes the project row. Its folders/documents cascade via each entity's `onDelete: 'CASCADE'`
   * FK to `projectId` (see `Folder`/`Document`); anything with a plain, non-FK `projectId` column
   * (e.g. `ProjectVersion`) does not cascade and must be cleaned up by the caller — see
   * `BuildService.deleteProject`, which also stops the project's runner processes first.
   */
  async delete(id: string, ownerId: string): Promise<void> {
    const project = await this.getOwnedProject(id, ownerId, 'owner');
    await this.projects.remove(project);
  }
}
