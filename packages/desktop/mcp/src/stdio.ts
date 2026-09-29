import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer, type IBuildMcpServerOptions, type IBuiltMcpServer } from './server.js';

/**
 * Builds the server for `projectDir` and connects it to stdin/stdout — see `main.ts` for the CLI
 * entry point and ADR 0029 (private)'s "Desktop: a stdio server over the
 * files" section. Never writes anything to stdout itself; the SDK's `StdioServerTransport` owns
 * stdout for the MCP wire protocol — every diagnostic in this package goes to stderr instead (see
 * `server.ts`'s own driver-load-error logging).
 */
export const startStdioServer = async (
  projectDir: string,
  options: IBuildMcpServerOptions = {},
): Promise<IBuiltMcpServer> => {
  const built = await buildMcpServer(projectDir, options);
  const transport = new StdioServerTransport();
  await built.server.connect(transport);
  return built;
};
