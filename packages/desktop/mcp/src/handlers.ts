import { randomUUID } from 'node:crypto';
import { FUNCTION_LIKE_DOCUMENT_TYPES, isValidFunctionName, type INode, type IProjectDocument } from '@falang/dto';
import {
  acquireLock,
  applySetDocument,
  buildNodeKindsCatalog,
  describeNodeKinds,
  findActiveLock,
  getAllowedChildNames,
  releaseLock,
  validateDocument,
} from '@falang/mcp-core';
import {
  createDocument,
  createFolder,
  deleteDocument,
  getActiveLock,
  listTree,
  moveDocument,
  openProject,
  readDocument,
  readLocks,
  renameDocument,
  writeDocument,
  writeLocks,
} from '@falang/desktop-project-fs';
import { isArduinoPinnedDocument } from '@falang/desktop-arduino-dto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MCP_LOCK_OWNER } from './owner.js';
import { errorResult, jsonResult, messageOf } from './tool-results.js';
import type { IToolContext } from './tool-context.js';
import { ARDUINO_PROJECT_TYPE } from './arduino-project-type.js';

/**
 * One handler per tool in `@falang/mcp-core`'s `MCP_TOOLS`, wired onto `@falang/desktop-project-fs`
 * (see ADR 0029 (private), phase E). Every handler returns a `CallToolResult`
 * — never throws — so a bad call bounces back to the agent as a tool-result error without touching
 * the project (the same rule `0009`'s in-app agent loop already follows for its own tool calls).
 */

export const handleGetProject = async (ctx: IToolContext): Promise<CallToolResult> => {
  const manifest = await openProject(ctx.projectDir);
  return jsonResult({
    name: manifest.name,
    type: manifest.type,
    formatVersion: manifest.formatVersion,
    documentTypes: ctx.registry.getDocumentTypes(manifest.type),
  });
};

export const handleListDocuments = async (ctx: IToolContext): Promise<CallToolResult> => {
  const tree = await listTree(ctx.projectDir);
  const locks = await readLocks(ctx.projectDir);
  const now = Date.now();
  const documents = tree.documents.map((doc) => {
    const lock = getActiveLock(locks, doc.id, now);
    if (!lock) return doc;
    return { ...doc, lock: { expiresAt: lock.expiresAt, ownedByMe: lock.owner === MCP_LOCK_OWNER } };
  });
  return jsonResult({ folders: tree.folders, documents });
};

export const handleGetDocument = async (ctx: IToolContext, args: { documentId: string }): Promise<CallToolResult> => {
  try {
    const document = await readDocument(ctx.projectDir, args.documentId);
    return jsonResult(document);
  } catch (error) {
    return errorResult(`get_document: ${messageOf(error)}`);
  }
};

// oxlint-disable-next-line require-await -- kept async, with every other handler here, to match `TToolHandler`'s shared `Promise<CallToolResult>` signature in server.ts — this one just never needs to `await` anything.
export const handleGetNodeKinds = async (
  ctx: IToolContext,
  args: { documentType: string; parentName?: string },
): Promise<CallToolResult> => {
  const stack = ctx.registry.getStack(ctx.projectType, args.documentType);
  if (!stack) {
    return errorResult(
      `get_node_kinds: unknown document type "${args.documentType}" for project type "${ctx.projectType}"`,
    );
  }
  if (!args.parentName) return jsonResult(buildNodeKindsCatalog(stack));
  try {
    const childNames = getAllowedChildNames(args.parentName, stack);
    return jsonResult(describeNodeKinds(childNames, stack));
  } catch (error) {
    return errorResult(`get_node_kinds: ${messageOf(error)}`);
  }
};

/** `FUNCTION_LIKE_DOCUMENT_TYPES`' `name` is compiled verbatim into a real C++/TS identifier (see
 *  `@falang/logic-constructor`/app-arduino's own compiler) — checked here, at the two tool handlers an
 *  agent actually creates/renames a document through, rather than inside `@falang/desktop-project-fs`'s
 *  `createDocument`/`renameDocument` themselves: those are also the mechanism
 *  `@falang/desktop-project-converter` replays a legacy project's own, pre-existing (often PascalCase)
 *  function names through, and retroactively rejecting those would break real migrations. */
