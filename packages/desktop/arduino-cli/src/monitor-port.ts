import { execFileSync } from 'node:child_process';
import { closeSync, constants, openSync } from 'node:fs';
import { ReadStream, WriteStream } from 'node:tty';

export interface IMonitorPortParams {
  readonly port: string;
  readonly baudrate?: number;
}

export interface IPortMonitor {
  readonly stdin: NodeJS.WritableStream;
  readonly stdout: NodeJS.ReadableStream;
  kill(): void;
}

/** Also the baud rate a debug build's `falang_wait_attach()` must `Serial.begin()` at — see `compile-arduino-project.ts`'s `injectSetupDebugAttach`, which imports this rather than hardcoding a second copy of the number. */
export const DEFAULT_BAUDRATE = 115_200;

/**
 * A long-lived bidirectional serial channel over the same USB port `uploadSketch` just flashed
 * through — no subprocess, no native addon: `stty` configures the port's line discipline (`raw`, no
 * echo, the given baud rate), then the device file is opened once (`O_RDWR | O_NOCTTY`) and read and
 * written through `node:tty`'s `ReadStream`/`WriteStream` — the exact machinery Node itself uses for
 * `process.stdin`/`process.stdout` when they are a terminal, and the only way to talk to a tty
 * device from Node without a blocking read (libuv re-opens the device in non-blocking mode and
 * polls it on the event loop).
 *
 * History, both found on real Uno hardware (ADR 0021 (private), 2026-09-21):
 *
 * - **Was** piping `arduino-cli monitor`'s own stdin/stdout, per the ADR's §6 original design.
 *   Writes to that process's stdin never reached the device when it was driven by another process —
 *   a plain pipe, a pseudo-terminal as stdin only, and a fully-interactive pseudo-terminal all
 *   failed identically — so `arduino-cli` was dropped from this path entirely.
 * - **Then** `fs.createReadStream`/`createWriteStream` on the device path. Those work while the
 *   board is talking, but `fs.read` runs as a *blocking* `read(2)` on a libuv threadpool thread: a
 *   silent board (paused at a breakpoint, or unplugged) leaves that thread stuck in the kernel for
 *   as long as no byte arrives, `destroy()` can't interrupt it, and Node's own exit then waits on the
 *   threadpool forever — `process.exit()` after `kill()` hung a scratch process outright. Each
 *   stop/start cycle against a silent board also leaked one of the pool's four threads and left a
 *   zombie reader racing the new session for the next bytes.
 *
 * `O_NOCTTY` matters: the Electron main process may well be a session leader without a controlling
 * terminal (any GUI launch), and a session leader opening a tty without that flag *acquires* it as
 * its controlling terminal — after which unplugging the board (a tty hangup) would `SIGHUP` the
 * whole app. Verified under `setsid` that nothing here acquires one.
 *
 * POSIX-only (`stty -F` and its flag names are GNU/BSD `stty`, present on Linux and macOS, not
 * Windows) — a real, currently undocumented gap for a Windows host, left as a known follow-up rather
 * than guessed at without a Windows machine to verify against.
 *
 * The caller owns framing/parsing on top of this raw byte stream (see the Arduino app's
 * `SerialDebugSession`, which speaks `falang_debug.h`'s wire protocol over it) — this module only
 * knows how to open and close the channel.
 */
const openStreams = (fd: number): { readonly stdout: ReadStream; readonly stdin: WriteStream } => {
  const stdout = new ReadStream(fd);
  try {
    return { stdout, stdin: new WriteStream(fd) };
  } catch (error) {
    stdout.destroy();
    throw error;
  }
};

export const monitorPort = ({ port, baudrate = DEFAULT_BAUDRATE }: IMonitorPortParams): IPortMonitor => {
  execFileSync('stty', ['-F', port, 'raw', String(baudrate), '-echo']);
  // oxlint-disable-next-line no-bitwise -- `open(2)` flags are a bitmask by definition
  const fd = openSync(port, constants.O_RDWR | constants.O_NOCTTY);
  const streams = ((): ReturnType<typeof openStreams> => {
    try {
      return openStreams(fd);
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  })();
  let closed = false;
  return {
    stdin: streams.stdin,
    stdout: streams.stdout,
    kill: () => {
      if (closed) return;
      closed = true;
      streams.stdout.destroy();
      streams.stdin.destroy();
      // libuv re-opened the device by path for each stream (see above), so the original descriptor is
      // ours alone to close — the streams' own handles close theirs.
      closeSync(fd);
    },
  };
};
