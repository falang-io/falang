// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import { COMMENT_NAME, type INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { nanoid } from 'nanoid';
import ts from 'typescript';
import { FOOTER_MARK, JUMP_KINDS, MAGIC_END, MAGIC_START } from './projector.js';
import { templateBodyFromSource } from './template-body.js';
import { parseType, TypeTextError } from './type-text.js';
import { ProjectionError, type IParser, type IProjectionContext, type TJumpFrameKind } from './types.js';

interface IFrame {
  readonly kind: 'loop' | 'switch';
  readonly label?: string;
}

type TItem =
  | { readonly kind: 'comment'; readonly text: string; readonly pos: number; readonly isLine: boolean }
  | {
      readonly kind: 'directive';
      readonly name: string;
      readonly count: number;
      readonly pos: number;
      readonly end: number;
    }
  | { readonly kind: 'statement'; readonly statement: ts.Statement };

/** A `/*@name N*\/` directive comment — marks a statement whose canonical code form would parse as another kind. */
const DIRECTIVE = /^\/\*@([a-z][\w-]*)(?:\s+(\d+))?\s*\*\/$/;

const SUPPORTED_HINT =
  'Supported statements: let/const declarations, expression statements, if/else, while, for…of, ' +
  '`for (let i = a; i <= b; i++)`, `while (true) { …; break; }` (run-once block), switch with `case …: { …; break; }`, ' +
  'return, throw, break/continue (with a loop label for outer loops), `await Promise.all([...])`, comments.';

export interface IParsedList {
  readonly nodes: INode[];
  /** The text of a trailing `// @footer: …` line (a function document's footer), when present. */
  readonly footer?: string;
}

export class Parser implements IParser {
  readonly source: ts.SourceFile;
  readonly types: IProjectionContext['types'];
  readonly stack: IProjectionContext['stack'];
  private readonly ctx: IProjectionContext;
  private readonly fileName: string;
  private readonly frames: IFrame[] = [];
  private pendingLabel: string | undefined;

  constructor(source: ts.SourceFile, ctx: IProjectionContext, fileName = source.fileName) {
    this.source = source;
    this.ctx = ctx;
    this.types = ctx.types;
    this.stack = ctx.stack;
    this.fileName = fileName;
  }

  newId(): string {
    return nanoid();
  }

  fail(node: ts.Node, message: string): never {
    const start = node.pos >= 0 && node.end >= node.pos ? node.getStart(this.source) : 0;
    const { line, character } = this.source.getLineAndCharacterOfPosition(start);
    throw new ProjectionError([{ column: character + 1, file: this.fileName, line: line + 1, message }]);
  }

  /** Indentation of the line `pos` sits on. */
  private lineIndent(pos: number): number {
    const lineStart = this.source.text.lastIndexOf('\n', pos - 1) + 1;
    let i = lineStart;
    while (this.source.text[i] === ' ' || this.source.text[i] === '\t') i += 1;
    return i - lineStart;
  }

  /** Removes the statement's own indentation from continuation lines (the projector adds it to every line). */
  private dedent(text: string, pos: number): string {
    if (!text.includes('\n')) return text;
    const amount = this.lineIndent(pos);
    const prefix = new RegExp(`^[ \\t]{0,${amount}}`);
    return text
      .split('\n')
      .map((line, index) => (index === 0 ? line : line.replace(prefix, '')))
      .join('\n');
  }

  text(node: ts.Node): string {
    const start = node.getStart(this.source);
    return this.dedent(this.source.text.slice(start, node.end), start).trim().replace(/;$/, '');
  }

