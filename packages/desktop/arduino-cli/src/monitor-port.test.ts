import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSerialMonitorSupported, monitorPort, type IPortMonitor } from './monitor-port.js';

/**
 * A pseudo-terminal pair standing in for the serial device: python's `pty.openpty()` (python3 is
 * assumed present on any host that can run these tests, same as `stty`/`sh`), the *slave* side's
 * path handed to `monitorPort` exactly like `/dev/ttyUSB0` would be, and the helper echoing every
 * byte that reaches the master side straight back — the one property a serial device has that these
 * tests need ("what's written comes back out"), on a real tty, so `@serialport/bindings-cpp` configures it (termios) and
 * reads it exactly as it does a USB serial device on Linux/macOS. What this still can't verify is the actual UART
 * behavior (baud rate, DTR reset) — see `monitor-port.ts`'s doc comment for what was only ever
 * confirmed against a real Uno. The slave is put into raw mode by the helper itself: a default-mode slave
 * echoes (ECHO/ICANON/ONLCR) on its own, which under load interleaves with the helper's echo (seen as
 * `pingping\n`). POSIX-only: the Windows binding is exercised by the packaged-app smoke test, a real
 * COM port only by hand.
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

describe('isSerialMonitorSupported', () => {
  it('is true where the native serial port addon loads', async () => {
    expect(await isSerialMonitorSupported()).toBe(true);
  });
});

const readLine = (monitor: IPortMonitor): Promise<string> =>
  new Promise<string>((resolve) => {
    let buffer = '';
    monitor.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('\n')) resolve(buffer);
    });
  });

describe.skipIf(process.platform === 'win32')('monitorPort', () => {
  // oxlint-disable-next-line init-declarations
  let helper: ChildProcess;
  // oxlint-disable-next-line init-declarations
  let ptyPath: string;

  beforeEach(async () => {
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

  afterEach(() => {
    helper.stdin?.end();
    helper.kill();
  });

  it('opens a bidirectional channel: whatever is written to stdin comes back out of stdout', async () => {
    const monitor = await monitorPort({ port: ptyPath });
    try {
      const received = readLine(monitor);
      monitor.stdin.write('ping\n');
      expect(await received).toBe('ping\n');
    } finally {
      await monitor.kill();
    }
  });

  it.runIf(process.platform === 'linux')(
    'sets the given baud rate, 115200 by default — the rate a debug build`s Serial.begin() uses',
    async () => {
      const speed = (): string => execFileSync('stty', ['-F', ptyPath, 'speed'], { encoding: 'utf8' }).trim();
      const slow = await monitorPort({ port: ptyPath, baudrate: 9600 });
      expect(speed()).toBe('9600');
      await slow.kill();
      const fast = await monitorPort({ port: ptyPath });
      expect(speed()).toBe('115200');
      await fast.kill();
    },
  );

  it('rejects when the port does not exist', async () => {
    await expect(monitorPort({ port: '/dev/falang-no-such-port' })).rejects.toThrow();
  });

  it('kill() closes promptly even while the device is silent, is idempotent, and frees the port', async () => {
    const monitor = await monitorPort({ port: ptyPath });
    const closed = new Promise<void>((resolve) => {
      monitor.stdout.on('close', () => resolve());
    });
    const first = monitor.kill();
    expect(monitor.kill()).toBe(first);
    await first;
    await closed;

    // The binding locks the port while it is open (TIOCEXCL), so reopening only works once it is released.
    const again = await monitorPort({ port: ptyPath });
    const received = readLine(again);
    again.stdin.write('pong\n');
    expect(await received).toBe('pong\n');
    await again.kill();
  });
});
