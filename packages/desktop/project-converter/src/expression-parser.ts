import { compose, leaf, type IExprNode } from './expression-node.js';
import * as ops from './expression-operators.js';
import { tokenize, type IToken } from './expression-tokenizer.js';

/**
 * The recursive-descent parser behind `convert-expression.ts`'s `convertExpression` — split into its
 * own file purely to keep this under `oxlint`'s `max-lines`, same reasoning
 * `expression-tokenizer.ts`'s own module doc gives. See `convert-expression.ts`'s module doc for why
 * this exists instead of a real `mathjs` parse, and for the full operator-precedence/mapping table
 * this implements (mirroring https://mathjs.org/docs/expressions/syntax.html#operators).
 *
 * A class, not this package's usual arrow-const style: several levels are genuinely mutually
 * recursive (`parsePrimary`/`parseArgs` need the full grammar back via `parseAssignment` for a
 * parenthesized/array/object/call-argument sub-expression; `parseUnary`/`parsePow` call each other
 * directly for mathjs's `-2^2 = -(2^2)` quirk), and a `this.foo()` call resolves against the whole
 * prototype regardless of declaration order — so, unlike `convert-common.ts`'s own (single,
 * unavoidable) mutual recursion, this needs no `no-use-before-define` escape hatch anywhere.
 */

class ExpressionParser {
  private readonly tokens: IToken[];
  private readonly source: string;
  private pos = 0;

  constructor(source: string) {
    this.source = source;
    this.tokens = tokenize(source);
  }

  parse(): IExprNode {
    const root = this.parseAssignment();
    if (this.pos !== this.tokens.length) {
      const trailing = this.tokens[this.pos] as IToken;
      throw new Error(`Unexpected trailing token "${trailing.value}" at position ${trailing.start}`);
    }
    return root;
  }

  private peek(): IToken | undefined {
    return this.tokens[this.pos];
  }

  private advance(): IToken {
    const tok = this.tokens[this.pos];
    if (!tok) throw new Error('Unexpected end of expression');
    this.pos += 1;
    return tok;
  }

  private expectPunct(value: string): IToken {
    const tok = this.peek();
    if (!tok || tok.type !== 'punct' || tok.value !== value) throw new Error(`Expected "${value}"`);
    return this.advance();
  }

  /** A left-associative binary chain whose operator token may itself be rewritten (`opsTable[token] === null` keeps the original text, a string value replaces it) — covers every binary level except `xor`/`^`, which change the node's shape rather than just its operator token. */
  private binaryChain(next: () => IExprNode, opsTable: Record<string, string | null>): IExprNode {
    let left = next();
    for (;;) {
      const tok = this.peek();
      if (!tok || (tok.type !== 'ident' && tok.type !== 'punct') || !(tok.value in opsTable)) break;
      this.advance();
      const replacement = opsTable[tok.value] as string | null;
      const opText = replacement === null ? this.source.slice(tok.start, tok.end) : replacement;
      const opNode = leaf(tok.start, tok.end, opText);
      const right = next();
      left = compose(this.source, left.start, right.end, [left, opNode, right]);
    }
    return left;
  }

  private parseAssignment(): IExprNode {
    const left = this.parseTernary();
    const tok = this.peek();
    if (tok && tok.type === 'punct' && tok.value === '=') {
      this.advance();
      const right = this.parseAssignment();
      return compose(this.source, left.start, right.end, [left, right]);
    }
    return left;
  }

  private parseTernary(): IExprNode {
    const cond = this.parseLogicalOr();
    const tok = this.peek();
    if (tok && tok.type === 'punct' && tok.value === '?') {
      this.advance();
      const thenBranch = this.parseAssignment();
      this.expectPunct(':');
      const elseBranch = this.parseTernary();
      return compose(this.source, cond.start, elseBranch.end, [cond, thenBranch, elseBranch]);
    }
    return cond;
  }

  private parseLogicalOr(): IExprNode {
    return this.binaryChain(() => this.parseLogicalXor(), ops.OR_OPS);
  }

