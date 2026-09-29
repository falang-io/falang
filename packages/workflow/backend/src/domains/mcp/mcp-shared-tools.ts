// oxlint-disable max-lines -- one file per registered tool set (mirrors `mcp-workflow-tools.ts`'s
// own cap-exceeding reason) keeps every tool's schema/annotations/handler together and readable;
// splitting further would only scatter one cohesive concern (`@falang/mcp-core`'s shared tool list,
// projectId-augmented) across files with no natural seam.
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { INode, IProjectDocument } from '@falang/dto';
import { zod } from '@falang/dto';
import {
  applySetDocument,
  buildNodeKindsCatalog,
  DEFAULT_LOCK_TTL_MS,
  describeNodeKinds,
  getAllowedChildNames,
  MCP_TOOLS,
  validateDocument,
  type DocumentStackRegistry,
  type IDocumentLock,
  type IMcpToolDefinition,
} from '@falang/mcp-core';
import type { DocumentsService, IDocumentLockInfo } from '../projects/documents/documents.service.js';
import type { FoldersService } from '../projects/folders/folders.service.js';
import { assertMcpProjectScope, type IMcpAuthContext } from './mcp-auth.js';
import { registerLooseTool } from './mcp-register-tool.js';
import { errorResult, okResult, withToolErrors } from './mcp-tool-result.js';

const PROJECT_TYPE = 'workflow';

export interface ISharedToolsDeps {
  readonly documentsService: DocumentsService;
  readonly foldersService: FoldersService;
  readonly registry: DocumentStackRegistry;
}

/** Every shared `@falang/mcp-core` tool, `projectId`-augmented — see this module's own doc comment in `mcp.service.ts`. */
const findTool = (name: string): IMcpToolDefinition => {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`@falang/mcp-core has no tool named "${name}"`);
  return tool;
};

/**
 * `@falang/mcp-core`'s shared tools are project-agnostic (the desktop stdio host is already scoped to
 * one project folder), but the workflow HTTP host is not — every project-scoped shared tool gets a
 * `projectId` argument layered onto its own `inputSchema`, per ADR 0029 (private)'s phase F brief ("the desktop host is per-project, the HTTP host is not").
 */
const withProjectId = (tool: IMcpToolDefinition): zod.ZodType => {
  const shape = (tool.inputSchema as zod.ZodObject).shape as Record<string, zod.ZodType>;
  return zod.object({ projectId: zod.string().describe('The project id (see list_projects).'), ...shape });
};

const toLockOwnerId = (auth: IMcpAuthContext): string => auth.owner;

const documentLocksById = async (
  documentsService: DocumentsService,
  projectId: string,
  ownerId: string,
): Promise<Map<string, IDocumentLockInfo>> => {
  const locks = await documentsService.getLocks(projectId, ownerId);
  return new Map(locks.map((lock) => [lock.documentId, lock]));
};

const getDocumentOrThrow = async (
  documentsService: DocumentsService,
  projectId: string,
  ownerId: string,
  documentId: string,
): Promise<IProjectDocument> => {
  const documents = await documentsService.listFull(projectId, ownerId);
  const document = documents.find((candidate) => candidate.id === documentId);
  if (!document) throw new Error(`Document "${documentId}" not found in project "${projectId}"`);
  return document;
};

