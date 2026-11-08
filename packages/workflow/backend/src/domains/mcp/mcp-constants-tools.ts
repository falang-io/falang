import { randomUUID } from 'node:crypto';
import { zod } from '@falang/dto';
import {
  applyConstantChanges,
  CONSTANT_TYPES,
  CONSTANTS_DOCUMENT_TYPE,
  describeConstantsForTool,
  LIST_CONSTANTS_DESCRIPTION,
  parseConstantChanges,
  readConstants,
  SET_CONSTANTS_DESCRIPTION,
} from '@falang/workflow-dto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentsService } from '../projects/documents/documents.service.js';
import { assertMcpProjectScope, type IMcpAuthContext } from './mcp-auth.js';
import { registerLooseTool } from './mcp-register-tool.js';
import { errorResult, okResult, withToolErrors } from './mcp-tool-result.js';

const valueSchema = zod.union([zod.string(), zod.number(), zod.boolean()]);

/**
 * `list_constants`/`set_constants` for the project's pinned `constants` document — the same operations and texts as
 * the in-app agent's `ConstantsToolProvider` (`@falang/workflow-dto`'s `constants-edit.ts`). Writes go through
 * `DocumentsService.update`, which validates the data again; no document lock (like the `integrations` document,
 * the Constants document is edited in a form, not a scheme).
 */
export const registerMcpConstantsTools = (
  server: McpServer,
  documentsService: DocumentsService,
  getAuth: () => IMcpAuthContext,
): void => {
  const findConstantsDocument = async (projectId: string, userId: string) => {
    const documents = await documentsService.listFull(projectId, userId);
    return documents.find((document) => document.type === CONSTANTS_DOCUMENT_TYPE) ?? null;
  };

  registerLooseTool(
    server,
    'list_constants',
    {
      description: LIST_CONSTANTS_DESCRIPTION,
      inputSchema: zod.object({ projectId: zod.string() }),
      annotations: { readOnlyHint: true },
    },
    withToolErrors(async (args: { projectId: string }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, args.projectId);
      const document = await findConstantsDocument(args.projectId, auth.user.id);
      return okResult(describeConstantsForTool(readConstants(document?.data ?? null)));
    }),
  );

  registerLooseTool(
    server,
    'set_constants',
    {
      description: SET_CONSTANTS_DESCRIPTION,
      inputSchema: zod.object({
        projectId: zod.string(),
        set: zod
          .array(
            zod.object({
              name: zod.string(),
              newName: zod.string().optional(),
              type: zod.enum(CONSTANT_TYPES).optional(),
              dev: valueSchema.optional(),
              prod: valueSchema.optional(),
            }),
          )
          .optional(),
        delete: zod.array(zod.string()).optional(),
      }),
    },
    withToolErrors(async (args: { projectId: string; set?: unknown; delete?: unknown }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, args.projectId);
      const document = await findConstantsDocument(args.projectId, auth.user.id);
      if (!document) return errorResult(`Project "${args.projectId}" has no constants document`);
      const { projectId: _projectId, ...changesInput } = args;
      const parsed = parseConstantChanges(changesInput);
      if (!parsed.ok) return errorResult(parsed.errors.join('; '));
      const applied = applyConstantChanges(readConstants(document.data ?? null), parsed.changes, randomUUID);
      if (!applied.ok) return errorResult(`Nothing changed: ${applied.errors.join('; ')}`);
      await documentsService.update(args.projectId, auth.user.id, document.id, { data: applied.data });
      return okResult(describeConstantsForTool(applied.data.constants));
    }),
  );
};
