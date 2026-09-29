import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSidecar, writeSidecar } from './sidecar.js';

describe('readSidecar/writeSidecar', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-sidecar-test-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('writes and reads back arbitrary JSON under <projectDir>/<name>.json', async () => {
    await writeSidecar(projectDir, 'falang-debug', { breakpoints: [{ documentId: 'd1', nodeId: 'n1' }] });

    const loaded = await readSidecar<{ breakpoints: { documentId: string; nodeId: string }[] }>(
      projectDir,
      'falang-debug',
    );
    expect(loaded).toEqual({ breakpoints: [{ documentId: 'd1', nodeId: 'n1' }] });
    const raw = await fs.readFile(path.join(projectDir, 'falang-debug.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ breakpoints: [{ documentId: 'd1', nodeId: 'n1' }] });
  });

  it('returns null for a sidecar that was never written', async () => {
    expect(await readSidecar(projectDir, 'never-written')).toBeNull();
  });

  it('returns null for a corrupt sidecar file instead of throwing', async () => {
    await fs.writeFile(path.join(projectDir, 'broken.json'), '{ not json');
    expect(await readSidecar(projectDir, 'broken')).toBeNull();
  });
});
