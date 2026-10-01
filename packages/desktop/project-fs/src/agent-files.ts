import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const MCP_JSON_FILENAME = '.mcp.json';
const CLAUDE_MD_FILENAME = 'CLAUDE.md';

export interface IWriteAgentFilesParams {
  /** The command an MCP client (e.g. Claude Code) should run to start this project's `falang` MCP server — see the calling app's own `main/mcp-server-path.ts` for how it's resolved (dev vs packaged). */
  mcpServerCommand: string;
  mcpServerArgs: readonly string[];
  /** Extra environment for the server process — a packaged app runs the server with its own binary in Node mode (`ELECTRON_RUN_AS_NODE=1`). Omitted from `.mcp.json` when empty. */
  mcpServerEnv?: Readonly<Record<string, string>>;
  /** `falang.json`'s own `type` (`text` / `logic` / `simple-code` / the Arduino app's single implicit type), echoed into `CLAUDE.md` so an agent without the plugin installed still knows what kind of project this is. */
  projectType: string;
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

interface IMcpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const MCP_SERVER_NAME = 'falang';

const buildServerEntry = (params: IWriteAgentFilesParams): IMcpServerEntry => ({
  command: params.mcpServerCommand,
  args: [...params.mcpServerArgs],
  ...(params.mcpServerEnv && Object.keys(params.mcpServerEnv).length > 0 ? { env: { ...params.mcpServerEnv } } : {}),
});

const stringifyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const buildMcpJson = (params: IWriteAgentFilesParams): string =>
  stringifyJson({ mcpServers: { [MCP_SERVER_NAME]: buildServerEntry(params) } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The updated `.mcp.json` text, or `null` to leave the file alone: only an existing, parseable file
 * whose `falang` entry differs from what this app would write now gets rewritten — just that entry,
 * every other server and key kept. A file without a `falang` entry (the user removed it, or wrote
 * their own config) and an unparseable one are never touched.
 */
const updateMcpJson = (existing: string, params: IWriteAgentFilesParams): string | null => {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(existing);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers) || !(MCP_SERVER_NAME in parsed.mcpServers)) return null;
  const entry = buildServerEntry(params);
  if (JSON.stringify(parsed.mcpServers[MCP_SERVER_NAME]) === JSON.stringify(entry)) return null;
  return stringifyJson({ ...parsed, mcpServers: { ...parsed.mcpServers, [MCP_SERVER_NAME]: entry } });
};

const buildClaudeMd = (params: IWriteAgentFilesParams): string =>
  `# falang project

This folder is a falang \`${params.projectType}\` project. Documents live one per file under
\`falang/schemes/<folder path>/<scheme name>.json\` (folders are real directories); the tree index and
the document ids live in \`falang.json\`.

Edit this project through the \`falang\` MCP server's tools rather than editing these JSON files by
hand — the on-disk shapes are internal, and only the MCP tools validate node kinds and their allowed
children. See the \`falang\` Claude Code plugin's skills for the node model and working rules.
`;

/**
 * Writes `.mcp.json` + `CLAUDE.md` into a project folder so an MCP-capable coding agent (Claude
 * Code and friends) picks up this project's `falang` MCP server automatically — see
 * ADR 0029 (private)'s "Delivery" section. Called on project create and
 * on every project open (idempotent, so it's safe to call unconditionally), so a project created
 * before this existed still gets the files the first time it's reopened.
 *
 * `CLAUDE.md` is only ever written when absent — a user may have hand-edited it. `.mcp.json` is
 * written when absent, and otherwise only its `falang` server entry is kept current (see
 * `updateMcpJson`): the command embeds the app binary's own path, which an update or a reinstall
 * moves, so an entry written by an older install would otherwise point at a binary that no longer
 * exists (ADR 0050 (private), "B1").
 */
export const writeAgentFiles = async (projectDir: string, params: IWriteAgentFilesParams): Promise<void> => {
  const mcpJsonPath = path.join(projectDir, MCP_JSON_FILENAME);
  const claudeMdPath = path.join(projectDir, CLAUDE_MD_FILENAME);
  if (await fileExists(mcpJsonPath)) {
    const updated = updateMcpJson(await fs.readFile(mcpJsonPath, 'utf8'), params);
    if (updated !== null) await fs.writeFile(mcpJsonPath, updated);
  } else {
    await fs.writeFile(mcpJsonPath, buildMcpJson(params));
  }
  if (!(await fileExists(claudeMdPath))) await fs.writeFile(claudeMdPath, buildClaudeMd(params));
};
