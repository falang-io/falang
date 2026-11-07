import type { IProcessSpawner } from './ffmpeg-process.js';
import { ProgressStreamParser } from './progress-parser.js';

export interface IRunFfmpegOptions {
  readonly spawner: IProcessSpawner;
  readonly argv: readonly string[];
  /** ffmpeg binary (`IMediaServiceConfig.ffmpegPath`); default `ffmpeg` from `PATH`. */
  readonly ffmpegPath?: string;
  /** `nice` to run ffmpeg under (`IMediaServiceConfig.niceCommand`); `null`/absent runs ffmpeg directly. */
  readonly niceCommand?: string | null;
  readonly timeoutMs: number;
  /** Total duration of the primary input, for turning `out_time_ms` into a 0..1 fraction — `0`
   * (a still image, or a probe that couldn't determine one) means progress just never advances
   * past 0 until the process exits, rather than dividing by zero. */
  readonly durationSeconds: number;
  readonly onProgress: (fraction: number) => void;
  /** Called once the child is spawned, so the caller can wire cancellation (`IJob.kill`) through to
   * it — a plain return value would arrive too late, since the ffmpeg process needs to exist
   * before anything outside this function can kill it. */
  readonly registerKill: (kill: () => void) => void;
}

export interface IRunFfmpegResult {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stderr: string;
}

/** The command and argv that run ffmpeg: `nice -n 10 <ffmpeg> …` when a `nice` is given, else ffmpeg directly. */
export const buildFfmpegCommand = (
  argv: readonly string[],
  ffmpegPath = 'ffmpeg',
  niceCommand: string | null = null,
): { readonly command: string; readonly args: readonly string[] } =>
  niceCommand ? { command: niceCommand, args: ['-n', '10', ffmpegPath, ...argv] } : { command: ffmpegPath, args: argv };

/** Wraps ffmpeg with `nice -n 10` where available (the ADR's own CPU-priority sketch), a wall-clock
 * timeout that `SIGKILL`s on expiry, and `-progress pipe:1` parsing. Never touches a shell — `argv`
 * is always a plain array, `nice`/ffmpeg come from the service's own config (never from a job), so
 * nothing here can be used to inject an arbitrary command. */
export const runFfmpeg = (options: IRunFfmpegOptions): Promise<IRunFfmpegResult> =>
  new Promise((resolve) => {
    const { command, args } = buildFfmpegCommand(options.argv, options.ffmpegPath, options.niceCommand);
    const proc = options.spawner.spawn(command, args);
    options.registerKill(() => proc.kill('SIGKILL'));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, options.timeoutMs);

    const parser = new ProgressStreamParser();
    proc.stdout.on('data', (chunk: Buffer) => {
      parser.feed(chunk.toString('utf8'), (update) => {
        if (update.done) {
          options.onProgress(1);
          return;
        }
        if (options.durationSeconds > 0) {
          options.onProgress(Math.min(1, update.outTimeMs / 1_000_000 / options.durationSeconds));
        }
      });
    });

    const stderrChunks: Buffer[] = [];
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    proc.onExit((code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, timedOut, stderr: Buffer.concat(stderrChunks).toString('utf8') });
    });
  });
