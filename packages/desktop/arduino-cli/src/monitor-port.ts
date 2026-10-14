import type { autoDetect as autoDetectBinding } from '@serialport/bindings-cpp';
import type { SerialPortStream } from '@serialport/stream';

export interface IMonitorPortParams {
  readonly port: string;
  readonly baudrate?: number;
}

export interface IPortMonitor {
  readonly stdin: NodeJS.WritableStream;
  readonly stdout: NodeJS.ReadableStream;
  /** Closes the port; resolves once it is closed, so the same port can be opened again right away. Idempotent. */
  kill(): Promise<void>;
}

/** Also the baud rate a debug build's `falang_wait_attach()` must `Serial.begin()` at — see `compile-arduino-project.ts`'s `injectSetupDebugAttach`, which imports this rather than hardcoding a second copy of the number. */
export const DEFAULT_BAUDRATE = 115_200;

/**
 * Loaded on first use, never at module load: this package is also bundled (through
 * `@falang/desktop-arduino-compiler`) into esbuild bundles that never open a port — the Arduino app's
 * compile worker and `@falang/desktop-mcp` — and `@serialport/bindings-cpp` loads its native `.node`
 * file the moment it is required. Those bundles mark both packages `external`.
 */
const loadSerialPort = async (): Promise<{
  readonly SerialPortStream: typeof SerialPortStream;
  readonly autoDetect: typeof autoDetectBinding;
}> => {
  const [{ SerialPortStream: Stream }, { autoDetect }] = await Promise.all([
    import('@serialport/stream'),
    import('@serialport/bindings-cpp'),
  ]);
  return { SerialPortStream: Stream, autoDetect };
};

/**
 * Whether `monitorPort` can work here: whether `@serialport/bindings-cpp`'s native addon loads for
 * this OS/architecture. It ships prebuilds for Linux, macOS and Windows (x64 and arm64), so `false`
 * means a broken install or package (e.g. the `.node` file left inside `app.asar`) — the build panel
 * then disables "Upload (debug)" with a hint instead of failing when a session starts.
 */
export const isSerialMonitorSupported = async (): Promise<boolean> => {
  try {
    const { autoDetect } = await loadSerialPort();
    autoDetect();
    return true;
  } catch {
    return false;
  }
};

/** A close failure (the device already vanished) still leaves the port closed for our purposes. */
const ignoreCloseError = (): void => {
  // Intentionally empty.
};

/**
 * A long-lived bidirectional serial channel over the same USB port `uploadSketch` just flashed
 * through, opened with `@serialport/stream` + `@serialport/bindings-cpp` (a N-API native addon with
 * prebuilds for Linux, macOS and Windows, loaded without a rebuild under Electron). Resolves once the
 * port is open and rejects with the binding's own error (no such port, busy, no permission) — so a
 * failure surfaces to the caller instead of as a stream `error` later. The returned monitor's
 * `stdin`/`stdout` are the same duplex stream; `stdout` emits `close` when the port closes, either
 * through `kill()` or because the board was unplugged.
 *
 * Opening the port asserts DTR, which resets an Uno-class board — the firmware's
 * `falang_wait_attach()` re-sends its `R` line until the host answers, so that's harmless.
 *
 * History (ADR 0021 (private), 2026-09-21; ADR 0050 (private)) — every earlier transport was POSIX-only:
 *
 * - **Was** piping `arduino-cli monitor`'s own stdin/stdout. Writes to that process's stdin never
 *   reached the device when it was driven by another process (a plain pipe, a pseudo-terminal as
 *   stdin only and a fully-interactive pseudo-terminal all failed identically).
 * - **Then** `stty` + `fs.createReadStream`/`createWriteStream` on the device path: `fs.read` is a
 *   *blocking* `read(2)` on a libuv threadpool thread, so a silent board kept that thread in the
 *   kernel, `destroy()` couldn't interrupt it and `process.exit()` hung.
 * - **Then** `stty` + `node:tty` streams over one `O_RDWR | O_NOCTTY` descriptor — non-blocking and
 *   verified on a real Uno, but with no Windows equivalent (no `stty`, no tty devices).
 *
 * `@serialport/bindings-cpp` reads without blocking a pool thread on every OS (an event-loop poller on
 * Linux/macOS, overlapped I/O on Windows), and closing a silent port lets the process exit at once.
 * On Linux/macOS it opens the device with `O_NOCTTY` too, so unplugging the board can't `SIGHUP` a
 * GUI-launched Electron main.
 *
 * The caller owns framing/parsing on top of this raw byte stream (see the Arduino app's
 * `SerialDebugSession`, which speaks `falang_debug.h`'s wire protocol over it) — this module only
 * knows how to open and close the channel.
 */
export const monitorPort = async ({ port, baudrate = DEFAULT_BAUDRATE }: IMonitorPortParams): Promise<IPortMonitor> => {
  const { SerialPortStream: Stream, autoDetect } = await loadSerialPort();
  const serial = await new Promise<SerialPortStream>((resolve, reject) => {
    const opened: SerialPortStream = new Stream({ binding: autoDetect(), path: port, baudRate: baudrate }, (error) => {
      if (error) reject(error);
      else resolve(opened);
    });
  });
  // An unhandled `error` event would crash the Electron main process. Read/write failures after open
  // (a write after the port closed, an unplugged board) end the session instead: closing the port
  // fires `close`, which `SerialDebugSession` already reports as a terminated session.
  serial.on('error', () => {
    if (serial.isOpen) serial.close(ignoreCloseError);
  });
  let closing: Promise<void> | null = null;
  return {
    stdin: serial,
    stdout: serial,
    kill: () => {
      closing ??= new Promise<void>((resolve) => {
        if (!serial.isOpen) {
          serial.destroy();
          resolve();
          return;
        }
        // A close error (the device already vanished) still leaves the port closed for our purposes.
        serial.close(() => resolve());
      });
      return closing;
    },
  };
};
