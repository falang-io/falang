import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  FUNCTION_LIKE_DOCUMENT_TYPES,
  isValidFunctionName,
  type IProjectDocument,
  type IProjectTreeDocument,
} from '@falang/dto';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type IIntegrationsDocumentData,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { MoreThan, type Repository } from 'typeorm';
import { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { encodeIntegrationsDataForWrite, maskIntegrationsDataForRead } from '../../integrations/credentials-codec.js';
import { requireEncryptionKey } from '../../integrations/credentials-crypto.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { IntegrationVendorDataService } from '../../integrations/vendor-data/integration-vendor-data.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateDocumentDto } from './dto/create-document.dto.js';
import type { UpdateDocumentDto } from './dto/update-document.dto.js';
import { Document } from './document.entity.js';

/**
 * True when `value` is an explicit `null` or a real object/array — false only when the field was
 * genuinely omitted from the request body. Used instead of `Object.hasOwn(input, '<field>')` for
 * `UpdateDocumentDto`'s optional `root`/`data` fields: every declared optional class field becomes a
 * real own property (value `undefined`) on the instance `ValidationPipe`'s `class-transformer`
 * produces via `new UpdateDocumentDto()`, regardless of what the client actually sent (confirmed
 * empirically — this repo's `target: esnext` implies `useDefineForClassFields`), so `Object.hasOwn`
 * can't tell "omitted" from "present." A plain truthy check can't either, since `null` is this app's
 * legitimate "explicitly cleared" value for these fields. oxlint's `no-undefined`/`no-typeof-undefined`
 * rule out comparing against `undefined` directly in any form, so this checks the value's shape
 * instead — every real `root`/`data` payload in this app is object/array-shaped (`INode` or
 * `IDocumentCustomConfig`'s `data`), and `typeof null === 'object'` conveniently covers both
 * "present-and-null" and "present-and-an-object" in one check, while excluding "absent" (`typeof
 * undefined === 'undefined'`, the only value never reachable from real JSON input).
 */
const isObjectOrNull = (value: unknown): boolean => value === null || typeof value === 'object';

/** The `id`s of an `integrations` document's configured instances — used to diff old vs. new on `update` (see `IntegrationVendorDataService.removeForInstance`). */
const integrationInstanceIds = (data: IIntegrationsDocumentData | null): ReadonlySet<string> =>
  new Set((data?.instances ?? []).map((instance) => instance.id));

/** `function`/`trigger-function` documents compile `name` verbatim into a real TS function identifier
 *  (see `@falang/workflow-compiler`'s `compileFunction`/`compileTriggerFunction`) — every other type
 *  (`objects-structure`, the pinned `integrations` document, …) never reaches the compiler at all, so
 *  only `FUNCTION_LIKE_DOCUMENT_TYPES` (`@falang/dto`) is gated. The only chokepoint every write path
 *  (REST `PATCH`/`POST`, and both MCP tools in `domains/mcp/mcp-shared-tools.ts`, which call
 *  `create`/`update` directly and bypass the DTOs'/`ValidationPipe`'s class-validator rules entirely)
 *  is guaranteed to go through. */
const assertValidFunctionName = (type: string, name: string): void => {
  if (!FUNCTION_LIKE_DOCUMENT_TYPES.has(type)) return;
  if (!isValidFunctionName(name)) {
    throw new BadRequestException(
      `Function name "${name}" is invalid — it must be an English, camelCase identifier ` +
        '(e.g. myFunctionName), with no spaces, punctuation, or non-Latin script',
    );
  }
};

const toProjectDocument = (document: Document, integrations: readonly IWorkflowIntegration[]): IProjectDocument => {
  const result: IProjectDocument = { id: document.id, type: document.type, name: document.name };
  if (document.root !== null) result.root = document.root;
  if (document.data !== null) {
    result.data =
      document.type === INTEGRATIONS_DOCUMENT_TYPE
        ? maskIntegrationsDataForRead(document.data as IIntegrationsDocumentData, integrations)
        : document.data;
  }
  return result;
};

/** `GET .../documents/locks`' element shape, and the shape ADR 0029 (private)'s `IDocumentLock` describes for the future MCP host (phase F) to call `lockDocument`/`unlockDocument` with — defined locally rather than imported from `@falang/mcp-core` (which this phase deliberately doesn't depend on). */
export interface IDocumentLockInfo {
  readonly documentId: string;
  readonly owner: string;
  readonly expiresAt: string;
}

/** `IProjectTreeDocument` (`@falang/dto`) plus an optional `lockedUntil` — cheap to compute alongside `toTreeDocument`, so the tree listing shows lock state too, not just the dedicated `GET .../documents/locks` poll. */
export interface IProjectTreeDocumentWithLock extends IProjectTreeDocument {
  readonly lockedUntil?: string;
}

