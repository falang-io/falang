import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSerialMonitorSupported, monitorPort, sttyArgs } from './monitor-port.js';

/**
 * A pseudo-terminal pair standing in for the serial device: python's `pty.openpty()` (python3 is
 * assumed present on any host that can run these tests, same as `stty`/`sh`), the *slave* side's
 * path handed to `monitorPort` exactly like `/dev/ttyUSB0` would be, and the helper echoing every
 * byte that reaches the master side straight back — the one property a serial device has that these
 * tests need ("what's written comes back out"), on a real tty so `stty -F` genuinely configures it
 * and `node:tty`'s streams take the exact code path they take on real hardware (a FIFO, this file's
 * previous stand-in, isn't a tty at all — `tty.ReadStream` would fall back to a different, shared-fd
 * path there and never exercise the real one). What this still can't verify is the actual UART
 * behavior (baud rate, DTR reset) — see `monitor-port.ts`'s doc comment for what was only ever
 * confirmed against a real Uno. The slave is put into raw mode by the helper itself: `stty` is faked
 * below, and a default-mode slave echoes (ECHO/ICANON/ONLCR) on its own, which under load interleaves
 * with the helper's echo (seen as `pingping\n`).
 */
const PTY_HELPER = `
import os, pty, sys, select, tty
master, slave = pty.openpty()
tty.setraw(slave)
sys.stdout.write(os.ttyname(slave) + "\\n"); sys.stdout.flush()
while True:
    ready, _, _ = select.select([master, sys.stdin.fileno()], [], [])
    if sys.stdin.fileno() in ready:
        break
    data = os.read(master, 1024)
    if not data:
        break
    os.write(master, data)
`;

describe('sttyArgs', () => {
  it('uses GNU -F on Linux and BSD -f on macOS', () => {
    expect(sttyArgs('/dev/ttyACM0', 9600, 'linux')).toEqual(['-F', '/dev/ttyACM0', 'raw', '9600', '-echo']);
    expect(sttyArgs('/dev/cu.usbmodem1', 115_200, 'darwin')).toEqual([
      '-f',
      '/dev/cu.usbmodem1',
      'raw',
      '115200',
      '-echo',
    ]);
  });
});

describe('isSerialMonitorSupported', () => {
  it('is false only on Windows', () => {
    expect(isSerialMonitorSupported('linux')).toBe(true);
    expect(isSerialMonitorSupported('darwin')).toBe(true);
    expect(isSerialMonitorSupported('win32')).toBe(false);
  });
});

describe('monitorPort', () => {
  // oxlint-disable-next-line init-declarations
  let fakeBinDir: string;
  // oxlint-disable-next-line init-declarations
  let originalPath: string | undefined;
  // oxlint-disable-next-line init-declarations
  let helper: ChildProcess;
  // oxlint-disable-next-line init-declarations
  let ptyPath: string;
  // oxlint-disable-next-line init-declarations
  let sttyArgsFile: string;

  beforeEach(async () => {
    // `monitorPort` shells out to the real `stty` binary (resolved via `PATH`) to configure the port
    // before opening it — shadowed with a fake that records its argv, the same "real executable on a
    // temp `PATH` entry" convention `exec-file-async.test.ts` uses, rather than mocking `node:child_process`.
    fakeBinDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-cli-fake-bin-'));
    sttyArgsFile = path.join(fakeBinDir, 'stty-args.txt');
    const scriptPath = path.join(fakeBinDir, 'stty');
    await fs.writeFile(scriptPath, `#!/bin/sh\necho "$@" > ${sttyArgsFile}\n`);
    await fs.chmod(scriptPath, 0o755);
    originalPath = process.env.PATH;
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ''}`;

    helper = spawn('python3', ['-c', PTY_HELPER], { stdio: ['pipe', 'pipe', 'inherit'] });
    ptyPath = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      helper.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const newline = buffer.indexOf('\n');
        if (newline !== -1) resolve(buffer.slice(0, newline));
      });
      helper.on('error', reject);
      helper.on('exit', (code) => reject(new Error(`pty helper exited early (${String(code)})`)));
    });
  });

  afterEach(async () => {
    helper.stdin?.end();
    helper.kill();
    process.env.PATH = originalPath;
    await fs.rm(fakeBinDir, { recursive: true, force: true });
  });

  it('configures the port via stty (raw, the given baud rate, no echo) before opening it', async () => {
    monitorPort({ port: ptyPath, baudrate: 9600 }).kill();
    expect(await fs.readFile(sttyArgsFile, 'utf8')).toBe(`-F ${ptyPath} raw 9600 -echo\n`);
  });

  it('defaults to 115200 baud — the rate a debug build`s Serial.begin() is generated with', async () => {
    monitorPort({ port: ptyPath }).kill();
    expect(await fs.readFile(sttyArgsFile, 'utf8')).toBe(`-F ${ptyPath} raw 115200 -echo\n`);
  });

  it('opens a bidirectional channel: whatever is written to stdin comes back out of stdout', async () => {
    const monitor = monitorPort({ port: ptyPath });
    try {
      const received = new Promise<string>((resolve) => {
        let buffer = '';
        monitor.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          if (buffer.includes('\n')) resolve(buffer);
        });
      });
      monitor.stdin.write('ping\n');
      expect(await received).toBe('ping\n');
    } finally {
      monitor.kill();
    }
  });

  it('kill() closes the read side promptly even while the device is silent, and is idempotent', async () => {
    const monitor = monitorPort({ port: ptyPath });
    const closed = new Promise<void>((resolve) => {
      monitor.stdout.on('close', () => resolve());
    });
    monitor.kill();
    monitor.kill();
    await closed;
  });
});