  templateBody(node: ts.Expression): string {
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const start = node.getStart(this.source);
      const raw = this.source.text.slice(start + 1, node.end - 1);
      return templateBodyFromSource(this.dedent(raw, start));
    }
    if (ts.isStringLiteral(node)) return node.text;
    return `\${${this.text(node)}}`;
  }

  typeOf(node: ts.TypeNode): TVariableInfo {
    try {
      return parseType(node, this.types);
    } catch (error) {
      if (error instanceof TypeTextError) this.fail(error.node, error.message);
      throw error;
    }
  }

  // ---- statement lists -----------------------------------------------------------------------------------------

  statements(body: ts.Statement | readonly ts.Statement[], frame: TJumpFrameKind = 'none'): INode[] {
    const list = this.list(body, frame);
    if (list.footer !== undefined)
      this.fail(this.firstStatementOf(body), '`// @footer:` is only allowed at the end of a function');
    return list.nodes;
  }

  private firstStatementOf(body: ts.Statement | readonly ts.Statement[]): ts.Node {
    return Array.isArray(body) ? ((body as readonly ts.Statement[])[0] ?? this.source) : (body as ts.Statement);
  }

  list(body: ts.Statement | readonly ts.Statement[], frame: TJumpFrameKind = 'none'): IParsedList {
    let statements: readonly ts.Statement[];
    let end: number;
    if (Array.isArray(body)) {
      statements = body as readonly ts.Statement[];
      end = statements.length > 0 ? (statements.at(-1) as ts.Statement).end : -1;
    } else if (ts.isBlock(body as ts.Statement)) {
      statements = (body as ts.Block).statements;
      end = (body as ts.Block).statements.end;
    } else {
      statements = [body as ts.Statement];
      end = -1;
    }
    if (frame !== 'none') this.frames.push({ kind: frame });
    try {
      return this.buildNodes(this.collectItems(statements, end));
    } finally {
      if (frame !== 'none') this.frames.pop();
    }
  }

  /** Statements plus the comments around them, in source order. `end` = where trailing comments of the list are read (−1 = none). */
  private collectItems(statements: readonly ts.Statement[], end: number): TItem[] {
    const items: TItem[] = [];
    const text = this.source.text;
    const pushComments = (ranges: readonly ts.CommentRange[] | undefined): void => {
      for (const range of ranges ?? []) {
        const raw = text.slice(range.pos, range.end);
        const directive = range.kind === ts.SyntaxKind.MultiLineCommentTrivia ? DIRECTIVE.exec(raw) : null;
        if (directive) {
          items.push({
            count: Number(directive[2] ?? '1'),
            end: range.end,
            kind: 'directive',
            name: directive[1] ?? '',
            pos: range.pos,
          });
          continue;
        }
        const isLine = range.kind === ts.SyntaxKind.SingleLineCommentTrivia;
        const body = isLine
          ? raw.replace(/^\/\/ ?/, '')
          : raw
              .replace(/^\/\*\*?/, '')
              .replace(/\*\/$/, '')
              .split('\n')
              .map((line) => line.replace(/^\s*\* ?/, ''))
              .join('\n')
              .trim();
        const previous = items.at(-1);
        const gap = previous?.kind === 'comment' ? text.slice(previous.pos, range.pos) : '';
        // Consecutive `//` lines with no blank line between them are one comment node.
        if (
          previous?.kind === 'comment' &&
          previous.isLine &&
          isLine &&
          (gap.match(/\n/g) ?? []).length <= 1 &&
          !isMarker(body) &&
          !isMarker(previous.text)
        ) {
          items[items.length - 1] = { ...previous, pos: range.pos, text: `${previous.text}\n${body}` };
          continue;
        }
        items.push({ isLine, kind: 'comment', pos: range.pos, text: body });
      }
    };
    for (const statement of statements) {
      pushComments(ts.getLeadingCommentRanges(text, statement.pos));
      items.push({ kind: 'statement', statement });
      pushComments(ts.getTrailingCommentRanges(text, statement.end));
    }
    if (end >= 0) pushComments(ts.getLeadingCommentRanges(text, end));
    return items;
  }

  private buildNodes(items: readonly TItem[]): IParsedList {
    const nodes: INode[] = [];
    let footer: string | undefined;
    let index = 0;
    while (index < items.length) {
      const item = items[index] as TItem;
      index += 1;
      if (item.kind === 'comment') {
        const body = item.text.trim();
        if (body.startsWith(MAGIC_START)) {
          const start = index;
          let depth = 1;
          while (index < items.length && depth > 0) {
            const next = items[index] as TItem;
            if (next.kind === 'comment' && next.text.trim().startsWith(MAGIC_START)) depth += 1;
            if (next.kind === 'comment' && next.text.trim() === MAGIC_END) depth -= 1;
            index += 1;
          }
          if (depth > 0) this.failAt(item.pos, `\`// ${MAGIC_START}\` has no matching \`// ${MAGIC_END}\``);
          const inner = this.buildNodes(items.slice(start, index - 1));
          nodes.push({
            children: inner.nodes,
            data: { spell: parseMagicSpell(body.slice(MAGIC_START.length).trim()) },
            id: this.newId(),
            name: 'magic',
          });
          continue;
        }
        if (body === MAGIC_END) this.failAt(item.pos, `\`// ${MAGIC_END}\` without a matching \`// ${MAGIC_START}\``);
        if (body.startsWith(FOOTER_MARK)) {
          footer = body.slice(FOOTER_MARK.length).trim();
          continue;
        }
        nodes.push({ data: item.text.replace(/\s+$/, ''), id: this.newId(), name: COMMENT_NAME });
        continue;
      }
      if (item.kind === 'directive') {
        if (item.name !== 'action') this.failAt(item.pos, `Unknown directive \`/*@${item.name}*/\``);
        const grouped: ts.Statement[] = [];
        while (grouped.length < item.count && index < items.length) {
          const next = items[index] as TItem;
          index += 1;
          if (next.kind === 'statement') grouped.push(next.statement);
        }
        const first = grouped[0];
        const last = grouped.at(-1);
        if (!first || !last) this.failAt(item.pos, '`/*@action*/` must be followed by a statement');
        nodes.push({
          // Everything between the directive and the last grouped statement — comments inside the action included.
          data: this.dedent(this.source.text.slice(item.end, last.end), item.end).trim().replace(/;$/, '').trim(),
          id: this.newId(),
          name: 'action',
        });
        continue;
      }
      nodes.push(this.statement(item.statement));
    }
    return footer === undefined ? { nodes } : { footer, nodes };
  }

  private failAt(pos: number, message: string): never {
    const { line, character } = this.source.getLineAndCharacterOfPosition(pos);
    throw new ProjectionError([{ column: character + 1, file: this.fileName, line: line + 1, message }]);
  }

  // ---- statements ----------------------------------------------------------------------------------------------

  statement(statement: ts.Statement): INode {
    for (const extension of this.ctx.extensions ?? []) {
      const parsed = extension.parse(statement, this);
      if (parsed) return parsed;
    }
    if (ts.isEmptyStatement(statement)) return { data: '', id: this.newId(), name: 'action' };
    if (ts.isVariableStatement(statement)) return this.variableStatement(statement);
    if (ts.isExpressionStatement(statement)) return this.expressionStatement(statement);
    if (ts.isIfStatement(statement)) return this.ifStatement(statement);
    if (ts.isLabeledStatement(statement)) {
      const inner = statement.statement;
      if (!ts.isWhileStatement(inner) && !ts.isForOfStatement(inner) && !ts.isForStatement(inner)) {
        this.fail(
          statement,
          'Labels are only supported on loops (`L1: while (…) { … }`), to break out of an outer loop.',
        );
      }
      this.pendingLabel = statement.label.text;
      return this.statement(inner);
    }
    if (ts.isWhileStatement(statement)) return this.whileStatement(statement);
    if (ts.isForOfStatement(statement)) return this.forOfStatement(statement);
    if (ts.isForStatement(statement)) return this.forStatement(statement);
    if (ts.isSwitchStatement(statement)) return this.switchStatement(statement);
    if (ts.isReturnStatement(statement)) {
      return { data: statement.expression ? this.text(statement.expression) : '', id: this.newId(), name: 'return' };
    }
    if (ts.isThrowStatement(statement))
      return { data: this.text(statement.expression), id: this.newId(), name: 'throw' };
    if (ts.isBreakStatement(statement) || ts.isContinueStatement(statement)) return this.jump(statement);
    if (ts.isDoStatement(statement)) {
      this.fail(
        statement,
        'do…while is not supported: use `while (cond) { … }`, or `while (true) { …; break; }` for a block that runs once.',
      );
    }
    if (ts.isTryStatement(statement)) {
      this.fail(
        statement,
        'try/catch is not supported: a failing step fails the run. Check the condition with `if` before the call instead.',
      );
    }
    if (ts.isBlock(statement))
      this.fail(
        statement,
        'A bare `{ … }` block is not supported: put the statements directly in the enclosing block.',
      );
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      this.fail(
        statement,
        'Nested functions and classes are not supported: create a separate function file in functions/ and call it.',
      );
    }
    this.fail(statement, `Unsupported statement (${ts.SyntaxKind[statement.kind]}). ${SUPPORTED_HINT}`);
  }

  private takeLabel(): string | undefined {
    const label = this.pendingLabel;
    this.pendingLabel = undefined;
    return label;
  }

  private loopBody(body: ts.Statement, label: string | undefined): INode[] {
    this.frames.push(label ? { kind: 'loop', label } : { kind: 'loop' });
    try {
      return this.statements(body);
    } finally {
      this.frames.pop();
    }
  }

  private variableStatement(statement: ts.VariableStatement): INode {
    const list = statement.declarationList;
    const declaration = list.declarations[0];
    if (list.declarations.length !== 1 || !declaration || !ts.isIdentifier(declaration.name)) {
      return { data: this.text(statement), id: this.newId(), name: 'action' };
    }
    const name = declaration.name.text;
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    const init = declaration.initializer;
    if (!declaration.type && init) {
      const call = this.callFunction(init, name);
      if (call) return call;
      const arrayOp = this.arrayResultOp(init, name);
      if (arrayOp) return arrayOp;
    }
    let variableType: TVariableInfo | undefined;
    if (declaration.type) variableType = this.typeOf(declaration.type);
    else variableType = this.ctx.inferType?.(declaration);
    if (!variableType) {
      this.fail(
        declaration,
        `Add a type annotation: \`${isConst ? 'const' : 'let'} ${name}: <type> = …\` (the variable's type is shown on the diagram).`,
      );
    }
    const typed = isConst ? { ...variableType, constant: true } : variableType;
    return {
      data: init ? { name, value: this.text(init), variableType: typed } : { name, variableType: typed },
      id: this.newId(),
      name: 'create-var',
    };
  }

  /** `await fn(a, b)` where `fn` is a project function → `call-function`. */
  private callFunction(expression: ts.Expression, returnVariable: string): INode | null {
    if (!ts.isAwaitExpression(expression)) return null;
    const call = expression.expression;
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
    const schemeId = this.ctx.functions.idOf(call.expression.text);
    if (!schemeId) return null;
    return {
      data: { iconId: null, parameters: call.arguments.map((arg) => this.text(arg)), returnVariable, schemeId },
      id: this.newId(),
      name: 'call-function',
    };
  }

  private methodCall(
    expression: ts.Expression,
    method: string,
  ): { target: string; args: readonly ts.Expression[] } | null {
    if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) return null;
    if (expression.expression.name.text !== method) return null;
    return { args: expression.arguments, target: this.text(expression.expression.expression) };
  }

  private arrayResultOp(expression: ts.Expression, variable: string): INode | null {
    for (const [method, name] of [
      ['pop', 'arr-pop'],
      ['shift', 'arr-shift'],
    ] as const) {
      const call = this.methodCall(expression, method);
      if (call && call.args.length === 0) return { data: { arr: call.target, variable }, id: this.newId(), name };
    }
    const slice = this.methodCall(expression, 'slice');
    if (slice && slice.args.length > 0 && slice.args.length <= 2) {
      const [start, end] = slice.args;
      return {
        data: { arr: slice.target, end: end ? this.text(end) : '', start: start ? this.text(start) : '', variable },
        id: this.newId(),
        name: 'arr-slice',
      };
    }
    return null;
  }

  private expressionStatement(statement: ts.ExpressionStatement): INode {
    const expression = statement.expression;
    const call = this.callFunction(expression, '');
    if (call) return call;
    if (ts.isAwaitExpression(expression)) {
      const parallel = this.parallel(expression.expression);
      if (parallel) return parallel;
    }
    if (ts.isCallExpression(expression)) {
      if (
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === 'log' &&
        expression.arguments.length === 1
      ) {
        return { data: this.templateBody(expression.arguments[0] as ts.Expression), id: this.newId(), name: 'log' };
      }
      for (const [method, name] of [
        ['push', 'arr-push'],
        ['unshift', 'arr-unshift'],
      ] as const) {
        const op = this.methodCall(expression, method);
        if (op && op.args.length === 1 && !ts.isSpreadElement(op.args[0] as ts.Expression)) {
          return { data: { arr: op.target, value: this.text(op.args[0] as ts.Expression) }, id: this.newId(), name };
        }
      }
      const splice = this.methodCall(expression, 'splice');
      const [start, deleteCount, spread] = splice?.args ?? [];
      if (
        splice &&
        splice.args.length === 3 &&
        start &&
        deleteCount &&
        ts.isNumericLiteral(deleteCount) &&
        deleteCount.text === '0' &&
        spread &&
        ts.isSpreadElement(spread)
      ) {
        return {
          data: { arr: splice.target, insertArr: this.text(spread.expression), start: this.text(start) },
          id: this.newId(),
          name: 'arr-insert',
        };
      }
    }
    return { data: this.text(statement), id: this.newId(), name: 'action' };
  }

  /** `await Promise.all([(async () => { … })(), …])` → `parallel` with one thread per element. */
  private parallel(expression: ts.Expression): INode | null {
    if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) return null;
    const callee = expression.expression;
    if (!ts.isPropertyAccessExpression(callee) || callee.getText(this.source) !== 'Promise.all') return null;
    const array = expression.arguments[0];
    if (!array || !ts.isArrayLiteralExpression(array)) return null;
    const threads: INode[] = [];
    for (const element of array.elements) {
      const fn =
        ts.isCallExpression(element) &&
        element.arguments.length === 0 &&
        ts.isParenthesizedExpression(element.expression)
          ? element.expression.expression
          : undefined;
      if (
        !fn ||
        !ts.isArrowFunction(fn) ||
        !fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
        !ts.isBlock(fn.body)
      ) {
        this.fail(element, 'Each parallel branch must be `(async () => { … })()`.');
      }
      threads.push({ children: this.statements(fn.body), id: this.newId(), name: 'parallel-thread' });
    }
    return { children: threads, id: this.newId(), name: 'parallel' };
  }

  private ifStatement(statement: ts.IfStatement): INode {
    const thenNodes = this.statements(statement.thenStatement);
    const elseNodes = statement.elseStatement ? this.statements(statement.elseStatement) : [];
    const endsInJump = (nodes: readonly INode[]): boolean => JUMP_KINDS.has(nodes.at(-1)?.name ?? '');
    // The first branch can't end in a jump (it continues the main line on the diagram): put a jumping
    // "then" branch on the right instead (ADR 0035's rule, normalised rather than rejected).
    const trueOnRight = endsInJump(thenNodes) && !endsInJump(elseNodes);
    const thenChild: INode = { children: thenNodes, id: this.newId(), name: 'if-child' };
    const elseChild: INode = { children: elseNodes, id: this.newId(), name: 'if-child' };
    return {
      children: trueOnRight ? [elseChild, thenChild] : [thenChild, elseChild],
      data: this.text(statement.expression),
      id: this.newId(),
      ...(trueOnRight ? { meta: { trueOnRight: true } } : {}),
      name: 'if',
    };
  }

  private whileStatement(statement: ts.WhileStatement): INode {
    const label = this.takeLabel();
    const condition = this.text(statement.expression);
    if (condition === 'true' && ts.isBlock(statement.statement)) {
      const statements = statement.statement.statements;
      const last = statements.at(-1);
      if (last && ts.isBreakStatement(last) && !last.label) {
        // `while (true) { …; break; }` is the run-once block (`pseudo-cycle`): the trailing `break` is implicit.
        this.frames.push(label ? { kind: 'loop', label } : { kind: 'loop' });
        try {
          const items = this.collectItems(statements.slice(0, -1), statements.end);
          return { children: this.buildNodes(items).nodes, id: this.newId(), name: 'pseudo-cycle' };
        } finally {
          this.frames.pop();
        }
      }
    }
    return { children: this.loopBody(statement.statement, label), data: condition, id: this.newId(), name: 'while' };
  }

  private forOfStatement(statement: ts.ForOfStatement): INode {
    const label = this.takeLabel();
    if (statement.awaitModifier) this.fail(statement, '`for await` is not supported.');
    const init = statement.initializer;
    const declaration = ts.isVariableDeclarationList(init) ? init.declarations[0] : undefined;
    if (!declaration) this.fail(statement, 'Use `for (const item of array) { … }`.');
    let item: string;
    let index = '';
    let arr = this.text(statement.expression);
    if (ts.isIdentifier(declaration.name)) {
      item = declaration.name.text;
    } else if (ts.isArrayBindingPattern(declaration.name) && declaration.name.elements.length === 2) {
      const [indexElement, itemElement] = declaration.name.elements;
      const entries = this.methodCall(statement.expression, 'entries');
      if (
        !entries ||
        !indexElement ||
        !itemElement ||
        ts.isOmittedExpression(indexElement) ||
        ts.isOmittedExpression(itemElement)
      ) {
        this.fail(statement, 'Use `for (const [index, item] of array.entries()) { … }` to get the index.');
      }
      index = indexElement.name.getText(this.source);
      item = itemElement.name.getText(this.source);
      arr = entries.target;
    } else {
      this.fail(declaration, 'Use `for (const item of array)` or `for (const [index, item] of array.entries())`.');
    }
    return {
      children: this.loopBody(statement.statement, label),
      data: { arr, index, item },
      id: this.newId(),
      name: 'foreach',
    };
  }

  private forStatement(statement: ts.ForStatement): INode {
    const label = this.takeLabel();
    const hint =
      'Only the counting loop `for (let i = from; i <= to; i++) { … }` is supported; use `while` for anything else.';
    const init = statement.initializer;
    const declaration = init && ts.isVariableDeclarationList(init) ? init.declarations[0] : undefined;
    if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer) this.fail(statement, hint);
    const item = declaration.name.text;
    const condition = statement.condition;
    if (
      !condition ||
      !ts.isBinaryExpression(condition) ||
      condition.operatorToken.kind !== ts.SyntaxKind.LessThanEqualsToken ||
      !ts.isIdentifier(condition.left) ||
      condition.left.text !== item
    ) {
      this.fail(statement, hint);
    }
    const increment = statement.incrementor?.getText(this.source).replaceAll(/\s/g, '');
    if (![`${item}++`, `++${item}`, `${item}+=1`].includes(increment ?? '')) this.fail(statement, hint);
    return {
      children: this.loopBody(statement.statement, label),
      data: { from: this.text(declaration.initializer), item, to: this.text(condition.right) },
      id: this.newId(),
      name: 'from-to-cycle',
    };
  }

  private switchStatement(statement: ts.SwitchStatement): INode {
    const options = this.cases(statement.caseBlock).map(({ test, nodes }) => ({
      children: nodes,
      data: test ? this.text(test) : 'default',
      id: this.newId(),
      name: 'switch-option',
    }));
    return { children: options, data: this.text(statement.expression), id: this.newId(), name: 'switch' };
  }

  cases(block: ts.CaseBlock): { test: ts.Expression | null; clause: ts.CaseOrDefaultClause; nodes: INode[] }[] {
    return block.clauses.map((clause) => {
      let statements: readonly ts.Statement[] = clause.statements;
      let end = clause.statements.end;
      const only = statements[0];
      if (statements.length === 1 && only && ts.isBlock(only)) {
        statements = only.statements;
        end = only.statements.end;
      }
      const last = statements.at(-1);
      if (last && ts.isBreakStatement(last) && !last.label) {
        statements = statements.slice(0, -1);
      } else if (
        !last ||
        !(
          ts.isReturnStatement(last) ||
          ts.isThrowStatement(last) ||
          ts.isContinueStatement(last) ||
          ts.isBreakStatement(last)
        )
      ) {
        this.fail(
          clause,
          `\`${ts.isDefaultClause(clause) ? 'default' : `case ${clause.expression.getText(this.source)}`}:\` must end with \`break;\` (or return/throw/continue) — fall-through to the next case is not supported.`,
        );
      }
      this.frames.push({ kind: 'switch' });
      try {
        return {
          clause,
          nodes: this.buildNodes(this.collectItems(statements, end)).nodes,
          test: ts.isDefaultClause(clause) ? null : clause.expression,
        };
      } finally {
        this.frames.pop();
      }
    });
  }

  private jump(statement: ts.BreakStatement | ts.ContinueStatement): INode {
    const keyword = ts.isBreakStatement(statement) ? 'break' : 'continue';
    const loops = this.frames.filter((frame) => frame.kind === 'loop');
    let outLevel = 1;
    if (statement.label) {
      const label = statement.label.text;
      const index = loops.findLastIndex((frame) => frame.label === label);
      if (index === -1) this.fail(statement, `No enclosing loop is labelled \`${label}\`.`);
      outLevel = loops.length - index;
    } else {
      if (loops.length === 0) this.fail(statement, `\`${keyword}\` outside a loop.`);
      const innermost = this.frames.at(-1);
      if (keyword === 'break' && innermost?.kind === 'switch') {
        this.fail(
          statement,
          'A bare `break;` inside a case only ends the case and must be its last statement. To leave the loop, label it (`L1: while (…)`) and write `break L1;`.',
        );
      }
    }
    return { id: this.newId(), ...(outLevel > 1 ? { meta: { outLevel } } : {}), name: keyword };
  }
}

