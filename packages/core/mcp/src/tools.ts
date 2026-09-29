import { zod } from '@falang/dto';

export interface IMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
}

export interface IMcpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: zod.ZodType;
  readonly annotations?: IMcpToolAnnotations;
}

const nodeIdOrNull = zod.string().nullable();

/**
 * The shared v1 tool list from ADR 0029 (private)'s "Final v1 tool list"
 * table — every host (the desktop stdio server, the workflow HTTP endpoint) serves these under the
 * same names/shapes so a skill written against one works against both. Deliberately excludes
 * `finish` (`@falang/agent`'s own in-app loop control, not a document-editing action) and every
 * node-level tool `@falang/agent` has (`insert_node`/`set_data`/…) — v1 here is `set_document`-only,
 * see the ADR's "Decisions after discussion".
 */
export const MCP_TOOLS: readonly IMcpToolDefinition[] = [
  {
    annotations: { readOnlyHint: true },
    description:
      "Read-only. Returns the current project's name, type, and the document types that project type allows.",
    inputSchema: zod.object({}),
    name: 'get_project',
  },
  {
    annotations: { readOnlyHint: true },
    description:
      'Read-only. Lists every document and folder in the project (id, name, type, folderId, and — for ' +
      'documents — current lock state). Call this to find a documentId before get_document/set_document.',
    inputSchema: zod.object({}),
    name: 'list_documents',
  },
  {
    annotations: { readOnlyHint: true },
    description: 'Read-only. Returns the full document (id, name, type, root tree) for documentId.',
    inputSchema: zod.object({ documentId: zod.string() }),
    name: 'get_document',
  },
  {
    annotations: { readOnlyHint: true },
    description:
      'Read-only. Returns `{ nodeKinds, $defs? }`: the node kinds documentType allows, each with its exact ' +
      '`data` JSON Schema and allowed-children shape, plus the named definitions those schemas share (e.g. ' +
      '`VariableType`), referenced as `#/$defs/<id>` and listed once in `$defs`. Call this before composing ' +
      'a tree for create_document/set_document if you are not sure which node kinds or data shapes are ' +
      "valid — pass parentName to narrow to one kind's allowed children, or omit it for the whole catalog.",
    inputSchema: zod.object({ documentType: zod.string(), parentName: zod.string().optional() }),
    name: 'get_node_kinds',
  },
  {
    description:
      'Creates a new document of the given type. root is optional — call get_node_kinds first if you intend ' +
      "to pass one; when omitted, the document type's own default (blank) tree is used, ready for a follow-up " +
      'set_document. A passed root is validated the same way set_document validates one (see its own ' +
      'description for the first-child/out rule).',
    inputSchema: zod.object({
      folderId: zod.string().nullable().optional(),
      name: zod.string(),
      root: zod.unknown().optional(),
      type: zod.string(),
    }),
    name: 'create_document',
  },
  {
    annotations: { idempotentHint: true },
    description:
      "Replaces documentId's entire tree with root and validates it against its document type's node kinds " +
      "(call get_node_kinds first if unsure). Auto-acquires the document's edit lock for this session — call " +
      'unlock_document when done so a human editor is not blocked. Every node in root whose id also existed in ' +
      "the previous tree keeps that node's old layout meta unless root itself sets meta for it. An invalid " +
      'root or a lock held by another session is rejected without changing the document. One structural rule ' +
      'validation enforces on every node in root: the first child (index 0) of ANY parent is drawn continuing ' +
      'straight down as the main path and can never itself carry an out (break/continue/return/throw) — move ' +
      'the branch that needs the jump to a later position instead (for `if`, swap the two branches and flip ' +
      '`meta.trueOnRight`, which keeps the exact same semantics). Appending the out-type node as a plain last ' +
      'child compiles the same, but the editor only draws the jump line for a real `out`.',
    inputSchema: zod.object({ documentId: zod.string(), root: zod.unknown() }),
    name: 'set_document',
  },
  {
    description: 'Renames a document. Does not touch its tree or folder.',
    inputSchema: zod.object({ documentId: zod.string(), name: zod.string() }),
    name: 'rename_document',
  },
  {
    description: 'Moves a document into a different folder (folderId: null moves it to the project root).',
    inputSchema: zod.object({ documentId: zod.string(), folderId: nodeIdOrNull }),
    name: 'move_document',
  },
  {
    annotations: { destructiveHint: true },
    description: 'Permanently deletes a document.',
    inputSchema: zod.object({ documentId: zod.string() }),
    name: 'delete_document',
  },
  {
    description: 'Creates a new, empty folder.',
    inputSchema: zod.object({ name: zod.string(), parentId: zod.string().nullable().optional() }),
    name: 'create_folder',
  },
  {
    description:
      'Acquires (or renews, if already held by this session) the edit lock on documentId — call before a run ' +
      'of set_document calls you intend to make in sequence, and unlock_document once done. set_document ' +
      'auto-acquires on its own, so this is only needed to hold the lock across several calls or to reserve it ' +
      'ahead of a read-modify-write.',
    inputSchema: zod.object({ documentId: zod.string() }),
    name: 'lock_document',
  },
  {
    description: "Releases this session's edit lock on documentId, if held. A no-op if it is not locked.",
    inputSchema: zod.object({ documentId: zod.string() }),
    name: 'unlock_document',
  },
];

/** JSON-Schema form of every tool's `inputSchema`, for hosts (or transports) with no zod of their own. */
export const getMcpToolJsonSchema = (tool: IMcpToolDefinition): Record<string, unknown> =>
  zod.toJSONSchema(tool.inputSchema) as Record<string, unknown>;

export const MCP_TOOL_JSON_SCHEMAS: Readonly<Record<string, Record<string, unknown>>> = Object.fromEntries(
  MCP_TOOLS.map((tool) => [tool.name, getMcpToolJsonSchema(tool)]),
);
