// oxlint-disable init-declarations, no-undefined, unicorn/no-await-expression-member, unicorn/no-array-sort -- test code
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findFreePort } from '../temporal/temporal-dev-server.js';
import { startSupervisedProcess, tsxEntryCommand, type ISupervisedProcess } from './supervisor.js';

/** A tiny HTTP server on PORT; ignores SIGTERM when IGNORE_TERM is set (to exercise the SIGKILL fallback). */
const SERVER_SCRIPT = `
const http = require('node:http');
if (process.env.IGNORE_TERM) process.on('SIGTERM', () => console.log('ignoring SIGTERM'));
console.log('booting');
http.createServer((req, res) => res.end('ok')).listen(Number(process.env.PORT), '127.0.0.1', () => console.log('listening'));
`;

const EXIT_SCRIPT = `console.log('line one'); console.error('fatal: no config'); process.exit(3);`;

describe('startSupervisedProcess', () => {
  let dir: string;
  const started: ISupervisedProcess[] = [];
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'falang-supervisor-'));
    await writeFile(path.join(dir, 'server.cjs'), SERVER_SCRIPT);
    await writeFile(path.join(dir, 'exit.cjs'), EXIT_SCRIPT);
  });
  afterEach(async () => {
    await Promise.all(started.splice(0).map((p) => p.stop()));
  });

  it('waits for the HTTP URL, prefixes output, and stops with SIGTERM', async () => {
    const port = await findFreePort();
    const lines: string[] = [];
    const proc = await startSupervisedProcess({
      name: 'demo',
      command: process.execPath,
      args: [path.join(dir, 'server.cjs')],
      env: { ...process.env, PORT: String(port) },
      log: (line) => lines.push(line),
      ready: { url: `http://127.0.0.1:${port}/` },
    });
    started.push(proc);
    expect(proc.pid).toBeTypeOf('number');
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('ok');
    expect(lines).toContain('[demo] listening');
    await proc.stop();
    expect((await proc.exited).signal).toBe('SIGTERM');
  });

  it('waits for a TCP port', async () => {
    const port = await findFreePort();
    const proc = await startSupervisedProcess({
      name: 'tcp',
      command: process.execPath,
      args: [path.join(dir, 'server.cjs')],
      env: { ...process.env, PORT: String(port) },
      log: () => null,
      ready: { port },
    });
    started.push(proc);
    expect(proc.outputTail()).toContain('listening');
  });

  it('fails with the output tail when the child exits before it is ready', async () => {
    const port = await findFreePort();
    await expect(
      startSupervisedProcess({
        name: 'broken',
        command: process.execPath,
        args: [path.join(dir, 'exit.cjs')],
        log: () => null,
        ready: { port },
        readyTimeoutMs: 10_000,
      }),
    ).rejects.toThrow(
      /broken exited \(code 3, signal null\) before it was ready; last output:\n[\s\S]*fatal: no config/,
    );
  });

  it('fails clearly when the command does not exist', async () => {
    await expect(
      startSupervisedProcess({
        name: 'missing',
        command: path.join(dir, 'no-such-binary'),
        log: () => null,
        ready: { port: 1 },
      }),
    ).rejects.toThrow(/missing could not be started: .*ENOENT/);
  });

  it('kills a child that is not ready in time', async () => {
    const port = await findFreePort();
    const unusedPort = await findFreePort();
    await expect(
      startSupervisedProcess({
        name: 'slow',
        command: process.execPath,
        args: [path.join(dir, 'server.cjs')],
        env: { ...process.env, PORT: String(port) },
        log: () => null,
        ready: { port: unusedPort },
        readyTimeoutMs: 1000,
      }),
    ).rejects.toThrow(`slow did not answer on 127.0.0.1:${unusedPort} within 1000 ms`);
  });

  it('falls back to SIGKILL when SIGTERM is ignored', async () => {
    const port = await findFreePort();
    const proc = await startSupervisedProcess({
      name: 'stubborn',
      command: process.execPath,
      args: [path.join(dir, 'server.cjs')],
      env: { ...process.env, PORT: String(port), IGNORE_TERM: '1' },
      log: () => null,
      ready: { url: `http://127.0.0.1:${port}/` },
      stopTimeoutMs: 500,
    });
    await proc.stop();
    expect((await proc.exited).signal).toBe('SIGKILL');
  });

  it('reports an exit after readiness through onUnexpectedExit, but not after stop()', async () => {
    const port = await findFreePort();
    const onUnexpectedExit = vi.fn();
    const proc = await startSupervisedProcess({
      name: 'crashy',
      command: process.execPath,
      args: [path.join(dir, 'server.cjs')],
      env: { ...process.env, PORT: String(port) },
      log: () => null,
      ready: { url: `http://127.0.0.1:${port}/` },
      onUnexpectedExit,
    });
    process.kill(proc.pid ?? 0, 'SIGKILL');
    await proc.exited;
    await vi.waitFor(() => expect(onUnexpectedExit).toHaveBeenCalledOnce());
    expect(String(onUnexpectedExit.mock.calls[0]?.[0])).toContain('crashy exited unexpectedly');

    const port2 = await findFreePort();
    const onExit2 = vi.fn();
    const proc2 = await startSupervisedProcess({
      name: 'calm',
      command: process.execPath,
      args: [path.join(dir, 'server.cjs')],
      env: { ...process.env, PORT: String(port2) },
      log: () => null,
      ready: { port: port2 },
      onUnexpectedExit: onExit2,
    });
    await proc2.stop();
    expect(onExit2).not.toHaveBeenCalled();
  });

  it('runs a TypeScript entry point through tsxEntryCommand', async () => {
    const entry = path.join(dir, 'hello.ts');
    await writeFile(entry, `const message: string = 'from ts'; console.log(message); setInterval(() => null, 1000);`);
    const lines: string[] = [];
    const command = tsxEntryCommand(entry);
    expect(command.command).toBe(process.execPath);
    expect(command.args[0]).toBe('--import');
    expect(command.args[1]).toMatch(/^file:/);
    const proc = await startSupervisedProcess({ name: 'ts', ...command, log: (line) => lines.push(line) });
    started.push(proc);
    await vi.waitFor(() => expect(lines).toContain('[ts] from ts'), { timeout: 10_000 });
  });
});
