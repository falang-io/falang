import type { IProcessSpawner } from './ffmpeg-process.js';

/** One cached resolver per `createApp()` call (not a module-level global) — so tests get a fresh
 * cache per app instance instead of leaking a version string across suites. `GET /health` never
 * takes a token, so this is the whole handler's job. */
export const createFfmpegVersionResolver = (spawner: IProcessSpawner): (() => Promise<string>) => {
  let cached: string | null = null;
  return async () => {
    if (cached !== null) return cached;
    const proc = spawner.spawn('ffmpeg', ['-version']);
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve) => {
      proc.onExit(() => resolve());
    });
    const firstLine = Buffer.concat(chunks).toString('utf8').split('\n')[0] ?? 'unknown';
    cached = firstLine;
    return cached;
  };
};
