import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { zod } from '@falang/dto';

export interface ILooseToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
}

export interface ILooseToolConfig {
  readonly description: string;
  readonly inputSchema: zod.ZodType;
  readonly annotations?: ILooseToolAnnotations;
}

// oxlint-disable-next-line no-explicit-any -- see `registerLooseTool`'s own doc comment for why.
export type TLooseToolHandler = (args: any) => Promise<CallToolResult>;

/**
 * `McpServer.registerTool`'s generics tie a tool's handler argument type to the *concrete* zod
 * schema type TypeScript can see at the call site. Every tool schema here is built programmatically —
 * either mirroring/extending `@falang/mcp-core`'s own `IMcpToolDefinition.inputSchema` (itself typed
 * as the wide `zod.ZodType`, not a concrete shape, so the concrete field types are already erased one
 * layer up) or composed inline — so that inference has nothing concrete to key off. This wrapper
 * erases the mismatch at the TypeScript level only; the SDK still validates every real call's
 * arguments against the actual runtime zod schema before a handler ever runs (`McpServer`'s own
 * `validateToolInput`), so an invalid call is rejected exactly the same way it would be with full
 * static inference — nothing here weakens runtime safety, only where the type-checking happens.
 */
export const registerLooseTool = (
  server: McpServer,
  name: string,
  config: ILooseToolConfig,
  handler: TLooseToolHandler,
): void => {
  const register = server.registerTool.bind(server) as (
    toolName: string,
    toolConfig: ILooseToolConfig,
    toolHandler: TLooseToolHandler,
  ) => void;
  register(name, config, handler);
};
