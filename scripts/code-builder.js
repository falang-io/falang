export class CodeBuilder {
  data = [];
  textIndent = 0;

  print(str) {
    this.data.push('  '.repeat(this.textIndent).concat(str));
  }

  get() {
    return this.data.join('\n');
  }

  indentPlus() {
    this.textIndent++;
  }

  indentMinus() {
    this.textIndent--;
  }
}
