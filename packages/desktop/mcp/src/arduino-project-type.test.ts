import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultDocumentStackRegistry, validateDocument } from '@falang/mcp-core';
import type { IProjectDocument } from '@falang/dto';
import {
  ARDUINO_FUNCTION_DOCUMENT_TYPE,
  ARDUINO_PROJECT_TYPE,
  registerArduinoProjectType,
} from './arduino-project-type.js';

const writeDriver = async (driversDir: string, id: string): Promise<void> => {
  const dir = path.join(driversDir, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'driver.config.json'),
    JSON.stringify({
      id,
      label: id,
      includes: [`${id}.h`],
      sourceFiles: [`${id}.h`, `${id}.cpp`],
      declarations: [`declare function ${id}_fn(): void;`],
      actions: [{ id: 'do-it', label: 'Do it', fields: [], codeTemplate: `${id}_fn()` }],
    }),
  );
  await fs.writeFile(path.join(dir, `${id}.h`), '// h');
  await fs.writeFile(path.join(dir, `${id}.cpp`), '// cpp');
};

describe('registerArduinoProjectType', () => {
  // oxlint-disable-next-line init-declarations
  let driversDir: string;

  beforeEach(async () => {
    driversDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-mcp-drivers-'));
  });

  afterEach(async () => {
    await fs.rm(driversDir, { recursive: true, force: true });
  });

  it('registers the function document type with pin node kinds, even with no driver dirs', async () => {
    const registry = createDefaultDocumentStackRegistry();
    const result = await registerArduinoProjectType(registry, []);
    expect(result.driverCount).toBe(0);
    expect(result.driverErrors).toEqual([]);

    const stack = registry.getStack(ARDUINO_PROJECT_TYPE, ARDUINO_FUNCTION_DOCUMENT_TYPE);
    expect(stack).toBeDefined();
    expect(stack?.configsMap.has('pin-write-digital')).toBe(true);
    expect(stack?.configsMap.has('create-var')).toBe(true);
  });

  it('validates a document containing a pin-write-digital node', async () => {
    const registry = createDefaultDocumentStackRegistry();
    await registerArduinoProjectType(registry, []);
    const stack = registry.getStack(ARDUINO_PROJECT_TYPE, ARDUINO_FUNCTION_DOCUMENT_TYPE);
    if (!stack) throw new Error('expected the arduino function stack to be registered');

    const root = stack.factory(ARDUINO_FUNCTION_DOCUMENT_TYPE);
    const body = root.children?.find((child) => child.name === 'function-body');
    if (!body) throw new Error('expected a function-body child');
    const pinNode = stack.factory('pin-write-digital');
    const bodyWithPin = { ...body, children: [...(body.children ?? []), pinNode] };
    const rootWithPin = {
      ...root,
      children: root.children?.map((child) => (child.name === 'function-body' ? bodyWithPin : child)),
    };

    const document: IProjectDocument = { id: 'doc-1', name: 'setup', root: rootWithPin, type: 'function' };
    const result = validateDocument(ARDUINO_PROJECT_TYPE, document, registry);
    expect(result.ok).toBe(true);
  });

  it('rejects a document using an unknown driver-action node kind', async () => {
    const registry = createDefaultDocumentStackRegistry();
    await registerArduinoProjectType(registry, []);
    const stack = registry.getStack(ARDUINO_PROJECT_TYPE, ARDUINO_FUNCTION_DOCUMENT_TYPE);
    if (!stack) throw new Error('expected the arduino function stack to be registered');
    expect(stack.configsMap.has('driver-action::dht::read')).toBe(false);
  });

  it('loads driver-action node kinds from a driversDir, later dirs winning on id collision', async () => {
    await writeDriver(driversDir, 'dht');
    const registry = createDefaultDocumentStackRegistry();
    const result = await registerArduinoProjectType(registry, [driversDir]);
    expect(result.driverCount).toBe(1);

    const stack = registry.getStack(ARDUINO_PROJECT_TYPE, ARDUINO_FUNCTION_DOCUMENT_TYPE);
    expect(stack?.configsMap.has('driver-action::dht::do-it')).toBe(true);
  });

  it('reports (but does not throw on) a malformed driver folder', async () => {
    const badDir = path.join(driversDir, 'broken');
    await fs.mkdir(badDir, { recursive: true });
    await fs.writeFile(path.join(badDir, 'driver.config.json'), '{ not valid json');

    const registry = createDefaultDocumentStackRegistry();
    const result = await registerArduinoProjectType(registry, [driversDir]);
    expect(result.driverCount).toBe(0);
    expect(result.driverErrors).toHaveLength(1);
  });
});
