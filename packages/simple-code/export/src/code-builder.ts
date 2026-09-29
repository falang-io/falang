/**
 * Indent-tracking string accumulator, ported from the old app's `CodeBuilder`
 * (`old/packages/editor/scheme/src/common/utils/CodeBuilder.ts`) — trimmed to the 7 members the
 * generators actually use. 2-space indent unit.
 */
export class CodeBuilder {
  private readonly lines: string[] = [];
  private indent = 0;

  /** Splits on `\n` and re-prints each line at the current indent — this is what correctly
   * re-indents multi-line raw user code pasted into a single node's `data`. */
  print(str: string): void {
    if (str.includes('\n')) {
      str.split('\n').forEach((line) => this.print(line));
      return;
    }
    this.lines.push('  '.repeat(this.indent) + str);
  }

  indentPlus(): void {
    this.indent += 1;
  }

  indentMinus(): void {
    this.indent = Math.max(0, this.indent - 1);
  }

  openQuote(): void {
    this.print('{');
    this.indentPlus();
  }

  closeQuote(): void {
    this.indentMinus();
    this.print('}');
  }

  get indentValue(): number {
    return this.indent;
  }

  get(): string {
    return `${this.lines.join('\n')}\n`;
  }
}
