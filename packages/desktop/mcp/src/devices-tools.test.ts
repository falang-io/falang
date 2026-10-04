import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  createDocument,
  createProject,
  readDocument,
  readLocks,
  writeLocks,
} from '@falang/desktop-project-fs';
import { DEVICES_DOCUMENT_TYPE } from '@falang/desktop-arduino-dto';
import { buildMcpServer } from './server.js';

const lcdBundle = {
  formatVersion: 1,
  config: {
    id: 'my-lcd',
    label: 'My LCD',
    notes: 'A test display',
    includes: ['my-lcd.h'],
    sourceFiles: ['my-lcd.h', 'my-lcd.cpp'],
    declarations: ['declare function my_lcd_init(address: number): void;'],
    actions: [
      {
        id: 'go',
        label: 'Go',
        notes: 'goes',
        fields: [],
        codeTemplate: 'my_lcd_init(39)',
      },
    ],
    device: {
      fields: [{ name: 'address', label: 'Address', kind: 'number', default: '39' }],
      setupTemplate: 'my_lcd_init(${address})',
    },
  },
  files: {
    'my-lcd.h': 'void my_lcd_init(int a);\n',
    'my-lcd.cpp': '#include "my-lcd.h"\nvoid my_lcd_init(int a) {}\n',
  },
};

const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string => {
  const block = (result as CallToolResult).content[0];
  if (!block || block.type !== 'text') throw new Error('expected text');
  return block.text;
};
const isError = (result: Awaited<ReturnType<Client['callTool']>>): boolean =>
  (result as CallToolResult).isError === true;

describe('devices MCP tools', () => {
  // oxlint-disable-next-line init-declarations
  let tmpRoot: string;
  // oxlint-disable-next-line init-declarations
  let projectDir: string;
  // oxlint-disable-next-line init-declarations
  let client: Client;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-mcp-devices-'));
    projectDir = path.join(tmpRoot, 'project');
    await createProject(projectDir, { name: 'p', type: 'arduino' });
    const { server } = await buildMcpServer(projectDir, {
      arduinoDriverCliCheck: () => null,
      arduinoDriversDirs: [],
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  });

  afterEach(async () => {
    await client.close();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

  /** `createProject` makes no Devices document itself (the app's `main` does); add one the same way. */
  const addDevicesDocument = async (): Promise<string> => {
    const id = randomUUID();
    await createDocument(projectDir, {
      document: { data: { devices: [], pins: [] }, id, name: 'Devices', type: DEVICES_DOCUMENT_TYPE },
      folderId: null,
    });
    return id;
  };

  it('reports a missing Devices document', async () => {
    expect(isError(await call('get_devices'))).toBe(true);
  });

  it('set_devices writes a validated instance of a project driver, get_devices reads it back', async () => {
    const id = await addDevicesDocument();
    const sd = await call('set_driver', { bundle: lcdBundle, scope: 'project' });
    expect(isError(sd), textOf(sd)).toBe(false);
    const set = await call('set_devices', {
      devices: [{ driverId: 'my-lcd', name: 'Front' }],
      pins: [{ mode: 'output', pin: 13 }],
    });
    expect(isError(set), textOf(set)).toBe(false);
    const stored = await readDocument(projectDir, id);
    expect(stored.data).toMatchObject({ devices: [{ driverId: 'my-lcd', params: { address: '39' } }] });
    const got = JSON.parse(textOf(await call('get_devices'))) as { pins: unknown[]; devices: unknown[] };
    expect(got.devices).toHaveLength(1);
    expect(got.pins).toHaveLength(1);
  });

  it('refuses an unknown driver and a bad field, writing nothing', async () => {
    const id = await addDevicesDocument();
    await call('set_driver', { bundle: lcdBundle, scope: 'project' });
    const unknown = await call('set_devices', { devices: [{ driverId: 'ghost', name: 'x' }], pins: [] });
    expect(isError(unknown)).toBe(true);
    expect(textOf(unknown)).toContain('devices[0].driverId');
    const bad = await call('set_devices', {
      devices: [{ driverId: 'my-lcd', name: 'x', params: { address: 'abc' } }],
      pins: [],
    });
    expect(isError(bad)).toBe(true);
    expect(textOf(bad)).toContain('devices[0].params.address');
    const after = await readDocument(projectDir, id);
    expect(after.data).toEqual({ devices: [], pins: [] });
  });

  it('is refused while another owner holds the document lock', async () => {
    const id = await addDevicesDocument();
    await writeLocks(projectDir, [
      {
        acquiredAt: new Date().toISOString(),
        documentId: id,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        owner: 'app',
      },
    ]);
    const result = await call('set_devices', { devices: [], pins: [{ mode: 'input', pin: 2 }] });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain('locked');
    const locks = await readLocks(projectDir);
    expect(locks[0]?.owner).toBe('app');
  });

  it('takes the lock as owner mcp on success', async () => {
    const id = await addDevicesDocument();
    await call('set_devices', { devices: [], pins: [] });
    const locks = await readLocks(projectDir);
    expect(locks.find((lock) => lock.documentId === id)?.owner).toBe('mcp');
  });
});