const invalidFunctionNameError = (toolName: string, type: string, name: string): string | null => {
  if (!FUNCTION_LIKE_DOCUMENT_TYPES.has(type) || isValidFunctionName(name)) return null;
  return (
    `${toolName}: name "${name}" is invalid — it must be an English, camelCase identifier ` +
    '(e.g. myFunctionName), with no spaces, punctuation, or non-Latin script'
  );
};

export const handleCreateDocument = async (
  ctx: IToolContext,
  args: { name: string; type: string; folderId?: string | null; root?: unknown },
): Promise<CallToolResult> => {
  const registration = ctx.registry.getRegistration(ctx.projectType, args.type);
  if (!registration) {
    return errorResult(`create_document: unknown document type "${args.type}" for project type "${ctx.projectType}"`);
  }
  const nameError = invalidFunctionNameError('create_document', args.type, args.name);
  if (nameError) return errorResult(nameError);
  const hasExplicitRoot = Object.hasOwn(args, 'root') && args.root !== null;
  const root = hasExplicitRoot ? args.root : ctx.registry.getDefaultRoot(ctx.projectType, args.type);
  if (!root) {
    return errorResult(`create_document: document type "${args.type}" has no default tree — pass "root" explicitly`);
  }
  const candidate: IProjectDocument = { id: randomUUID(), name: args.name, type: args.type, root: root as INode };
  const validation = validateDocument(ctx.projectType, candidate, ctx.registry);
  if (!validation.ok) return errorResult(`create_document: ${validation.error}`);
  try {
    await createDocument(ctx.projectDir, { document: validation.document, folderId: args.folderId ?? null });
    return jsonResult(validation.document);
  } catch (error) {
    return errorResult(`create_document: ${messageOf(error)}`);
  }
};

const tryReadDocument = async (
  projectDir: string,
  documentId: string,
): Promise<
  { readonly ok: true; readonly document: IProjectDocument } | { readonly ok: false; readonly error: string }
> => {
  try {
    return { document: await readDocument(projectDir, documentId), ok: true };
  } catch (error) {
    return { error: messageOf(error), ok: false };
  }
};

export const handleSetDocument = async (
  ctx: IToolContext,
  args: { documentId: string; root: unknown },
): Promise<CallToolResult> => {
  const read = await tryReadDocument(ctx.projectDir, args.documentId);
  if (!read.ok) return errorResult(`set_document: ${read.error}`);
  const locks = await readLocks(ctx.projectDir);
  const result = applySetDocument({
    now: Date.now(),
    oldDocument: read.document,
    owner: MCP_LOCK_OWNER,
    projectType: ctx.projectType,
    registry: ctx.registry,
    newRoot: args.root as INode,
    locks,
  });
  if (!result.ok) return errorResult(`set_document: ${result.error}`);
  await writeDocument(ctx.projectDir, result.document);
  await writeLocks(ctx.projectDir, result.locks);
  return jsonResult(result.document);
};

/**
 * Guards `rename_document`/`move_document`/`delete_document` against Arduino's pinned documents
 * (`setup`/`loop`/`Devices` — see ADR 0032 (private),
 * "Decision → 2") the same way `ArduinoProjectStore` guards its own UI-driven mutations, since an MCP
 * agent is the other writer of the same on-disk project and the pin rule has to hold regardless of
 * which one made the call. Reads the manifest tree fresh (not cached anywhere in this stateless
 * server) rather than trusting the caller's `args`. Returns `null` for a non-Arduino project, an
 * unknown document id (the underlying `project-fs` call below surfaces that "not found" itself), or
 * a document that isn't pinned.
 */
const findPinnedArduinoDocumentError = async (
  ctx: IToolContext,
  documentId: string,
  toolName: string,
  verb: 'renamed' | 'moved' | 'deleted',
): Promise<string | null> => {
  if (ctx.projectType !== ARDUINO_PROJECT_TYPE) return null;
  const tree = await listTree(ctx.projectDir);
  const entry = tree.documents.find((doc) => doc.id === documentId);
  if (!entry || !isArduinoPinnedDocument(entry)) return null;
  return `${toolName}: "${entry.name}" is a pinned document in an Arduino project and cannot be ${verb}`;
};