const isMarker = (text: string): boolean => {
  const body = text.trim();
  return body.startsWith(MAGIC_START) || body === MAGIC_END || body.startsWith(FOOTER_MARK);
};

const parseMagicSpell = (head: string): string => {
  if (head.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(head);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // not a JSON string — the spell is the raw text
    }
  }
  return head;
};

/**
 * Moves a container's trailing jump into its `out` wherever the editor allows one (the container's config has
 * `haveOut` and it is not the first child of its parent — ADR 0035's rule); otherwise the jump stays a plain last child.
 */
export const foldOuts = (node: INode, ctx: Pick<IProjectionContext, 'stack'>): INode => {
  if (!node.children) return node;
  const children = node.children.map((child, index) => {
    const folded = foldOuts(child, ctx);
    const config = ctx.stack.configsMap.get(folded.name);
    const last = folded.children?.at(-1);
    if (index === 0 || !config?.haveOut || folded.out || !last || !JUMP_KINDS.has(last.name)) return folded;
    return { ...folded, children: folded.children?.slice(0, -1) ?? [], out: last };
  });
  return { ...node, children };
};

export const createSourceFile = (fileName: string, text: string): ts.SourceFile =>
  ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

/** Syntax errors of a file as diagnostics (the parser assumes a syntactically valid file). */
export const syntaxDiagnostics = (source: ts.SourceFile, fileName = source.fileName) =>
  ((source as unknown as { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics ?? []).map(
    (d) => {
      const { line, character } = source.getLineAndCharacterOfPosition(d.start);
      return {
        column: character + 1,
        file: fileName,
        line: line + 1,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      };
    },
  );
