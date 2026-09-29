import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createDefaultDocumentStackRegistry, MCP_TOOLS, type IMcpToolDefinition } from '@falang/mcp-core';
import { openProject } from '@falang/desktop-project-fs';
import { ARDUINO_PROJECT_TYPE, registerArduinoProjectType } from './arduino-project-type.js';
import type { IToolContext } from './tool-context.js';
import {
  handleCreateDocument,
  handleCreateFolder,
  handleDeleteDocument,
  handleGetDocument,
  handleGetNodeKinds,
  handleGetProject,
  handleListDocuments,
  handleLockDocument,
  handleMoveDocument,
  handleRenameDocument,
  handleSetDocument,
  handleUnlockDocument,
} from './handlers.js';

export interface IBuildMcpServerOptions {
  /**
   * Directories to scan for Arduino driver folders, bundled first then user overrides, only used
   * when the project's own `falang.json` `type` is `'arduino'` — see `registerArduinoProjectType`.
   * Ignored for every other project type.
   */
  readonly arduinoDriversDirs?: readonly string[];
}

export interface IBuiltMcpServer {
  readonly server: McpServer;
  readonly projectType: string;
  readonly arduinoDriverCount: number;
}

// oxlint-disable-next-line typescript/no-explicit-any -- the handler map below is heterogeneous in its second (parsed-args) parameter; every entry is still exercised through the one `IMcpToolDefinition.inputSchema` that produced it, so this is a controlled use, not a lint dodge.
type TToolHandler = (ctx: IToolContext, args: any) => Promise<CallToolResult>;

const HANDLERS: Readonly<Record<string, TToolHandler>> = {
  get_project: (ctx) => handleGetProject(ctx),
  list_documents: (ctx) => handleListDocuments(ctx),
  get_document: handleGetDocument,
  get_node_kinds: handleGetNodeKinds,
  create_document: handleCreateDocument,
  set_document: handleSetDocument,
  rename_document: handleRenameDocument,
  move_document: handleMoveDocument,
  delete_document: handleDeleteDocument,
  create_folder: handleCreateFolder,
  lock_document: handleLockDocument,
  unlock_document: handleUnlockDocument,
};

const registerTool = (server: McpServer, ctx: IToolContext, tool: IMcpToolDefinition): void => {
  const handler = HANDLERS[tool.name];
  if (!handler) throw new Error(`@falang/desktop-mcp: no handler wired for tool "${tool.name}"`);
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
    (args: unknown) => handler(ctx, args),
  );
};

/**
 * Builds (but does not connect/start) an `McpServer` serving `@falang/mcp-core`'s `MCP_TOOLS` over
 * `projectDir` via `@falang/desktop-project-fs` — see ADR 0029 (private),
 * phase E. `'text'`/`'logic'`/`'simple-code-<language>'`/`'workflow'` project types come from
 * `createDefaultDocumentStackRegistry()` as-is; an `'arduino'` project additionally gets its
 * pin/driver node kinds registered via `registerArduinoProjectType`, using
 * `options.arduinoDriversDirs`.
 */
export const buildMcpServer = async (
  projectDir: string,
  options: IBuildMcpServerOptions = {},
): Promise<IBuiltMcpServer> => {
  const manifest = await openProject(projectDir);
  const registry = createDefaultDocumentStackRegistry();
  let arduinoDriverCount = 0;
  if (manifest.type === ARDUINO_PROJECT_TYPE) {
    const result = await registerArduinoProjectType(registry, options.arduinoDriversDirs ?? []);
    arduinoDriverCount = result.driverCount;
    for (const error of result.driverErrors) {
      // oxlint-disable-next-line no-console -- stderr only, never stdout (which is the MCP wire protocol) — see `main.ts`'s own "never write to stdout except MCP frames" rule.
      console.error(`@falang/desktop-mcp: skipped Arduino driver at "${error.dir}": ${error.message}`);
    }
  }

  const server = new McpServer({ name: 'falang', version: '1.0.0' }, { capabilities: { tools: {} } });
  const ctx: IToolContext = { projectDir, projectType: manifest.type, registry };
  for (const tool of MCP_TOOLS) registerTool(server, ctx, tool);

  return { arduinoDriverCount, projectType: manifest.type, server };
};
