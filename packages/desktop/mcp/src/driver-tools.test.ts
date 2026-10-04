/* oxlint-disable no-await-expression-member -- test file: terse awaits on tool results */
// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createProject } from '@falang/desktop-project-fs';
import { parseDriverBundle } from '@falang/desktop-arduino-dto';
import { validateDriverBundle } from '@falang/desktop-arduino-compiler';
import { buildMcpServer } from './server.js';

const EXAMPLE = path.resolve(
  __dirname,
  '../../../../plugins/falang/skills/falang-arduino/references/examples/bmp280.falang-driver.json',
);

const makeBundle = (id: string, fn = `${id.replaceAll('-', '_')}_go`): unknown => ({
  formatVersion: 1,
  config: {
    id,
    label: id,
    notes: `${id} test driver`,
    includes: [`${id}.h`],
    sourceFiles: [`${id}.h`, `${id}.cpp`],
    declarations: [`declare function ${fn}(pin: number): void;`],
    actions: [
      {
        id: 'go',
        label: 'Go',
        notes: 'goes',
        fields: [{ name: 'pin', label: 'Pin', kind: 'pin', default: '3' }],
        codeTemplate: `${fn}(\${pin})`,
      },
    ],
  },
  files: { [`${id}.h`]: `void ${fn}(int pin);\n`, [`${id}.cpp`]: `#include "${id}.h"\nvoid ${fn}(int pin) {}\n` },
});

