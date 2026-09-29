// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createProject, documentPath, readLocks } from '@falang/desktop-project-fs';
import { MCP_TOOLS } from '@falang/mcp-core';

/**
 * Real stdio round-trip: spawns `tsx src/main.ts <tempDir>` (the exact dev command
 * `mcp-server-path.ts` resolves in both desktop apps) and drives it with the SDK's own `Client` +
 * `StdioClientTransport` — no shortcuts through `buildMcpServer` directly, so this exercises the CLI
 * entry point, stdio framing and process spawn too. See
 * ADR 0029 (private), phase E.
 */

const repoRoot = path.resolve(__dirname, '../../../..');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const mainTsPath = path.join(__dirname, 'main.ts');

const connectTo = async (projectDir: string): Promise<Client> => {
  const transport = new StdioClientTransport({ args: [mainTsPath, projectDir], command: tsxBin });
  const client = new Client({ name: 'desktop-mcp-e2e-test', version: '1.0.0' });
  await client.connect(transport);
  return client;
};

// `Client['callTool']`'s own return type carries `content` as `unknown` (its generic result-schema
// overload), even though the value is a real `CallToolResult` at runtime — cast once here rather than
// re-deriving the SDK's own type from `ReturnType<...>` everywhere a test reads a tool result.
const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string => {
  const block = (result as CallToolResult).content[0];
  if (!block || block.type !== 'text') throw new Error('expected a text content block');
  return block.text;
};

const jsonOf = (result: Awaited<ReturnType<Client['callTool']>>): unknown => JSON.parse(textOf(result));

describe('@falang/desktop-mcp stdio e2e', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;
  // oxlint-disable-next-line init-declarations
  let client: Client;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-mcp-e2e-'));
    // 'logic' (not 'text'): every test below creates/edits a `function` document, which only a
    // 'logic'-typed project allows since `@falang/mcp-core`'s stack registry split `'text'` into
    // separate `'text'`/`'logic'`/`'simple-code-<language>'` project types — see
    // ADR 0005 (private)'s "Implementation notes (project types, new-project dialog, single
    // default document — 2026-09-20)".
    await createProject(projectDir, { name: 'e2e project', type: 'logic' });
    client = await connectTo(projectDir);
  }, 30_000);

  afterEach(async () => {
    await client.close();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('lists exactly the 12 shared v1 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual(MCP_TOOLS.map((tool) => tool.name).toSorted());
    expect(tools).toHaveLength(12);
  });

  it('get_node_kinds("function") returns a non-empty catalog', async () => {
    const result = await client.callTool({ arguments: { documentType: 'function' }, name: 'get_node_kinds' });
    const catalog = (jsonOf(result) as { nodeKinds: { name: string }[] }).nodeKinds;
    expect(catalog.length).toBeGreaterThan(5);
    expect(catalog.some((entry) => entry.name === 'if')).toBe(true);
  });

  it("create_document with no root uses the document type's default tree", async () => {
    const result = await client.callTool({
      arguments: { name: 'main', type: 'function' },
      name: 'create_document',
    });
    expect(result.isError).toBeFalsy();
    const document = jsonOf(result) as { id: string; root: { name: string } };
    expect(document.root.name).toBe('function');
  });

  it('set_document with an invalid tree fails, naming the zod path', async () => {
    const created = jsonOf(
      await client.callTool({ arguments: { name: 'main', type: 'function' }, name: 'create_document' }),
    ) as { id: string };

    const result = await client.callTool({
      arguments: { documentId: created.id, root: { id: 'bad', name: 'not-a-real-node-kind' } },
      name: 'set_document',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/set_document/);
  });

  it('set_document with a valid tree writes the file and takes the mcp lock; unlock_document releases it', async () => {
    const created = jsonOf(
      await client.callTool({ arguments: { name: 'main', type: 'function' }, name: 'create_document' }),
    ) as { id: string; root: { children: { name: string }[] } };

    const newRoot = { ...created.root, children: [...created.root.children] };
    const setResult = await client.callTool({
      arguments: { documentId: created.id, root: newRoot },
      name: 'set_document',
    });
    expect(setResult.isError).toBeFalsy();

    const onDiskDocument = JSON.parse(await fs.readFile(documentPath(projectDir, created.id), 'utf8')) as {
      root: { name: string };
    };
    expect(onDiskDocument.root.name).toBe('function');

    const locksAfterSet = await readLocks(projectDir);
    expect(locksAfterSet).toHaveLength(1);
    expect(locksAfterSet[0]?.owner).toBe('mcp');
    expect(locksAfterSet[0]?.documentId).toBe(created.id);

    const unlockResult = await client.callTool({ arguments: { documentId: created.id }, name: 'unlock_document' });
    expect(unlockResult.isError).toBeFalsy();
    const locksAfterUnlock = await readLocks(projectDir);
    expect(locksAfterUnlock).toEqual([]);
  });
});

describe('@falang/desktop-mcp stdio e2e — arduino project', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;
  // oxlint-disable-next-line init-declarations
  let client: Client;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-mcp-e2e-arduino-'));
    await createProject(projectDir, { name: 'e2e arduino project', type: 'arduino' });
    client = await connectTo(projectDir);
  }, 30_000);

  afterEach(async () => {
    await client.close();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('validates a document containing a pin-write-digital node', async () => {
    const created = jsonOf(
      await client.callTool({ arguments: { name: 'setup', type: 'function' }, name: 'create_document' }),
    ) as { id: string; root: { children: { name: string; children?: unknown[] }[] } };

    const pinNode = { data: { pin: 13, value: true }, id: 'pin-1', name: 'pin-write-digital' };
    const rootWithPin = {
      ...created.root,
      children: created.root.children.map((child) =>
        child.name === 'function-body' ? { ...child, children: [...(child.children ?? []), pinNode] } : child,
      ),
    };

    const result = await client.callTool({
      arguments: { documentId: created.id, root: rootWithPin },
      name: 'set_document',
    });
    expect(result.isError).toBeFalsy();
  });
});
