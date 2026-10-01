import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const MCP_JSON_FILENAME = '.mcp.json';
const CLAUDE_MD_FILENAME = 'CLAUDE.md';

export interface IWriteAgentFilesParams {
  /** The command an MCP client (e.g. Claude Code) should run to start this project's `falang` MCP server — see the calling app's own `main/mcp-server-path.ts` for how it's resolved (dev vs packaged). */
  mcpServerCommand: string;
  mcpServerArgs: readonly string[];
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

const buildMcpJson = (params: IWriteAgentFilesParams): string =>
  `${JSON.stringify(
    {
      mcpServers: {
        falang: {
          command: params.mcpServerCommand,
          args: [...params.mcpServerArgs],
        },
      },
    },
    null,
    2,
  )}\n`;

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
 * (only-if-absent, so it's safe to call unconditionally) on project open, so a project created
 * before this existed still gets the files the first time it's reopened.
 *
 * Deliberately **never overwrites** either file if it already exists — a user may have hand-edited
 * `CLAUDE.md` or pointed `.mcp.json` at a different server, and this function has no way to tell
 * "untouched since we wrote it" from "the user changed it" without a lot more machinery than a v1
 * needs.
 */
export const writeAgentFiles = async (projectDir: string, params: IWriteAgentFilesParams): Promise<void> => {
  const mcpJsonPath = path.join(projectDir, MCP_JSON_FILENAME);
  const claudeMdPath = path.join(projectDir, CLAUDE_MD_FILENAME);
  if (!(await fileExists(mcpJsonPath))) await fs.writeFile(mcpJsonPath, buildMcpJson(params));
  if (!(await fileExists(claudeMdPath))) await fs.writeFile(claudeMdPath, buildClaudeMd(params));
};