/** `lockExpiresAt` in the future — an expired lock is treated as absent everywhere, no sweeper needed (see ADR 0029 (private)'s "Document locks" decision). */
const isLockActive = (document: Document): boolean =>
  document.lockExpiresAt !== null && document.lockExpiresAt.getTime() > Date.now();

const toTreeDocument = (document: Document): IProjectTreeDocumentWithLock => ({
  id: document.id,
  type: document.type,
  name: document.name,
  folderId: document.folderId,
  pinned: document.pinned,
  ...(isLockActive(document) ? { lockedUntil: (document.lockExpiresAt as Date).toISOString() } : {}),
});

@Injectable()
export class DocumentsService {
  private readonly documents: Repository<Document>;
  private readonly projectsService: ProjectsService;
  private readonly config: ConfigService;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;
  private readonly vendorData: IntegrationVendorDataService;

  constructor(
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
    @Inject(IntegrationVendorDataService) vendorData: IntegrationVendorDataService,
  ) {
    this.documents = documents;
    this.projectsService = projectsService;
    this.config = config;
    this.activepiecesCatalog = activepiecesCatalog;
    this.vendorData = vendorData;
  }

  async listFull(projectId: string, ownerId: string): Promise<IProjectDocument[]> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const documents = await this.documents.find({ where: { projectId } });
    const integrations = await this.getIntegrationsList();
    return documents.map((document) => toProjectDocument(document, integrations));
  }

  async listTree(projectId: string, ownerId: string): Promise<IProjectTreeDocumentWithLock[]> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const documents = await this.documents.find({ where: { projectId } });
    return documents.map((document) => toTreeDocument(document));
  }

  async create(projectId: string, ownerId: string, input: CreateDocumentDto): Promise<IProjectDocument> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    assertValidFunctionName(input.type, input.name);
    const data =
      input.type === INTEGRATIONS_DOCUMENT_TYPE
        ? await this.encodeIncomingData(input.data, null)
        : (input.data ?? null);
    const document = this.documents.create({
      id: input.id,
      type: input.type,
      name: input.name,
      folderId: input.folderId ?? null,
      projectId,
      root: input.root ?? null,
      data,
    });
    const [saved, integrations] = await Promise.all([this.documents.save(document), this.getIntegrationsList()]);
    return toProjectDocument(saved, integrations);
  }

  /**
   * `lockOwner` is for the future MCP host (`lockDocument`/`set_document`'s auto-lock, phase F) to
   * pass its own session id through — the HTTP `PATCH` route never passes one, so a human edit on a
   * document an agent has locked always 409s (see `assertNotLockedByAnotherOwner`).
   */
  async update(
    projectId: string,
    ownerId: string,
    documentId: string,
    input: UpdateDocumentDto,
    lockOwner?: string,
  ): Promise<IProjectDocument> {
    const document = await this.getOwnedDocument(projectId, ownerId, documentId);
    this.assertNotLockedByAnotherOwner(document, lockOwner);
    const folderIdProvided = typeof input.folderId === 'string' || input.folderId === null;
    if (document.pinned && folderIdProvided) {
      throw new ForbiddenException(`Document "${documentId}" is pinned and cannot be moved`);
    }
    if (typeof input.name === 'string') {
      assertValidFunctionName(document.type, input.name);
      document.name = input.name;
    }
    if (folderIdProvided) document.folderId = input.folderId ?? null;
    if (isObjectOrNull(input.root)) document.root = input.root ?? null;
    let removedInstanceIds: readonly string[] = [];
    if (isObjectOrNull(input.data)) {
      if (document.type === INTEGRATIONS_DOCUMENT_TYPE) {
        const previousInstanceIds = integrationInstanceIds(document.data as IIntegrationsDocumentData | null);
        document.data = await this.encodeIncomingData(input.data, document.data as IIntegrationsDocumentData | null);
        const newInstanceIds = integrationInstanceIds(document.data as IIntegrationsDocumentData | null);
        removedInstanceIds = [...previousInstanceIds].filter((id) => !newInstanceIds.has(id));
      } else {
        document.data = input.data;
      }
    }
    const [saved, integrations] = await Promise.all([this.documents.save(document), this.getIntegrationsList()]);
    // Only after the document itself saved successfully — an instance dropped from the
    // `integrations` document leaves no orphaned `integration_vendor_data` rows behind (see
    // ADR 0039 (private) §4).
    await Promise.all(removedInstanceIds.map((instanceId) => this.vendorData.removeForInstance(projectId, instanceId)));
    return toProjectDocument(saved, integrations);
  }

  async delete(projectId: string, ownerId: string, documentId: string): Promise<void> {
    const document = await this.getOwnedDocument(projectId, ownerId, documentId);
    if (document.pinned) throw new ForbiddenException(`Document "${documentId}" is pinned and cannot be deleted`);
    this.assertNotLockedByAnotherOwner(document);
    // The `integrations` document is always `pinned` (see above) so this branch is currently
    // unreachable for it — kept anyway so a future relaxation of that rule doesn't silently leak
    // vendor data rows, same defensive posture as `removedInstanceIds` in `update`.
    const instanceIds =
      document.type === INTEGRATIONS_DOCUMENT_TYPE
        ? integrationInstanceIds(document.data as IIntegrationsDocumentData | null)
        : new Set<string>();
    await this.documents.remove(document);
    await Promise.all([...instanceIds].map((instanceId) => this.vendorData.removeForInstance(projectId, instanceId)));
  }

  /** Active locks only — see `IDocumentLockInfo`. Polled every 5s by the client while a project workspace is open. */
  async getLocks(projectId: string, ownerId: string): Promise<IDocumentLockInfo[]> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const documents = await this.documents.find({ where: { projectId, lockExpiresAt: MoreThan(new Date()) } });
    return documents
      .filter(
        (document): document is Document & { lockOwner: string; lockExpiresAt: Date } => document.lockOwner !== null,
      )
      .map((document) => ({
        documentId: document.id,
        owner: document.lockOwner,
        expiresAt: document.lockExpiresAt.toISOString(),
      }));
  }

  /**
   * Fails 409 if actively locked by a **different** owner; the same owner renews (extends
   * `lockExpiresAt` by `ttlMs` from now). Called directly by the future MCP host (phase F), never
   * over HTTP in phase C.
   */
  async lockDocument(
    projectId: string,
    ownerId: string,
    documentId: string,
    owner: string,
    ttlMs: number,
  ): Promise<IDocumentLockInfo> {
    const document = await this.getOwnedDocument(projectId, ownerId, documentId);
    this.assertNotLockedByAnotherOwner(document, owner);
    document.lockOwner = owner;
    document.lockExpiresAt = new Date(Date.now() + ttlMs);
    const saved = await this.documents.save(document);
    return { documentId: saved.id, owner, expiresAt: (saved.lockExpiresAt as Date).toISOString() };
  }

  /** No-op if not actively held; throws if held by a *different* owner. Called directly by the future MCP host (phase F), never over HTTP in phase C. */
  async unlockDocument(projectId: string, ownerId: string, documentId: string, owner: string): Promise<void> {
    const document = await this.getOwnedDocument(projectId, ownerId, documentId);
    if (!isLockActive(document)) return;
    if (document.lockOwner !== owner)
      throw new ForbiddenException(`Document "${documentId}" is locked by another session`);
    document.lockOwner = null;
    document.lockExpiresAt = null;
    await this.documents.save(document);
  }

  /** Shared by `update`/`delete`/`lockDocument` — an active lock blocks everyone except the owner that holds it (or, for `update`, whoever's `lockOwner` was explicitly passed in and matches). */
  private assertNotLockedByAnotherOwner(document: Document, callerOwner?: string): void {
    if (isLockActive(document) && document.lockOwner !== callerOwner) {
      throw new ConflictException({
        message: 'Document is locked by an agent',
        lockExpiresAt: (document.lockExpiresAt as Date).toISOString(),
      });
    }
  }

  /** Static + dynamically-fetched ActivePieces vendors combined — see `ActivepiecesCatalogService`. */
  private async getIntegrationsList(): Promise<readonly IWorkflowIntegration[]> {
    return [...REGISTERED_INTEGRATIONS, ...(await this.activepiecesCatalog.getDynamicIntegrations())];
  }

  /** Encrypts every `secret`-kind credential field before an `integrations` document is persisted — see `credentials-codec.ts`. */
  private async encodeIncomingData(
    incoming: unknown,
    previous: IIntegrationsDocumentData | null,
  ): Promise<IIntegrationsDocumentData | null> {
    if (!isObjectOrNull(incoming) || incoming === null) return null;
    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    const integrations = await this.getIntegrationsList();
    return encodeIntegrationsDataForWrite(incoming as IIntegrationsDocumentData, previous, integrations, encryptionKey);
  }

  private async getOwnedDocument(projectId: string, ownerId: string, documentId: string): Promise<Document> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const document = await this.documents.findOneBy({ id: documentId, projectId });
    if (!document) throw new NotFoundException(`Document "${documentId}" not found`);
    return document;
  }
}
