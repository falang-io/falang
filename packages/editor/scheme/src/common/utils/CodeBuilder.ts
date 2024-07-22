export class CodeBuilder {

  private data: string[] = []
  private textIndent = 0

  print(str: string): void {
    if (str.indexOf('\n') !== -1) {
      str.split('\n').forEach((item) => this.print(item));
      return;
    }
    this.data.push("  ".repeat(this.textIndent).concat(str))
  }

  appendBuilder(builder: CodeBuilder) {
    this.print(builder.get());
  }

  p(...str: string[]): void {
    if (!str.length) this.print('');
    str.forEach((s) => this.print(s));
  }

  pp(str: string[], b2?: CodeBuilder): void {
    this.p(...str);
    if (b2) b2.p(...str);
  }

  getPrint(): { (str: string): void } {
    return this.print.bind(this)
  }

  get(): string {
    return this.data.join("\n").concat('\n');
  }

  indentPlus(b2?: CodeBuilder): void {
    this.textIndent++
    if (b2) b2.indentPlus();
  }

  plus() {
    this.indentPlus();
  }

  minus() {
    this.indentMinus();
  }

  indentMinus(b2?: CodeBuilder): void {
    this.textIndent--
    if (b2) b2.indentMinus();
  }

  openQuote(b2?: CodeBuilder): void {
    this.print('{');
    this.indentPlus();
    if (b2) b2.openQuote();
  }

  closeQuote(b2?: CodeBuilder): void {
    this.indentMinus()
    this.print('}');
    if (b2) b2.closeQuote();
  }

  get indentValue() {
    return this.textIndent;
  }

  inlineComment(comment: string) {
    comment.split('\n').forEach((line) => {
      this.print(`// ${line}`);
    });
  }

  bigComment(comment: string[], b2?: CodeBuilder) {
    const arr = comment.join('\n').trim().split('\n');
    const cb = this;
    cb.p('/**');
    for (const item of arr) {
      cb.p(` * ${item}`);
    }
    cb.p(' **/');
    if (b2) b2.bigComment(comment);
  }
}