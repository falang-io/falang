import { randomUUID } from 'node:crypto';
import { zod } from '@falang/dto';
import { DEFAULT_LOCK_TTL_MS } from '@falang/mcp-core';
import {
  buildTableFields,
  normalizeTableDocumentData,
  TABLE_DOCUMENT_TYPE,
  TABLE_FIELD_TYPES,
} from '@falang/workflow-dto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentsService } from '../projects/documents/documents.service.js';
import { assertMcpProjectScope, type IMcpAuthContext } from './mcp-auth.js';
import { registerLooseTool } from './mcp-register-tool.js';
import { errorResult, okResult, withToolErrors } from './mcp-tool-result.js';

const fieldsSchema = zod
  .array(
    zod.object({
      id: zod.string().optional(),
      name: zod.string(),
      type: zod.enum(TABLE_FIELD_TYPES),
      required: zod.boolean().optional(),
      options: zod.array(zod.string()).optional(),
      description: zod.string().optional(),
    }),
  )
  .describe(
    'The complete field list. Keep "id" for a field that already exists (a rename/retype of the same column, its ' +
      'data survives); omit it for a new field — it gets the next free id.',
  );

/**
 * `create_table`/`set_table_fields` (ADR 0075 (private)): a `table` document has no node tree, so the shared
 * `create_document`/`set_document` can't write it. Both go through `DocumentsService` — project scope, the
 * `maxTablesPerProject`/`maxTableFields` limits, name uniqueness and field validation are enforced there — and
 * `set_table_fields` takes the same agent-held document lock `set_document` does. Records are not an MCP concern.
 */
export const registerMcpTableTools = (
  server: McpServer,
  documentsService: DocumentsService,
  getAuth: () => IMcpAuthContext,
): void => {
  registerLooseTool(
    server,
    'create_table',
    {
      description:
        'Creates a project table (a built-in record store) with the given fields. The name is the table name ' +
        '(unique among all documents, case-insensitively). Only the columns are defined here — records are filled ' +
        'in the grid and by the table-* workflow nodes, whose `table` field takes the returned document id. ' +
        'Field names: letters/digits/_ (Unicode letters allowed), not id/version/createdAt/updatedAt/and/or.',
      inputSchema: zod.object({
        projectId: zod.string(),
        name: zod.string(),
        fields: fieldsSchema,
        folderId: zod.string().nullable().optional(),
      }),
    },
    withToolErrors(async (args: { projectId: string; name: string; fields: unknown; folderId?: string | null }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, args.projectId);
      const built = buildTableFields(null, args.fields);
      if (!built.ok) return errorResult(built.error);
      const created = await documentsService.create(args.projectId, auth.user.id, {
        id: randomUUID(),
        type: TABLE_DOCUMENT_TYPE,
        name: args.name,
        folderId: args.folderId ?? null,
        data: built.data,
      });
      return okResult(created);
    }),
  );

  registerLooseTool(
    server,
    'set_table_fields',
    {
      description:
        "Replaces a table's whole field list (full replacement: a field you leave out is deleted together with its " +
        'data). Keep each existing field\'s "id" (get_document shows them) so its data survives a rename/retype; ' +
        'fields without an "id" are new. Takes the same agent-held document lock as set_document.',
      inputSchema: zod.object({ projectId: zod.string(), documentId: zod.string(), fields: fieldsSchema }),
    },
    withToolErrors(async (args: { projectId: string; documentId: string; fields: unknown }) => {
      const auth = getAuth();
      assertMcpProjectScope(auth, args.projectId);
      const documents = await documentsService.listFull(args.projectId, auth.user.id);
      const document = documents.find((candidate) => candidate.id === args.documentId);
      if (!document) return errorResult(`Document "${args.documentId}" not found in project "${args.projectId}"`);
      if (document.type !== TABLE_DOCUMENT_TYPE) {
        return errorResult(`Document "${args.documentId}" is a "${document.type}" document, not a table`);
      }
      const previous = normalizeTableDocumentData(null, document.data);
      const built = buildTableFields(previous.ok ? previous.data : null, args.fields);
      if (!built.ok) return errorResult(built.error);
      await documentsService.lockDocument(
        args.projectId,
        auth.user.id,
        args.documentId,
        auth.owner,
        DEFAULT_LOCK_TTL_MS,
      );
      const saved = await documentsService.update(
        args.projectId,
        auth.user.id,
        args.documentId,
        { data: built.data },
        auth.owner,
      );
      return okResult(saved);
    }),
  );
};