/** Registers every shared `@falang/mcp-core` tool (`projectId`-augmented) against the workflow backend's own services. */
export const registerSharedMcpTools = (
  server: McpServer,
  deps: ISharedToolsDeps,
  getAuth: () => IMcpAuthContext,
): void => {
  const { documentsService, foldersService, registry } = deps;

  registerLooseTool(
    server,
    'get_project',
    {
      description: findTool('get_project').description,
      inputSchema: withProjectId(findTool('get_project')),
      annotations: findTool('get_project').annotations,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      // `getOwnedProject` isn't exported by `ProjectsService` in a form this file depends on directly
      // (avoiding a second injected service for one field) — `listFull` already 404s for an unowned
      // project and every document carries its own `type`, so the project's name/type-ness is read
      // off the folders/documents listing instead.
      const documents = await documentsService.listFull(projectId, auth.user.id);
      const documentTypes = registry.getDocumentTypes(PROJECT_TYPE);
      return okResult({ projectType: PROJECT_TYPE, documentTypes, documentCount: documents.length });
    }),
  );

  registerLooseTool(
    server,
    'list_documents',
    {
      description: findTool('list_documents').description,
      inputSchema: withProjectId(findTool('list_documents')),
      annotations: findTool('list_documents').annotations,
    },
    withToolErrors(async ({ projectId }: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      const ownerId = auth.user.id;
      const [folders, documents, locksById] = await Promise.all([
        foldersService.listTree(projectId, ownerId),
        documentsService.listTree(projectId, ownerId),
        documentLocksById(documentsService, projectId, ownerId),
      ]);
      const documentsWithLock = documents.map((document) => {
        const lock = locksById.get(document.id);
        const summary: {
          id: string;
          type: string;
          name: string;
          folderId: string | null;
          lock?: { expiresAt: string; ownedByMe: boolean };
        } = { id: document.id, type: document.type, name: document.name, folderId: document.folderId };
        if (lock) summary.lock = { expiresAt: lock.expiresAt, ownedByMe: lock.owner === toLockOwnerId(auth) };
        return summary;
      });
      return okResult({ folders, documents: documentsWithLock });
    }),
  );

  registerLooseTool(
    server,
    'get_document',
    {
      description: findTool('get_document').description,
      inputSchema: withProjectId(findTool('get_document')),
      annotations: findTool('get_document').annotations,
    },
    withToolErrors(async ({ projectId, documentId }: { projectId: string; documentId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      const document = await getDocumentOrThrow(documentsService, projectId, auth.user.id, documentId);
      return okResult(document);
    }),
  );

  registerLooseTool(
    server,
    'get_node_kinds',
    {
      description: findTool('get_node_kinds').description,
      inputSchema: withProjectId(findTool('get_node_kinds')),
      annotations: findTool('get_node_kinds').annotations,
    },
    withToolErrors(
      ({ projectId, documentType, parentName }: { projectId: string; documentType: string; parentName?: string }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        const stack = registry.getStack(PROJECT_TYPE, documentType);
        if (!stack) return errorResult(`Unknown document type "${documentType}" for project type "${PROJECT_TYPE}"`);
        if (parentName) {
          const allowed = getAllowedChildNames(parentName, stack);
          return okResult(describeNodeKinds(allowed, stack));
        }
        return okResult(buildNodeKindsCatalog(stack));
      },
    ),
  );

  registerLooseTool(
    server,
    'create_document',
    {
      description: findTool('create_document').description,
      inputSchema: withProjectId(findTool('create_document')),
      annotations: findTool('create_document').annotations,
    },
    withToolErrors(
      async (args: { projectId: string; name: string; type: string; folderId?: string | null; root?: unknown }) => {
        const { projectId, name, type, folderId } = args;
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);

        // `Object.hasOwn` (not `args.root === undefined`) so an explicitly-passed `root: null` is
        // still treated as "the caller supplied a root" (and fails validation on its own terms)
        // rather than silently falling back to the document type's default tree.
        if (!Object.hasOwn(args, 'root')) {
          const defaultRoot = registry.getDefaultRoot(PROJECT_TYPE, type);
          if (!defaultRoot) return errorResult(`Unknown document type "${type}" for project type "${PROJECT_TYPE}"`);
          const created = await documentsService.create(projectId, auth.user.id, {
            id: randomUUID(),
            type,
            name,
            folderId: folderId ?? null,
            root: defaultRoot,
          });
          return okResult(created);
        }

        const validation = validateDocument(
          PROJECT_TYPE,
          { id: 'candidate', type, name, root: args.root as INode },
          registry,
        );
        if (!validation.ok) return errorResult(validation.error);
        const created = await documentsService.create(projectId, auth.user.id, {
          id: randomUUID(),
          type,
          name,
          folderId: folderId ?? null,
          root: validation.document.root ?? null,
        });
        return okResult(created);
      },
    ),
  );

  registerLooseTool(
    server,
    'set_document',
    {
      description: findTool('set_document').description,
      inputSchema: withProjectId(findTool('set_document')),
      annotations: findTool('set_document').annotations,
    },
    withToolErrors(
      async ({ projectId, documentId, root }: { projectId: string; documentId: string; root: unknown }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        const ownerId = auth.user.id;
        const owner = toLockOwnerId(auth);

        const oldDocument = await getDocumentOrThrow(documentsService, projectId, ownerId, documentId);
        const locksById = await documentLocksById(documentsService, projectId, ownerId);
        const locks: readonly IDocumentLock[] = [...locksById.values()].map((lock) => ({
          documentId: lock.documentId,
          owner: lock.owner,
          acquiredAt: lock.expiresAt,
          expiresAt: lock.expiresAt,
        }));

        const result = applySetDocument({
          projectType: PROJECT_TYPE,
          oldDocument,
          newRoot: root as INode,
          locks,
          owner,
          now: Date.now(),
          ttlMs: DEFAULT_LOCK_TTL_MS,
          registry,
        });
        if (!result.ok) return errorResult(result.error);

        // `applySetDocument` only computes the outcome — the DB-backed lock (two columns on
        // `documents`, see `DocumentsService`) and the row itself are persisted here, in that order,
        // so a lock conflict that only shows up now (a race since the `locks` snapshot above) is
        // caught by `lockDocument` itself before the tree is ever written — see ADR 0029 (private)'s "`set_document` is the only write path".
        await documentsService.lockDocument(projectId, ownerId, documentId, owner, DEFAULT_LOCK_TTL_MS);
        const saved = await documentsService.update(
          projectId,
          ownerId,
          documentId,
          { root: result.document.root },
          owner,
        );
        return okResult(saved);
      },
    ),
  );

  registerLooseTool(
    server,
    'rename_document',
    {
      description: findTool('rename_document').description,
      inputSchema: withProjectId(findTool('rename_document')),
      annotations: findTool('rename_document').annotations,
    },
    withToolErrors(async ({ projectId, documentId, name }: { projectId: string; documentId: string; name: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      const saved = await documentsService.update(projectId, auth.user.id, documentId, { name });
      return okResult(saved);
    }),
  );

  registerLooseTool(
    server,
    'move_document',
    {
      description: findTool('move_document').description,
      inputSchema: withProjectId(findTool('move_document')),
      annotations: findTool('move_document').annotations,
    },
    withToolErrors(
      async ({
        projectId,
        documentId,
        folderId,
      }: {
        projectId: string;
        documentId: string;
        folderId: string | null;
      }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        const saved = await documentsService.update(projectId, auth.user.id, documentId, { folderId });
        return okResult(saved);
      },
    ),
  );

  registerLooseTool(
    server,
    'delete_document',
    {
      description: findTool('delete_document').description,
      inputSchema: withProjectId(findTool('delete_document')),
      annotations: findTool('delete_document').annotations,
    },
    withToolErrors(async ({ projectId, documentId }: { projectId: string; documentId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      await documentsService.delete(projectId, auth.user.id, documentId);
      return okResult({ deleted: true });
    }),
  );

  registerLooseTool(
    server,
    'create_folder',
    {
      description: findTool('create_folder').description,
      inputSchema: withProjectId(findTool('create_folder')),
      annotations: findTool('create_folder').annotations,
    },
    withToolErrors(
      async ({ projectId, name, parentId }: { projectId: string; name: string; parentId?: string | null }) => {
        const auth = getAuth();
        assertMcpProjectScope(auth, projectId);
        const folder = await foldersService.create(projectId, auth.user.id, {
          id: randomUUID(),
          name,
          parentId: parentId ?? null,
        });
        return okResult(folder);
      },
    ),
  );

  registerLooseTool(
    server,
    'lock_document',
    {
      description: findTool('lock_document').description,
      inputSchema: withProjectId(findTool('lock_document')),
      annotations: findTool('lock_document').annotations,
    },
    withToolErrors(async ({ projectId, documentId }: { projectId: string; documentId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      const lock = await documentsService.lockDocument(
        projectId,
        auth.user.id,
        documentId,
        toLockOwnerId(auth),
        DEFAULT_LOCK_TTL_MS,
      );
      return okResult(lock);
    }),
  );

  registerLooseTool(
    server,
    'unlock_document',
    {
      description: findTool('unlock_document').description,
      inputSchema: withProjectId(findTool('unlock_document')),
      annotations: findTool('unlock_document').annotations,
    },
    withToolErrors(async ({ projectId, documentId }: { projectId: string; documentId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, projectId);
      await documentsService.unlockDocument(projectId, auth.user.id, documentId, toLockOwnerId(auth));
      return okResult({ unlocked: true });
    }),
  );
};
