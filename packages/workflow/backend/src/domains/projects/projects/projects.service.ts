import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { User } from '../../users/users/user.entity.js';
import { Document } from '../documents/document.entity.js';
import { ensureFixedFolders } from '../layout/project-layout.js';
import { Project } from './project.entity.js';

/**
 * How a caller may touch a project: `'owner'` (default — every write, run, build, agent call) or
 * `'read'` — the owner, or a platform admin viewing someone else's project read-only. Only GET routes
 * pass `'read'`; any write keeps answering 404 to an admin who isn't the owner.
 */
export type TProjectAccess = 'owner' | 'read';

/** `GET /projects/:id` — the project plus who owns it, and whether the caller may only look. */
export interface IProjectInfo {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  owner: { id: string; username: string; email: string | null } | null;
  readOnly: boolean;
}

@Injectable()
export class ProjectsService {
  private readonly projects: Repository<Project>;
  private readonly documents: Repository<Document>;
  private readonly users: Repository<User>;

  constructor(
    @InjectRepository(Project) projects: Repository<Project>,
    @InjectRepository(Document) documents: Repository<Document>,
    @InjectRepository(User) users: Repository<User>,
  ) {
    this.projects = projects;
    this.documents = documents;
    this.users = users;
  }

  list(ownerId: string): Promise<Project[]> {
    return this.projects.find({ where: { ownerId }, order: { createdAt: 'ASC' } });
  }

  async create(ownerId: string, name: string): Promise<Project> {
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
   * Resolves a project owned by `userId`, or throws 404 — used by folders/documents to authorize before touching a
   * project's contents, and to avoid leaking whether a project exists to a non-owner. With `access: 'read'` a platform
   * admin passes too (read-only viewing of other users' projects); the role is re-read from the database, never taken
   * from the JWT claim, same as `AdminGuard`.
   */
  async getOwnedProject(id: string, userId: string, access: TProjectAccess = 'owner'): Promise<Project> {
    const project = await this.projects.findOneBy({ id });
    if (project && (project.ownerId === userId || (access === 'read' && (await this.isAdmin(userId))))) {
      return project;
    }
    throw new NotFoundException(`Project "${id}" not found`);
  }

  /** `GET /projects/:id` — readable by the owner and (read-only) by an admin. */
  async getProjectInfo(id: string, userId: string): Promise<IProjectInfo> {
    const project = await this.getOwnedProject(id, userId, 'read');
    const owner = await this.users.findOne({
      select: { id: true, username: true, email: true },
      where: { id: project.ownerId },
    });
    return {
      id: project.id,
      name: project.name,
      ownerId: project.ownerId,
      createdAt: project.createdAt,
      owner: owner ? { id: owner.id, username: owner.username, email: owner.email } : null,
      readOnly: project.ownerId !== userId,
    };
  }

  private async isAdmin(userId: string): Promise<boolean> {
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
    const project = await this.getOwnedProject(id, ownerId);
    await this.projects.remove(project);
  }
}