export const handleRenameDocument = async (
  ctx: IToolContext,
  args: { documentId: string; name: string },
): Promise<CallToolResult> => {
  const pinnedError = await findPinnedArduinoDocumentError(ctx, args.documentId, 'rename_document', 'renamed');
  if (pinnedError) return errorResult(pinnedError);
  const tree = await listTree(ctx.projectDir);
  const entry = tree.documents.find((doc) => doc.id === args.documentId);
  const nameError = entry && invalidFunctionNameError('rename_document', entry.type, args.name);
  if (nameError) return errorResult(nameError);
  try {
    await renameDocument(ctx.projectDir, args.documentId, args.name);
    return jsonResult({ documentId: args.documentId, name: args.name });
  } catch (error) {
    return errorResult(`rename_document: ${messageOf(error)}`);
  }
};

export const handleMoveDocument = async (
  ctx: IToolContext,
  args: { documentId: string; folderId: string | null },
): Promise<CallToolResult> => {
  const pinnedError = await findPinnedArduinoDocumentError(ctx, args.documentId, 'move_document', 'moved');
  if (pinnedError) return errorResult(pinnedError);
  try {
    await moveDocument(ctx.projectDir, args.documentId, args.folderId);
    return jsonResult({ documentId: args.documentId, folderId: args.folderId });
  } catch (error) {
    return errorResult(`move_document: ${messageOf(error)}`);
  }
};

export const handleDeleteDocument = async (
  ctx: IToolContext,
  args: { documentId: string },
): Promise<CallToolResult> => {
  const pinnedError = await findPinnedArduinoDocumentError(ctx, args.documentId, 'delete_document', 'deleted');
  if (pinnedError) return errorResult(pinnedError);
  const locks = await readLocks(ctx.projectDir);
  const active = getActiveLock(locks, args.documentId, Date.now());
  if (active && active.owner !== MCP_LOCK_OWNER) {
    return errorResult(`delete_document: locked by another session until ${active.expiresAt}`);
  }
  try {
    await deleteDocument(ctx.projectDir, args.documentId);
  } catch (error) {
    return errorResult(`delete_document: ${messageOf(error)}`);
  }
  if (active) {
    await writeLocks(
      ctx.projectDir,
      locks.filter((lock) => lock.documentId !== args.documentId),
    );
  }
  return jsonResult({ documentId: args.documentId, deleted: true });
};

export const handleCreateFolder = async (
  ctx: IToolContext,
  args: { name: string; parentId?: string | null },
): Promise<CallToolResult> => {
  try {
    const folder = await createFolder(ctx.projectDir, { name: args.name, parentId: args.parentId ?? null });
    return jsonResult(folder);
  } catch (error) {
    return errorResult(`create_folder: ${messageOf(error)}`);
  }
};

export const handleLockDocument = async (ctx: IToolContext, args: { documentId: string }): Promise<CallToolResult> => {
  const locks = await readLocks(ctx.projectDir);
  const result = acquireLock(locks, { documentId: args.documentId, now: Date.now(), owner: MCP_LOCK_OWNER });
  if (!result.ok) return errorResult(`lock_document: ${result.error}`);
  await writeLocks(ctx.projectDir, result.locks);
  const lock = findActiveLock(result.locks, args.documentId, Date.now());
  return jsonResult({ documentId: args.documentId, expiresAt: lock?.expiresAt });
};

export const handleUnlockDocument = async (
  ctx: IToolContext,
  args: { documentId: string },
): Promise<CallToolResult> => {
  const locks = await readLocks(ctx.projectDir);
  const result = releaseLock(locks, args.documentId, MCP_LOCK_OWNER);
  if (!result.ok) return errorResult(`unlock_document: ${result.error}`);
  await writeLocks(ctx.projectDir, result.locks);
  return jsonResult({ documentId: args.documentId, unlocked: true });
};
