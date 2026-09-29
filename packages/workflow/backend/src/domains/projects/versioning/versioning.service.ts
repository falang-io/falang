// oxlint-disable max-lines -- ADR 0025 (private) package H added `autoVersionBeforeEdit`/`markEdited` on top of an already-large service; same precedent as `workflow-store.ts`/`desktop-project-store.ts`.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { INode } from '@falang/dto';
import {
  buildAutoVersionMessage,
  isSessionGap,
  isSnapshotDirty,
  type ICommitInfo,
  type IProjectSnapshot,
  type TCommitKind,
} from '@falang/versioning';
import { In, type Repository } from 'typeorm';
import { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { Document } from '../documents/document.entity.js';
import { DocumentsService } from '../documents/documents.service.js';
import { ProjectExportService } from '../export/project-export.service.js';
import { FoldersService } from '../folders/folders.service.js';
import { Project } from '../projects/project.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { User } from '../../users/users/user.entity.js';
import { blobContentOf, hashBlobContent } from './blob-content.js';
import { orderCommitsNewestFirst } from './commit-chain-order.js';
import { ProjectBlob } from './project-blob.entity.js';
import { ProjectCommit, type ICommitTree } from './project-commit.entity.js';
import { reconcileDocuments, reconcileFolders } from './restore-reconciliation.js';
import { exportPayloadToSnapshot, snapshotDocumentFromTreeEntry } from './snapshot-conversion.js';

/** DI token for the session-gap window (`AUTO_VERSION_GAP_MS` env var) — see `VersioningModule`. */
export const AUTO_VERSION_GAP_MS = Symbol('AUTO_VERSION_GAP_MS');

/**
 * The workflow product's `IVersionStore` (see ADR 0025 (private)) — commits
 * and content-addressed document blobs in Postgres, the `documents`/`folders` tables staying the
 * untouched working copy. Every public method takes an explicit `projectId`/`ownerId` (unlike
 * `IVersionStore`'s single-project-scoped interface, which a per-project client wrapper adapts this
 * to — see the ADR's package D) and authorizes through `ProjectsService.getOwnedProject`, the same
 * "don't leak existence to non-owners" rule every other service in this domain follows.
 */
@Injectable()
export class VersioningService {
  private readonly commits: Repository<ProjectCommit>;
  private readonly blobs: Repository<ProjectBlob>;
  private readonly documents: Repository<Document>;
  private readonly projects: Repository<Project>;
  private readonly users: Repository<User>;
  private readonly projectsService: ProjectsService;
  private readonly projectExportService: ProjectExportService;
  private readonly documentsService: DocumentsService;
  private readonly foldersService: FoldersService;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;
  private readonly autoVersionGapMs: number;

  constructor(
    @InjectRepository(ProjectCommit) commits: Repository<ProjectCommit>,
    @InjectRepository(ProjectBlob) blobs: Repository<ProjectBlob>,
    @InjectRepository(Document) documents: Repository<Document>,
    @InjectRepository(Project) projects: Repository<Project>,
    @InjectRepository(User) users: Repository<User>,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(ProjectExportService) projectExportService: ProjectExportService,
    @Inject(DocumentsService) documentsService: DocumentsService,
    @Inject(FoldersService) foldersService: FoldersService,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
    @Inject(AUTO_VERSION_GAP_MS) autoVersionGapMs: number,
  ) {
    this.commits = commits;
    this.blobs = blobs;
    this.documents = documents;
    this.projects = projects;
    this.users = users;
    this.projectsService = projectsService;
    this.projectExportService = projectExportService;
    this.documentsService = documentsService;
    this.foldersService = foldersService;
    this.activepiecesCatalog = activepiecesCatalog;
    this.autoVersionGapMs = autoVersionGapMs;
  }

  /**
   * The session-gap auto-version rule (ADR 0025 (private), "Correction to
   * decision 2 (2026-09-18)"): called by `SessionGapAutoVersionInterceptor` before a mutating
   * document/folder write is applied. When the project's previous edit was more than
   * `autoVersionGapMs` ago (or never recorded), commits the working copy *as it stands before* the
   * incoming write — i.e. the state the previous editing session ended in. Returns `null` when no
   * gap applies, or when the gap applies but the working copy is already clean against `HEAD` (the
   * user named/published at the end of the previous session — the same dirtiness check every commit
   * uses).
   */
  async autoVersionBeforeEdit(projectId: string, ownerId: string, now: Date = new Date()): Promise<ICommitInfo | null> {
    const project = await this.projectsService.getOwnedProject(projectId, ownerId);
    if (!isSessionGap(project.lastEditedAt, now, this.autoVersionGapMs)) return null;
    return this.commit(projectId, ownerId, { kind: 'auto', message: buildAutoVersionMessage(now) });
  }

  /** Records `now` as the project's last-edit time — called after a mutating write succeeds. */
  async markEdited(projectId: string, now: Date = new Date()): Promise<void> {
    await this.projects.update({ id: projectId }, { lastEditedAt: now });
  }

  /** Newest first — see `orderCommitsNewestFirst` for why this walks the `parentId` chain rather than sorting by `created_at`. */
  async listCommits(projectId: string, ownerId: string): Promise<ICommitInfo[]> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const commits = orderCommitsNewestFirst(await this.commits.find({ where: { projectId } }));
    if (commits.length === 0) return [];
    const usernameById = await this.resolveUsernames(commits.map((commit) => commit.authorId));
    return commits.map((commit) => this.toCommitInfo(commit, usernameById));
  }

  async getSnapshot(projectId: string, ownerId: string, commitId: string): Promise<IProjectSnapshot> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const commit = await this.getOwnedCommit(projectId, commitId);
    return this.buildSnapshotFromTree(projectId, commit.tree);
  }

  /** The working copy, through the same secret-stripping `ProjectExportService.exportProject` already applies to `GET /projects/:id/export`. */
  async getWorkingCopy(projectId: string, ownerId: string): Promise<IProjectSnapshot> {
    const payload = await this.projectExportService.exportProject(projectId, ownerId);
    return exportPayloadToSnapshot(payload);
  }

  /** Newest commit, or `null` for a project with no commits yet. */
  async headCommit(projectId: string, ownerId: string): Promise<ICommitInfo | null> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const head = await this.headCommitRow(projectId);
    if (!head) return null;
    const usernameById = await this.resolveUsernames([head.authorId]);
    return this.toCommitInfo(head, usernameById);
  }

  /**
   * Snapshots the working copy and commits it. Returns `null` (no new commit, no new blob rows)
   * when the tree diff against `HEAD` is empty — the same dirtiness check `@falang/versioning`'s
   * `isSnapshotDirty` gives every store.
   */
  async commit(
    projectId: string,
    ownerId: string,
    params: { kind: TCommitKind; message: string },
  ): Promise<ICommitInfo | null> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const [payload, head] = await Promise.all([
      this.projectExportService.exportProject(projectId, ownerId),
      this.headCommitRow(projectId),
    ]);
    const workingCopy = exportPayloadToSnapshot(payload);
    const headSnapshot = head ? await this.buildSnapshotFromTree(projectId, head.tree) : null;
    if (!isSnapshotDirty(headSnapshot, workingCopy)) return null;

    const savedCommit = await this.writeCommit(projectId, ownerId, head, workingCopy, params);
    const usernameById = await this.resolveUsernames([savedCommit.authorId]);
    return this.toCommitInfo(savedCommit, usernameById);
  }

  /** Promotes an `auto` commit to `named` (or renames a `named` one) — metadata only, history is never rewritten. */
  async nameCommit(projectId: string, ownerId: string, commitId: string, message: string): Promise<ICommitInfo> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const commit = await this.getOwnedCommit(projectId, commitId);
    commit.kind = 'named';
    commit.message = message;
    const saved = await this.commits.save(commit);
    const usernameById = await this.resolveUsernames([saved.authorId]);
    return this.toCommitInfo(saved, usernameById);
  }

  /**
   * Overwrites the working copy in place with `commitId`'s snapshot (same document/folder ids — see
   * `restore-reconciliation.ts`), then auto-creates the "Restore …" named commit that closes the
   * history entry (history is only ever appended to, never rewritten).
   */
  async restore(projectId: string, ownerId: string, commitId: string): Promise<ICommitInfo> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const commit = await this.getOwnedCommit(projectId, commitId);
    const snapshot = await this.buildSnapshotFromTree(projectId, commit.tree);

    const [currentFolders, currentDocuments, dynamicIntegrations] = await Promise.all([
      this.foldersService.listTree(projectId, ownerId),
      this.documents.find({ where: { projectId } }),
      this.activepiecesCatalog.getDynamicIntegrations(),
    ]);
    const integrations = [...REGISTERED_INTEGRATIONS, ...dynamicIntegrations];
    const restoreDeps = {
      documentsRepo: this.documents,
      documentsService: this.documentsService,
      foldersService: this.foldersService,
    };

    await reconcileFolders(restoreDeps, projectId, ownerId, snapshot.folders, currentFolders);
    await reconcileDocuments(restoreDeps, projectId, ownerId, snapshot, currentDocuments, integrations);

    const shortId = commit.id.slice(0, 8);
    const restored = await this.commit(projectId, ownerId, {
      kind: 'named',
      message: `Restore ${shortId}: ${commit.message}`,
    });
    // A restore is an edit that starts a new session (ADR 0025 (private),
    // "Correction to decision 2 (2026-09-18)") — `POST .../restore` itself isn't matched by
    // `SessionGapAutoVersionInterceptor` (it isn't a `documents`/`folders` route), so this is the
    // only place that records it.
    await this.markEdited(projectId);
    // `restored` is `null` only when reconciliation produced no tree change against the (still
    // current) `HEAD` — the one case that legitimately happens is restoring a commit that is
    // already `HEAD`, a no-op. `IVersionStore.restore` always returns a real `ICommitInfo`, so fall
    // back to the unchanged `HEAD` rather than surfacing `null`.
    if (restored) return restored;
    const head = await this.headCommit(projectId, ownerId);
    if (!head) throw new NotFoundException(`Project "${projectId}" has no commits after restore`);
    return head;
  }

  private async writeCommit(
    projectId: string,
    ownerId: string,
    head: ProjectCommit | null,
    workingCopy: IProjectSnapshot,
    params: { kind: TCommitKind; message: string },
  ): Promise<ProjectCommit> {
    const documentsWithHash = workingCopy.documents.map((document) => {
      const content = blobContentOf(document);
      return { document, hash: hashBlobContent(content), content };
    });
    const uniqueHashes = [...new Set(documentsWithHash.map((item) => item.hash))];
    // sqlite-compatible blob upsert: find which of this commit's blob hashes already exist for this
    // project, then only `insert()` the ones that don't — content-addressed by (project_id, hash),
    // so an existing row's content never needs to change. Avoids a driver-specific
    // `ON CONFLICT DO NOTHING`/`ON DUPLICATE KEY` clause, which better-sqlite3 (the test harness's
    // driver) and Postgres don't share the same syntax for.
    const existingBlobs =
      uniqueHashes.length === 0 ? [] : await this.blobs.find({ where: { projectId, hash: In(uniqueHashes) } });
    const existingHashes = new Set(existingBlobs.map((blob) => blob.hash));
    const newBlobsByHash = new Map<string, string>();
    for (const item of documentsWithHash) {
      if (!existingHashes.has(item.hash)) newBlobsByHash.set(item.hash, item.content);
    }

    const tree: ICommitTree = {
      folders: workingCopy.folders,
      documents: documentsWithHash.map(({ document, hash }) => ({
        id: document.id,
        type: document.type,
        name: document.name,
        folderId: document.folderId,
        pinned: document.pinned,
        blobHash: hash,
      })),
    };

    return this.commits.manager.transaction(async (manager) => {
      if (newBlobsByHash.size > 0) {
        await manager.insert(
          ProjectBlob,
          [...newBlobsByHash.entries()].map(([hash, content]) => ({ projectId, hash, content })),
        );
      }
      const commitRow = manager.create(ProjectCommit, {
        projectId,
        parentId: head?.id ?? null,
        authorId: ownerId,
        kind: params.kind,
        message: params.message,
        tree,
      });
      return manager.save(commitRow);
    });
  }

  /** See `orderCommitsNewestFirst` for why this walks the `parentId` chain rather than trusting `created_at` alone — used by `writeCommit` to set a new commit's `parentId`, so getting this wrong under a timestamp tie would fork the chain, not just misorder a list. */
  private async headCommitRow(projectId: string): Promise<ProjectCommit | null> {
    const commits = await this.commits.find({ where: { projectId } });
    return orderCommitsNewestFirst(commits)[0] ?? null;
  }

  private async getOwnedCommit(projectId: string, commitId: string): Promise<ProjectCommit> {
    const commit = await this.commits.findOneBy({ id: commitId, projectId });
    if (!commit) throw new NotFoundException(`Commit "${commitId}" not found in project "${projectId}"`);
    return commit;
  }

  private async buildSnapshotFromTree(projectId: string, tree: ICommitTree): Promise<IProjectSnapshot> {
    const hashes = [...new Set(tree.documents.map((entry) => entry.blobHash))];
    const blobs = hashes.length === 0 ? [] : await this.blobs.find({ where: { projectId, hash: In(hashes) } });
    const contentByHash = new Map(blobs.map((blob) => [blob.hash, blob.content]));

    const documents = tree.documents.map((entry) => {
      const content = contentByHash.get(entry.blobHash);
      if (!content) {
        throw new NotFoundException(
          `Blob "${entry.blobHash}" for document "${entry.id}" not found in project "${projectId}"`,
        );
      }
      return snapshotDocumentFromTreeEntry(entry, JSON.parse(content) as { root?: INode; data?: unknown });
    });

    return { folders: tree.folders, documents };
  }

  private async resolveUsernames(authorIds: readonly string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(authorIds)];
    if (uniqueIds.length === 0) return new Map();
    const authors = await this.users.find({ where: { id: In(uniqueIds) } });
    return new Map(authors.map((author) => [author.id, author.username]));
  }

  private toCommitInfo(commit: ProjectCommit, usernameById: Map<string, string>): ICommitInfo {
    return {
      id: commit.id,
      parentId: commit.parentId,
      kind: commit.kind,
      message: commit.message,
      author: usernameById.get(commit.authorId) ?? commit.authorId,
      createdAt: commit.createdAt.toISOString(),
    };
  }
}
