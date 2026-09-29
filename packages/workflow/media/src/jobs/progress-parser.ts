export interface IProgressUpdate {
  /** Microseconds of output produced so far — `0` both for "genuinely at the start" and for "no
   * `out_time_ms` line has been seen yet in this block"; the two are indistinguishable and that's
   * fine, since either way there's no progress to report yet. */
  readonly outTimeMs: number;
  readonly done: boolean;
}

/** ffmpeg's `-progress pipe:1` writes repeated `key=value\n` blocks to stdout, each block ending
 * in a `progress=continue`/`progress=end` line — this is a small stateful line-splitter since a
 * chunk boundary from a real pipe never lines up with a block (or even a line) boundary. */
export class ProgressStreamParser {
  private buffer = '';
  private lastOutTimeMs = 0;

  feed(chunk: string, onUpdate: (update: IProgressUpdate) => void): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) this.consumeLine(line, onUpdate);
  }

  private consumeLine(line: string, onUpdate: (update: IProgressUpdate) => void): void {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) return;
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    if (key === 'out_time_ms') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) this.lastOutTimeMs = parsed;
      return;
    }
    if (key === 'progress') onUpdate({ outTimeMs: this.lastOutTimeMs, done: value === 'end' });
  }
}
