// oxlint-disable consistent-function-scoping, no-await-expression-member -- test scaffolding
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installCore, isCoreInstalled, listInstalledCores } from './cores.js';
import { compileSketch } from './compile-sketch.js';

/** A fake `arduino-cli`: logs its argv to `$FAKE_LOG`, behaves per `$FAKE_MODE`. */
const FAKE_SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, data: process.env.ARDUINO_DIRECTORIES_DATA ?? null }) + '\\n');
const mode = process.env.FAKE_MODE ?? '';
if (args[0] === 'core' && args[1] === 'list') {
  if (mode === 'list-fail') { console.error('boom'); process.exit(3); }
  if (mode === 'list-garbage') { console.log('not json'); process.exit(0); }
  if (mode === 'list-legacy') { console.log(JSON.stringify([{ id: 'arduino:avr', installed_version: '1.8.6' }])); process.exit(0); }
  console.log(JSON.stringify({ platforms: [{ id: 'arduino:avr', installed_version: '1.8.6', latest_version: '1.8.7' }, { id: 'esp32:esp32', installed_version: '3.0.0' }] }));
  process.exit(0);
}
if (args[1] === 'update-index') { console.log('Downloading index'); if (mode === 'update-fail') { console.error('no network'); process.exit(1); } process.exit(0); }
if (args[1] === 'install') {
  process.stdout.write('part');
  process.stdout.write('ial\\nsecond line\\n');
  console.error('warn line');
  if (mode === 'hang') { setInterval(() => {}, 1000); } else process.exit(0);
}
`;

describe.skipIf(process.platform === 'win32')('cores (fake arduino-cli)', () => {
  const state = { dir: '', log: '' };
  const saved = { ...process.env };

  beforeEach(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'falang-cores-'));
    const bin = path.join(dir, 'arduino-cli');
    await writeFile(bin, FAKE_SCRIPT);
    await chmod(bin, 0o755);
    const log = path.join(dir, 'calls.log');
    state.dir = dir;
    state.log = log;
    process.env.FALANG_ARDUINO_CLI = bin;
    process.env.FAKE_LOG = log;
    delete process.env.FAKE_MODE;
  });

  afterEach(async () => {
    process.env = { ...saved };
    await rm(state.dir, { recursive: true, force: true });
  });

  const calls = async (): Promise<{ args: string[]; data: string | null }[]> => {
    const { readFile } = await import('node:fs/promises');
    return (await readFile(state.log, 'utf8'))
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { args: string[]; data: string | null });
  };

  it('lists installed cores from core list --json', async () => {
    const result = await listInstalledCores();
    expect(result).toEqual({
      ok: true,
      cores: [
        { id: 'arduino:avr', version: '1.8.6' },
        { id: 'esp32:esp32', version: '3.0.0' },
      ],
    });
    const [first] = await calls();
    expect(first?.args).toEqual(['core', 'list', '--json']);
  });

  it('accepts a bare-array output', async () => {
    process.env.FAKE_MODE = 'list-legacy';
    expect(await listInstalledCores()).toEqual({ ok: true, cores: [{ id: 'arduino:avr', version: '1.8.6' }] });
  });

  it('reports a failing or garbled core list instead of throwing', async () => {
    process.env.FAKE_MODE = 'list-fail';
    expect(await listInstalledCores()).toEqual({ ok: false, message: 'boom' });
    process.env.FAKE_MODE = 'list-garbage';
    expect((await listInstalledCores()).ok).toBe(false);
  });

  it('reports a missing binary', async () => {
    process.env.FALANG_ARDUINO_CLI = path.join(state.dir, 'nope');
    const result = await listInstalledCores();
    expect(result.ok).toBe(false);
  });

  it('isCoreInstalled is true/false, null when the list cannot be read', async () => {
    expect(await isCoreInstalled('arduino:avr')).toBe(true);
    expect(await isCoreInstalled('arduino:samd')).toBe(false);
    process.env.FAKE_MODE = 'list-fail';
    expect(await isCoreInstalled('arduino:avr')).toBeNull();
  });

  it('passes env to the CLI', async () => {
    await listInstalledCores({ env: { ARDUINO_DIRECTORIES_DATA: '/x/data' } });
    const [first] = await calls();
    expect(first?.data).toBe('/x/data');
  });

  it('installCore updates the index then installs, with --additional-urls on both, streaming lines', async () => {
    const lines: string[] = [];
    const result = await installCore({
      platformId: 'esp32:esp32',
      additionalUrls: ['https://example.test/index.json'],
      onOutput: (line) => lines.push(line),
    });
    expect(result).toEqual({ ok: true });
    const all = await calls();
    expect(all.map((call) => call.args)).toEqual([
      ['core', 'update-index', '--additional-urls', 'https://example.test/index.json'],
      ['core', 'install', 'esp32:esp32', '--additional-urls', 'https://example.test/index.json'],
    ]);
    expect(lines).toEqual(['Downloading index', 'partial', 'second line', 'warn line']);
  });

  it('installCore without urls passes none', async () => {
    await installCore({ platformId: 'arduino:avr' });
    const all = await calls();
    expect(all.map((call) => call.args)).toEqual([
      ['core', 'update-index'],
      ['core', 'install', 'arduino:avr'],
    ]);
  });

  it('installCore stops at a failing index update and reports its output', async () => {
    process.env.FAKE_MODE = 'update-fail';
    const result = await installCore({ platformId: 'arduino:avr' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('no network');
    const all = await calls();
    expect(all).toHaveLength(1);
  });

  it('installCore can be cancelled', async () => {
    process.env.FAKE_MODE = 'hang';
    const controller = new AbortController();
    const promise = installCore({
      platformId: 'arduino:avr',
      signal: controller.signal,
      onOutput: (line) => {
        if (line === 'second line') controller.abort();
      },
    });
    expect(await promise).toEqual({ ok: false, cancelled: true, message: 'Cancelled.' });
  });

  it('installCore with an already aborted signal does nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await installCore({ platformId: 'arduino:avr', signal: controller.signal })).toMatchObject({
      cancelled: true,
    });
  });
});

describe.skipIf(process.env.FALANG_ARDUINO_CORES_LIVE !== '1')('cores (live arduino-cli)', () => {
  it('installs arduino:avr into a throwaway data dir, lists it and compiles a sketch', async () => {
    const root =
      process.env.FALANG_ARDUINO_CORES_LIVE_DIR ?? (await mkdtemp(path.join(os.tmpdir(), 'falang-cores-live-')));
    const env = {
      ARDUINO_DIRECTORIES_DATA: path.join(root, 'data'),
      ARDUINO_DIRECTORIES_DOWNLOADS: path.join(root, 'downloads'),
      ARDUINO_DIRECTORIES_USER: path.join(root, 'user'),
    };
    Object.assign(process.env, env);
    expect(await listInstalledCores({ env })).toEqual({ ok: true, cores: [] });
    const lines: string[] = [];
    const installed = await installCore({ platformId: 'arduino:avr', env, onOutput: (line) => lines.push(line) });
    expect(installed).toEqual({ ok: true });
    const listed = await listInstalledCores({ env });
    expect(listed.ok && listed.cores.some((core) => core.id === 'arduino:avr')).toBe(true);
    process.stdout.write(`live: ${String(lines.length)} output lines; ${JSON.stringify(listed)}\n`);

    const { mkdir } = await import('node:fs/promises');
    const sketchDir = path.join(root, 'blink');
    await mkdir(sketchDir, { recursive: true });
    await writeFile(path.join(sketchDir, 'blink.ino'), 'void setup() {}\nvoid loop() {}\n');
    const compiled = await compileSketch({ sketchDir, fqbn: 'arduino:avr:uno' });
    expect(compiled.ok).toBe(true);

    const esp = await installCore({ platformId: 'esp32:esp32', env, additionalUrls: [], signal: AbortSignal.abort() });
    expect(esp.cancelled).toBe(true);
  }, 600_000);
});
