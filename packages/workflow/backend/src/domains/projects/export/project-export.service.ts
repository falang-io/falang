import { randomUUID } from 'node:crypto';
import type { IProjectTreeFolder } from '@falang/dto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import { normalizeWorkflowProjectLayout } from '@falang/workflow-dto';
import type { Repository } from 'typeorm';
import { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { stripIntegrationsSecretsForExport } from '../../integrations/credentials-codec.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { Document } from '../documents/document.entity.js';
import { DocumentsService } from '../documents/documents.service.js';
import { FoldersService } from '../folders/folders.service.js';
import type { Project } from '../projects/project.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { ImportProjectDocumentDto } from './dto/import-project-document.dto.js';
import type { ImportProjectDto } from './dto/import-project.dto.js';

export interface IProjectExportFolder {
  id: string;
  name: string;
  parentId: string | null;
  /** Fixed section kind (`'triggers' | 'functions' | 'types'`), absent/`null` on user folders and in files exported before ADR 0055 (private). */
  fixedKind?: string | null;
}

export interface IProjectExportDocument {
  id: string;
  type: string;
  name: string;
  folderId: string | null;
  pinned: boolean;
  root: unknown;
  data: unknown;
}

export interface IProjectExportPayload {
  formatVersion: 1;
  project: { id: string; name: string };
  folders: IProjectExportFolder[];
  documents: IProjectExportDocument[];
}

@Injectable()
export class ProjectExportService {
  private readonly documents: Repository<Document>;
  private readonly projectsService: ProjectsService;
  private readonly foldersService: FoldersService;
  private readonly documentsService: DocumentsService;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;

  constructor(
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(FoldersService) foldersService: FoldersService,
    @Inject(DocumentsService) documentsService: DocumentsService,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
  ) {
    this.documents = documents;
    this.projectsService = projectsService;
    this.foldersService = foldersService;
    this.documentsService = documentsService;
    this.activepiecesCatalog = activepiecesCatalog;
  }

  /**
   * Everything a project owns, minted with a blank `project.id` (a real id is only assigned on
   * import — see `importProject`) and every integration credential's `secret`-kind fields blanked
   * out via `stripIntegrationsSecretsForExport`, never the real (encrypted) stored value.
   */
  async exportProject(projectId: string, ownerId: string): Promise<IProjectExportPayload> {
    const project = await this.projectsService.getOwnedProject(projectId, ownerId);
    const [folders, documents, dynamicIntegrations] = await Promise.all([
      this.foldersService.listTree(projectId, ownerId),
      this.documents.find({ where: { projectId } }),
      this.activepiecesCatalog.getDynamicIntegrations(),
    ]);
    const integrations = [...REGISTERED_INTEGRATIONS, ...dynamicIntegrations];

    return {
      formatVersion: 1,
      project: { id: '', name: project.name },
      folders: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        fixedKind: folder.fixedKind ?? null,
      })),
      documents: documents.map((document) => ({
        id: document.id,
        type: document.type,
        name: document.name,
        folderId: document.folderId,
        pinned: document.pinned,
        root: document.root,
        data:
          document.type === INTEGRATIONS_DOCUMENT_TYPE && document.data !== null
            ? stripIntegrationsSecretsForExport(document.data as IIntegrationsDocumentData, integrations)
            : document.data,
      })),
    };
  }

  /**
   * Creates a brand-new project (fresh, DB-generated `id` — see `ProjectsService.create`) and
   * replays the imported folders/documents into it under fresh ids, so re-importing the same file
   * (or the same file twice) never collides with a previous import or the original project. The
   * pinned `integrations` document is special-cased: every new project already seeds one (empty),
   * so the imported one is merged into it via an update rather than creating a second pinned
   * document.
   */
  async importProject(ownerId: string, payload: ImportProjectDto): Promise<Project> {
    const project = await this.projectsService.create(ownerId, payload.project.name);
    // The new project already seeded its own section folders (`ProjectsService.create`); the payload is
    // normalised to the fixed layout first, then its section folders are mapped onto the seeded ones
    // (the same "merge into the seeded singleton" path as `Integrations` below).
    const normalized = normalizeWorkflowProjectLayout(
      payload.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId ?? null,
        fixedKind: folder.fixedKind ?? null,
      })),
      payload.documents.map((document) => ({
        id: document.id,
        type: document.type,
        folderId: document.folderId ?? null,
        pinned: document.pinned ?? false,
        source: document,
      })),
      { createId: () => randomUUID() },
    );
    const seededFolders = await this.foldersService.listTree(project.id, ownerId);
    const seededSections = seededFolders.filter((folder) => Boolean(folder.fixedKind));
    const folderIdMap = await this.createFolders(project.id, ownerId, normalized.folders, seededSections);

    const normalizedDocuments: ImportProjectDocumentDto[] = [];
    for (const document of normalized.documents) {
      normalizedDocuments.push({ ...document.source, folderId: document.folderId });
    }
    const integrationsPayload = normalizedDocuments.find((document) => document.type === INTEGRATIONS_DOCUMENT_TYPE);
    if (integrationsPayload?.data) {
      const integrationsDocument = await this.documents.findOne({
        where: { projectId: project.id, type: INTEGRATIONS_DOCUMENT_TYPE },
      });
      if (integrationsDocument) {
        await this.documentsService.update(project.id, ownerId, integrationsDocument.id, {
          data: integrationsPayload.data,
        });
      }
    }

    // Any other pinned singleton is skipped: the freshly created project already seeded its own,
    // and there is currently no update path for a pinned document kind other than `integrations`.
    // Every remaining document is independent of its siblings, so all creates run in parallel.
    const regularDocuments = normalizedDocuments.filter(
      (document) => document.type !== INTEGRATIONS_DOCUMENT_TYPE && !document.pinned,
    );
    await Promise.all(
      regularDocuments.map((document) => {
        const folderId = document.folderId ? (folderIdMap.get(document.folderId) ?? null) : null;
        return this.documentsService.create(project.id, ownerId, {
          id: randomUUID(),
          type: document.type,
          name: document.name,
          folderId,
          root: document.root ?? null,
          data: document.data ?? null,
        });
      }),
    );

    return project;
  }

  /**
   * Folders form a self-referential tree (`parentId` FK'd to another folder's `id`), so a parent
   * must be inserted before its children. Repeatedly resolves the next "level" — every folder whose
   * parent has already been placed (or is root-level) — and creates that whole level in parallel
   * (siblings don't depend on each other), minting a fresh id for each and remapping `parentId`
   * through the map built so far, until every folder is placed or none can make progress
   * (malformed/cyclic input).
   */
  private async createFolders(
    projectId: string,
    ownerId: string,
    folders: readonly IProjectExportFolder[],
    seededSections: readonly IProjectTreeFolder[],
  ): Promise<Map<string, string>> {
    const idMap = new Map<string, string>();
    for (const folder of folders) {
      const seeded = folder.fixedKind ? seededSections.find((section) => section.fixedKind === folder.fixedKind) : null;
      if (seeded) idMap.set(folder.id, seeded.id);
    }
    let remaining = folders.filter((folder) => !idMap.has(folder.id));

    while (remaining.length > 0) {
      const resolvable = remaining.filter((folder) => !folder.parentId || idMap.has(folder.parentId));
      if (resolvable.length === 0) {
        throw new BadRequestException('Import file has folders with an unresolvable or cyclic parentId');
      }
      const batch = resolvable.map((folder) => ({
        folder,
        newId: randomUUID(),
        parentId: folder.parentId ? (idMap.get(folder.parentId) ?? null) : null,
      }));
      for (const { folder, newId } of batch) idMap.set(folder.id, newId);

      // Levels are inherently sequential (a parent row must exist before its children can be
      // inserted); within a level, every folder is created in parallel via `Promise.all` above.
      // oxlint-disable-next-line no-await-in-loop
      await Promise.all(
        batch.map(({ newId, parentId, folder }) =>
          this.foldersService.create(projectId, ownerId, { id: newId, name: folder.name, parentId }),
        ),
      );

      const resolvedIds = new Set(resolvable.map((folder) => folder.id));
      remaining = remaining.filter((folder) => !resolvedIds.has(folder.id));
    }

    return idMap;
  }
}