  /** Not a plain token swap like `and`/`or`/`mod` — the shape changes (a boolean-coerced strict-inequality wrapper), so this is hand-rolled rather than going through `binaryChain`. */
  private parseLogicalXor(): IExprNode {
    let left = this.parseLogicalAnd();
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.type !== 'ident' || tok.value !== 'xor') break;
      this.advance();
      const right = this.parseLogicalAnd();
      const leftNode = left;
      left = { start: leftNode.start, end: right.end, text: () => `(!!(${leftNode.text()}) !== !!(${right.text()}))` };
    }
    return left;
  }

  private parseLogicalAnd(): IExprNode {
    return this.binaryChain(() => this.parseBitwiseOr(), ops.AND_OPS);
  }

  private parseBitwiseOr(): IExprNode {
    return this.binaryChain(() => this.parseBitwiseAnd(), ops.BITOR_OPS);
  }

  private parseBitwiseAnd(): IExprNode {
    return this.binaryChain(() => this.parseRelational(), ops.BITAND_OPS);
  }

  private parseRelational(): IExprNode {
    return this.binaryChain(() => this.parseAdditive(), ops.REL_OPS);
  }

  private parseAdditive(): IExprNode {
    return this.binaryChain(() => this.parseMultiplicative(), ops.ADD_OPS);
  }

  private parseMultiplicative(): IExprNode {
    return this.binaryChain(() => this.parseUnary(), ops.MULT_OPS);
  }

  private parseUnary(): IExprNode {
    const tok = this.peek();
    if (tok && (tok.type === 'punct' || tok.type === 'ident') && tok.value in ops.UNARY_OPS) {
      this.advance();
      const replacement = ops.UNARY_OPS[tok.value] as string | null;
      const opText = replacement === null ? this.source.slice(tok.start, tok.end) : replacement;
      const operand = this.parseUnary();
      return compose(this.source, tok.start, operand.end, [leaf(tok.start, tok.end, opText), operand]);
    }
    return this.parsePow();
  }

  /** Right-associative and higher precedence than unary on its *left* operand only — `-2^2` is `-(2^2)`, matching mathjs, so the left side comes from `parsePostfix` while the right side goes back through `parseUnary` (allowing `2^-2`, and right-recursing into another `parsePow` for `a^b^c`). */
  private parsePow(): IExprNode {
    const left = this.parsePostfix();
    const tok = this.peek();
    if (tok && tok.type === 'punct' && tok.value === '^') {
      this.advance();
      const right = this.parseUnary();
      return { start: left.start, end: right.end, text: () => `Math.pow(${left.text()}, ${right.text()})` };
    }
    return left;
  }

  private parsePostfix(): IExprNode {
    let node = this.parsePrimary();
    let bareName: string | null = node.identName ?? null;
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.type !== 'punct') break;
      if (tok.value === '.') {
        node = this.parseMemberAccess(node);
        bareName = null;
        continue;
      }
      if (tok.value === '[') {
        node = this.parseIndexAccess(node);
        bareName = null;
        continue;
      }
      if (tok.value === '(') {
        node = this.parseCall(node, bareName);
        bareName = null;
        continue;
      }
      break;
    }
    return node;
  }

  private parseMemberAccess(node: IExprNode): IExprNode {
    this.advance();
    const propTok = this.peek();
    if (!propTok || propTok.type !== 'ident') throw new Error('Expected property name after "."');
    this.advance();
    return compose(this.source, node.start, propTok.end, [node]);
  }

  private parseIndexAccess(node: IExprNode): IExprNode {
    this.advance();
    const index = this.parseAssignment();
    const close = this.expectPunct(']');
    return compose(this.source, node.start, close.end, [node, index]);
  }

  /** A bare call to one of the old app's whitelisted expression functions rewrites to `Math.<fn>(...)`; every other call (including a call through a member expression, `obj.sin(x)`) passes through unchanged, matching the old generator's own `isFunctionNode` check (a bare `SymbolNode` callee only). */
  private parseCall(callee: IExprNode, bareName: string | null): IExprNode {
    this.advance();
    const args = this.parseArgs(')');
    const close = this.expectPunct(')');
    if (bareName && ops.OLD_EXPRESSION_FUNCTIONS.has(bareName)) {
      const fnName = bareName;
      const argTexts = args.map((arg) => arg.text());
      return { start: callee.start, end: close.end, text: () => `Math.${fnName}(${argTexts.join(', ')})` };
    }
    return compose(this.source, callee.start, close.end, [callee, ...args]);
  }

  private parseArgs(close: string): IExprNode[] {
    const args: IExprNode[] = [];
    const first = this.peek();
    if (first?.type === 'punct' && first.value === close) return args;
    for (;;) {
      args.push(this.parseAssignment());
      const sep = this.peek();
      if (sep?.type === 'punct' && sep.value === ',') {
        this.advance();
        continue;
      }
      break;
    }
    return args;
  }

  private parsePrimary(): IExprNode {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.type === 'num' || tok.type === 'str') {
      this.advance();
      return leaf(tok.start, tok.end, this.source.slice(tok.start, tok.end));
    }
    if (tok.type === 'ident') {
      this.advance();
      return {
        start: tok.start,
        end: tok.end,
        identName: tok.value,
        text: () => this.source.slice(tok.start, tok.end),
      };
    }
    if (tok.type === 'punct' && tok.value === '(') return this.parseParenGroup();
    if (tok.type === 'punct' && tok.value === '[') return this.parseArrayLiteral();
    if (tok.type === 'punct' && tok.value === '{') return this.parseObjectLiteral();
    throw new Error(`Unexpected token "${tok.value}" at position ${tok.start}`);
  }

  private parseParenGroup(): IExprNode {
    const open = this.advance();
    const inner = this.parseAssignment();
    const close = this.expectPunct(')');
    return compose(this.source, open.start, close.end, [inner]);
  }

  private parseArrayLiteral(): IExprNode {
    const open = this.advance();
    const items = this.parseArgs(']');
    const close = this.expectPunct(']');
    return compose(this.source, open.start, close.end, items);
  }

  /** Only values are tracked as rewritable "holes" — keys, colons, braces and commas are always literal (a key can never itself be an old-app expression), matching the "never translate an identifier/name" rule this whole module follows. */
  private parseObjectLiteral(): IExprNode {
    const open = this.advance();
    const values: IExprNode[] = [];
    const first = this.peek();
    if (!(first?.type === 'punct' && first.value === '}')) {
      for (;;) {
        const keyTok = this.peek();
        if (!keyTok || (keyTok.type !== 'ident' && keyTok.type !== 'str')) throw new Error('Expected object key');
        this.advance();
        this.expectPunct(':');
        values.push(this.parseAssignment());
        const sep = this.peek();
        if (sep?.type === 'punct' && sep.value === ',') {
          this.advance();
          continue;
        }
        break;
      }
    }
    const close = this.expectPunct('}');
    return compose(this.source, open.start, close.end, values);
  }
}

export const parseExpression = (source: string): IExprNode => new ExpressionParser(source).parse();
