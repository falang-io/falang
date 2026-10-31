/** The last `max` lines of a child's output, for the error screen. */
export class LogTail {
  private lines: string[] = [];
  private readonly max: number;

  constructor(max = 200) {
    this.max = max;
  }

  push(chunk: string): void {
    const incoming = chunk.split(/\r?\n/).filter((line) => line.length > 0);
    this.lines = [...this.lines, ...incoming].slice(-this.max);
  }

  text(): string {
    return this.lines.join('\n');
  }
}
