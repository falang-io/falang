import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeAgentFiles } from './agent-files.js';

describe('writeAgentFiles', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-agent-files-test-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('writes .mcp.json and CLAUDE.md when absent', async () => {
    await writeAgentFiles(projectDir, {
      mcpServerCommand: 'npx',
      mcpServerArgs: ['tsx', '/repo/packages/desktop/mcp/src/main.ts', '.'],
      projectType: 'logic',
    });

    const mcpJson = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf8')) as unknown;
    expect(mcpJson).toEqual({
      mcpServers: {
        falang: {
          command: 'npx',
          args: ['tsx', '/repo/packages/desktop/mcp/src/main.ts', '.'],
        },
      },
    });

    const claudeMd = await fs.readFile(path.join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('falang `logic` project');
    expect(claudeMd).toContain('falang/schemes/<folder path>/<scheme name>.json');
    expect(claudeMd).toContain('falang` MCP server');
  });

  it('never overwrites an existing CLAUDE.md or a .mcp.json without a falang entry', async () => {
    await fs.writeFile(path.join(projectDir, '.mcp.json'), '{"mcpServers":{"custom":{}}}');
    await fs.writeFile(path.join(projectDir, 'CLAUDE.md'), '# my own notes\n');

    await writeAgentFiles(projectDir, { mcpServerCommand: 'node', mcpServerArgs: ['x'], projectType: 'simple-code' });

    expect(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf8')).toBe('{"mcpServers":{"custom":{}}}');
    expect(await fs.readFile(path.join(projectDir, 'CLAUDE.md'), 'utf8')).toBe('# my own notes\n');
  });

  it('leaves an unparseable .mcp.json alone', async () => {
    await fs.writeFile(path.join(projectDir, '.mcp.json'), '{ not json');

    await writeAgentFiles(projectDir, { mcpServerCommand: 'node', mcpServerArgs: [], projectType: 'text' });

    expect(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf8')).toBe('{ not json');
  });

  it('rewrites a stale falang entry, keeping every other server and key', async () => {
    await fs.writeFile(
      path.join(projectDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: { falang: { command: '/old/Falang.exe', args: ['/old/index.js', '.'] }, other: { command: 'x' } },
        extra: true,
      }),
    );

    await writeAgentFiles(projectDir, {
      mcpServerCommand: '/new/Falang.exe',
      mcpServerArgs: ['/new/index.js', '.'],
      mcpServerEnv: { ELECTRON_RUN_AS_NODE: '1' },
      projectType: 'text',
    });

    const mcpJson = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf8')) as unknown;
    expect(mcpJson).toEqual({
      mcpServers: {
        falang: { command: '/new/Falang.exe', args: ['/new/index.js', '.'], env: { ELECTRON_RUN_AS_NODE: '1' } },
        other: { command: 'x' },
      },
      extra: true,
    });
  });

  it('does not rewrite a falang entry that is already current', async () => {
    const params = { mcpServerCommand: 'node', mcpServerArgs: ['a'], projectType: 'text' };
    await writeAgentFiles(projectDir, params);
    const mcpPath = path.join(projectDir, '.mcp.json');
    const past = new Date('2020-01-01T00:00:00Z');
    await fs.utimes(mcpPath, past, past);

    await writeAgentFiles(projectDir, params);

    const stat = await fs.stat(mcpPath);
    expect(stat.mtime.getTime()).toBe(past.getTime());
  });

  it('writes only the missing one of the pair, leaving the other alone', async () => {
    await fs.writeFile(path.join(projectDir, 'CLAUDE.md'), '# kept\n');

    await writeAgentFiles(projectDir, { mcpServerCommand: 'node', mcpServerArgs: [], projectType: 'text' });

    expect(await fs.readFile(path.join(projectDir, 'CLAUDE.md'), 'utf8')).toBe('# kept\n');
    const mcpJson = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf8')) as unknown;
    expect(mcpJson).toEqual({ mcpServers: { falang: { command: 'node', args: [] } } });
  });
});