const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string => {
  const block = (result as CallToolResult).content[0];
  if (!block || block.type !== 'text') throw new Error('expected text');
  return block.text;
};
const jsonOf = (result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> =>
  JSON.parse(textOf(result)) as Record<string, unknown>;
const isError = (result: Awaited<ReturnType<Client['callTool']>>): boolean =>
  (result as CallToolResult).isError === true;

describe('arduino driver MCP tools', () => {
  // oxlint-disable-next-line init-declarations
  let tmpRoot: string;
  // oxlint-disable-next-line init-declarations
  let projectDir: string;
  // oxlint-disable-next-line init-declarations
  let libraryDir: string;
  // oxlint-disable-next-line init-declarations
  let client: Client;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-mcp-drivers-'));
    projectDir = path.join(tmpRoot, 'project');
    libraryDir = path.join(tmpRoot, 'library');
    await fs.mkdir(libraryDir, { recursive: true });
    await createProject(projectDir, { name: 'p', type: 'arduino' });
    const { server } = await buildMcpServer(projectDir, {
      arduinoDriversDirs: [libraryDir],
      arduinoDriverCliCheck: () => null,
      arduinoLibraryDriversDir: libraryDir,
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

  /** Puts one `driver-action::my-led::go` node into the document's body, starting from its stored default tree. */
  const setDriverActionDocument = async (documentId: string) => {
    const doc = jsonOf(await call('get_document', { documentId })) as {
      root: { children: { name: string; children?: unknown[] }[] };
    };
    const body = doc.root.children.find((child) => child.name === 'function-body');
    if (body) body.children = [{ id: 'drv-node', name: 'driver-action::my-led::go', data: { pin: '5' } }];
    return call('set_document', { documentId, root: doc.root });
  };

  it('registers the six driver tools next to the shared ones for an arduino project', async () => {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    for (const name of [
      'list_drivers',
      'get_driver',
      'validate_driver',
      'set_driver',
      'delete_driver',
      'use_library_driver',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('is not registered for a non-arduino project', async () => {
    const dir = path.join(tmpRoot, 'logic');
    await createProject(dir, { name: 'l', type: 'logic' });
    const { server } = await buildMcpServer(dir, {});
    const [c, s] = InMemoryTransport.createLinkedPair();
    const other = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(s), other.connect(c)]);
    const otherTools = await other.listTools();
    expect(otherTools.tools.map((tool) => tool.name)).not.toContain('list_drivers');
    await other.close();
  });

  it('set_driver (project) writes the folder, and the new kind is valid for set_document in the same session', async () => {
    const result = await call('set_driver', { bundle: makeBundle('my-led'), scope: 'project' });
    expect(isError(result)).toBe(false);
    expect(jsonOf(result).written).toBe(true);
    await fs.access(path.join(projectDir, 'falang', 'drivers', 'my-led', 'driver.config.json'));

    const kinds = jsonOf(await call('get_node_kinds', { documentType: 'function' }));
    expect(JSON.stringify(kinds)).toContain('driver-action::my-led::go');

    const created = jsonOf(await call('create_document', { name: 'blink', type: 'function' })) as { id: string };
    const set = await setDriverActionDocument(created.id);
    expect(isError(set)).toBe(false);
  });

  it('list_drivers shows the driver with actions, scope and notes', async () => {
    await call('set_driver', { bundle: makeBundle('my-led'), scope: 'project' });
    const listed = jsonOf(await call('list_drivers')) as {
      drivers: { id: string; scope: string; status: string; actions: { id: string }[] }[];
    };
    const entry = listed.drivers.find((driver) => driver.id === 'my-led');
    expect(entry?.scope).toBe('project');
    expect(entry?.status).toBe('ok');
    expect(entry?.actions[0].id).toBe('go');
  });

  it('picks up a driver written on disk by someone else (mtime reload) without a write through the tools', async () => {
    const dir = path.join(libraryDir, 'ext');
    await fs.mkdir(dir, { recursive: true });
    const bundle = parseDriverBundle(makeBundle('ext'));
    await fs.writeFile(path.join(dir, 'driver.config.json'), JSON.stringify(bundle.config));
    await Promise.all(Object.entries(bundle.files).map(([name, text]) => fs.writeFile(path.join(dir, name), text)));
    const listed = jsonOf(await call('list_drivers')) as { drivers: { id: string }[] };
    expect(listed.drivers.map((driver) => driver.id)).toContain('ext');
    expect(JSON.stringify(jsonOf(await call('get_node_kinds', { documentType: 'function' })))).toContain(
      'driver-action::ext::go',
    );
  });

  it('validate_driver reports a collision with another driver and does not write', async () => {
    await call('set_driver', { bundle: makeBundle('first', 'shared_fn'), scope: 'project' });
    const result = await call('validate_driver', { bundle: makeBundle('second', 'shared_fn'), scope: 'project' });
    expect(isError(result)).toBe(true);
    expect(jsonOf(result).ok).toBe(false);
    const setResult = await call('set_driver', { bundle: makeBundle('second', 'shared_fn'), scope: 'project' });
    expect(isError(setResult)).toBe(true);
    expect(jsonOf(setResult).written).toBe(false);
    await expect(fs.access(path.join(projectDir, 'falang', 'drivers', 'second'))).rejects.toThrow();
  });

  it('get_driver returns the bundle', async () => {
    await call('set_driver', { bundle: makeBundle('my-led'), scope: 'project' });
    const got = jsonOf(await call('get_driver', { id: 'my-led', scope: 'project' })) as {
      bundle: { config: { id: string } };
    };
    expect(got.bundle.config.id).toBe('my-led');
    expect(isError(await call('get_driver', { id: 'nope' }))).toBe(true);
  });

  it('use_library_driver copies a library driver into the project', async () => {
    expect(isError(await call('set_driver', { bundle: makeBundle('lib-drv'), scope: 'library' }))).toBe(false);
    const result = await call('use_library_driver', { id: 'lib-drv' });
    expect(isError(result)).toBe(false);
    await fs.access(path.join(projectDir, 'falang', 'drivers', 'lib-drv', 'driver.config.json'));
    const listed = jsonOf(await call('list_drivers')) as {
      drivers: { id: string; scope: string; effective: boolean }[];
    };
    const project = listed.drivers.find((driver) => driver.id === 'lib-drv' && driver.scope === 'project');
    expect(project?.effective).toBe(true);
  });

  it('delete_driver refuses a used project driver with usages, and deletes an unused one', async () => {
    await call('set_driver', { bundle: makeBundle('my-led'), scope: 'project' });
    const created = jsonOf(await call('create_document', { name: 'blink', type: 'function' })) as { id: string };
    await setDriverActionDocument(created.id);
    const refused = await call('delete_driver', { id: 'my-led', scope: 'project' });
    expect(isError(refused)).toBe(true);
    expect((jsonOf(refused).usages as unknown[]).length).toBeGreaterThan(0);

    await call('set_driver', { bundle: makeBundle('unused'), scope: 'project' });
    const deleted = await call('delete_driver', { id: 'unused', scope: 'project' });
    expect(jsonOf(deleted).deleted).toBe(true);
    await expect(fs.access(path.join(projectDir, 'falang', 'drivers', 'unused'))).rejects.toThrow();
  });

  describe('externally changed project drivers', () => {
    interface TListed {
      drivers: { id: string; scope: string; status: string; errors?: string[] }[];
    }
    const entryOf = async (id: string) =>
      (jsonOf(await call('list_drivers')) as unknown as TListed).drivers.find((driver) => driver.id === id);
    const configPath = (id: string) => path.join(projectDir, 'falang', 'drivers', id, 'driver.config.json');

    it('keeps serving the last valid config of a driver broken on disk (invalid-on-disk), and recovers', async () => {
      await call('set_driver', { bundle: makeBundle('my-led'), scope: 'project' });
      const good = await fs.readFile(configPath('my-led'), 'utf8');
      const config = JSON.parse(good) as { actions: { codeTemplate: string }[] };
      config.actions[0].codeTemplate = 'undeclared_fn(${pin})';
      await fs.writeFile(configPath('my-led'), JSON.stringify(config));
      const broken = await entryOf('my-led');
      expect(broken?.status).toBe('invalid-on-disk');
      expect(broken?.errors?.length).toBeGreaterThan(0);

      expect(JSON.stringify(jsonOf(await call('get_node_kinds', { documentType: 'function' })))).toContain(
        'driver-action::my-led::go',
      );
      const created = jsonOf(await call('create_document', { name: 'blink', type: 'function' })) as { id: string };
      expect(isError(await setDriverActionDocument(created.id))).toBe(false);

      await fs.writeFile(configPath('my-led'), `${good}\n`);
      expect((await entryOf('my-led'))?.status).toBe('ok');
    });

    it('reports load-error (last valid config still served) for an unreadable driver.config.json', async () => {
      await call('set_driver', { bundle: makeBundle('my-led'), scope: 'project' });
      await entryOf('my-led');
      await fs.writeFile(configPath('my-led'), '{ not json');
      expect((await entryOf('my-led'))?.status).toBe('load-error');
      expect(JSON.stringify(jsonOf(await call('get_node_kinds', { documentType: 'function' })))).toContain(
        'driver-action::my-led::go',
      );
    });

    it('reports missing-on-disk for a used driver whose folder was deleted, and drops an unused one', async () => {
      await call('set_driver', { bundle: makeBundle('my-led'), scope: 'project' });
      await call('set_driver', { bundle: makeBundle('unused'), scope: 'project' });
      const created = jsonOf(await call('create_document', { name: 'blink', type: 'function' })) as { id: string };
      await setDriverActionDocument(created.id);
      await fs.rm(path.join(projectDir, 'falang', 'drivers', 'my-led'), { recursive: true });
      await fs.rm(path.join(projectDir, 'falang', 'drivers', 'unused'), { recursive: true });

      expect((await entryOf('my-led'))?.status).toBe('missing-on-disk');
      expect(await entryOf('unused')).toBeUndefined();
      expect(JSON.stringify(jsonOf(await call('get_node_kinds', { documentType: 'function' })))).toContain(
        'driver-action::my-led::go',
      );
    });
  });
});

describe('bundled example driver', () => {
  it('bmp280.falang-driver.json passes validateDriverBundle', async () => {
    const example = JSON.parse(await fs.readFile(EXAMPLE, 'utf8')) as unknown;
    const result = await validateDriverBundle(example, { otherDrivers: [] });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
