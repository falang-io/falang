// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import { COMMENT_NAME, type INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { needsActionDirective } from './action-directive.js';
import { templateLiteralSource } from './template-body.js';
import { renderType } from './type-text.js';
import type { IProjectionContext, IProjector, TJumpFrameKind } from './types.js';

export const INDENT = '  ';

export const indent = (text: string, levels = 1): string =>
  text === ''
    ? ''
    : text
        .split('\n')
        .map((line) => (line === '' ? line : INDENT.repeat(levels) + line))
        .join('\n');

/** Thrown for a node kind the projection has no code form for (counted, not crashed on, by the round-trip tests). */
export class UnsupportedNodeError extends Error {
  readonly nodeName: string;
  readonly nodeId: string;

  constructor(node: INode, message?: string) {
    super(message ?? `Node kind "${node.name}" has no code form`);
    this.nodeName = node.name;
    this.nodeId = node.id;
  }
}

/** Special `//` line comments the projection uses for structure that has no TypeScript syntax of its own. */
export const MAGIC_START = '@magic:';
export const MAGIC_END = '@end magic';
export const FOOTER_MARK = '@footer:';

export const JUMP_KINDS = new Set(['break', 'continue', 'return', 'throw']);

interface IFrame {
  readonly kind: 'loop' | 'switch';
  /** 1-based loop depth (loops only) — the generated label is `L<depth>`. */
  readonly depth: number;
  usedLabel: boolean;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Removes trailing `;` and surrounding whitespace — how expression fields are printed inside a statement. */
export const expr = (value: unknown): string => str(value).trim().replace(/;+$/, '').trim();

const comment = (text: string): string =>
  text === ''
    ? '//'
    : text
        .split(/\r?\n/)
        .map((line) => (line.trim() === '' ? '//' : `// ${line.trimEnd()}`))
        .join('\n');

/** `[...children, out]` — the order the statements run in (the editor stores a container's trailing jump in `out`). */
export const withOut = (node: INode): readonly INode[] =>
  node.out ? [...(node.children ?? []), node.out] : (node.children ?? []);

export class Projector implements IProjector {
  readonly types: IProjectionContext['types'];
  private readonly ctx: IProjectionContext;
  private readonly frames: IFrame[] = [];

  constructor(ctx: IProjectionContext) {
    this.ctx = ctx;
    this.types = ctx.types;
  }

  type(type: TVariableInfo): string {
    return renderType(type, this.ctx.types);
  }

  template(body: string): string {
    return templateLiteralSource(body);
  }

  /** The statements of `container` (+ its out), one level deeper. `frame` is pushed around them when not `'none'`. */
  block(container: INode, frame: TJumpFrameKind = 'none'): string {
    if (frame === 'switch') this.frames.push({ depth: this.loopDepth(), kind: 'switch', usedLabel: false });
    try {
      return indent(this.list(withOut(container)));
    } finally {
      if (frame === 'switch') this.frames.pop();
    }
  }

  /** Statements separated by newlines; consecutive comment nodes get a blank line between them so they stay separate. */
  list(nodes: readonly INode[]): string {
    const out: string[] = [];
    nodes.forEach((node, index) => {
      if (index > 0 && node.name === COMMENT_NAME && nodes[index - 1]?.name === COMMENT_NAME) out.push('');
      const text = this.statement(node);
      if (text !== '' || node.name === COMMENT_NAME) out.push(text);
    });
    return out.join('\n');
  }

  private loopDepth(): number {
    return this.frames.filter((frame) => frame.kind === 'loop').length;
  }

  private jump(keyword: 'break' | 'continue', node: INode): string {
    const outLevel = typeof node.meta?.outLevel === 'number' ? node.meta.outLevel : 1;
    const loops = this.frames.filter((frame) => frame.kind === 'loop');
    const target = loops[loops.length - outLevel];
    if (!target)
      throw new UnsupportedNodeError(node, `"${keyword}" (${node.id}) targets a loop level that doesn't exist`);
    const innermost = this.frames.at(-1);
    // A bare `break` inside a case ends the case, and any jump past the innermost loop needs the outer loop's label.
    const needsLabel = outLevel > 1 || (keyword === 'break' && innermost?.kind === 'switch');
    if (!needsLabel) return `${keyword};`;
    target.usedLabel = true;
    return `${keyword} L${target.depth};`;
  }

  private loop(node: INode, header: string, trailing?: string): string {
    const frame: IFrame = { depth: this.loopDepth() + 1, kind: 'loop', usedLabel: false };
    this.frames.push(frame);
    let body: string;
    try {
      body = indent(
        [this.list(withOut(node)), trailing].filter((part) => part !== undefined && part !== '').join('\n'),
      );
    } finally {
      this.frames.pop();
    }
    const label = frame.usedLabel ? `L${frame.depth}: ` : '';
    return `${label}${header} {\n${body}${body === '' ? '' : '\n'}}`;
  }

  statement(node: INode): string {
    const extension = this.ctx.extensions?.find((candidate) => candidate.handles(node.name));
    if (extension) return extension.project(node, this);
    const data = node.data as Record<string, unknown> | string | undefined;
    const field = (name: string): string => str((data as Record<string, unknown> | undefined)?.[name]);
    switch (node.name) {
      case COMMENT_NAME: {
        return comment(str(data).trim());
      }
      case 'action': {
        return this.action(str(data));
      }
      case 'create-var': {
        const record = data as { name: string; variableType: TVariableInfo; value?: string };
        const keyword = record.variableType.constant ? 'const' : 'let';
        const value = expr(record.value);
        const declaration = `${keyword} ${record.name}: ${this.type(record.variableType)}`;
        return value === '' ? `${declaration};` : `${declaration} = ${value};`;
      }
      case 'log': {
        return `log(${this.template(str(data))});`;
      }
      case 'return': {
        const value = expr(data);
        return value === '' ? 'return;' : `return ${value};`;
      }
      case 'throw': {
        return `throw ${expr(data)};`;
      }
      case 'break':
      case 'continue': {
        return this.jump(node.name, node);
      }
      case 'call-function': {
        const record = data as { schemeId: string; parameters: readonly string[]; returnVariable: string };
        const name = this.ctx.functions.nameOf(record.schemeId);
        if (!name) throw new UnsupportedNodeError(node, `call-function targets unknown document "${record.schemeId}"`);
        const call = `await ${name}(${record.parameters.map((param) => expr(param)).join(', ')})`;
        const variable = record.returnVariable.trim();
        return variable === '' ? `${call};` : `const ${variable} = ${call};`;
      }
      case 'arr-pop':
      case 'arr-shift': {
        const method = node.name === 'arr-pop' ? 'pop' : 'shift';
        return `const ${field('variable').trim()} = ${expr(field('arr'))}.${method}();`;
      }
      case 'arr-push':
      case 'arr-unshift': {
        const method = node.name === 'arr-push' ? 'push' : 'unshift';
        return `${expr(field('arr'))}.${method}(${expr(field('value'))});`;
      }
      case 'arr-insert': {
        return `${expr(field('arr'))}.splice(${expr(field('start'))}, 0, ...${expr(field('insertArr'))});`;
      }
      case 'arr-slice': {
        const args = [expr(field('start')), expr(field('end'))].filter((arg, index) => index === 0 || arg !== '');
        return `const ${field('variable').trim()} = ${expr(field('arr'))}.slice(${args.join(', ')});`;
      }
      case 'if': {
        return this.ifStatement(node);
      }
      case 'while': {
        const condition = expr(data);
        const effective = node.meta?.trueIsMain === true ? `!(${condition})` : condition;
        return this.loop(node, `while (${effective})`);
      }
      case 'foreach': {
        const item = field('item').trim();
        const index = field('index').trim();
        const arr = expr(field('arr'));
        const header =
          index === '' ? `for (const ${item} of ${arr})` : `for (const [${index}, ${item}] of ${arr}.entries())`;
        return this.loop(node, header);
      }
      case 'from-to-cycle': {
        const item = field('item').trim();
        return this.loop(
          node,
          `for (let ${item} = ${expr(field('from'))}; ${item} <= ${expr(field('to'))}; ${item}++)`,
        );
      }
      case 'pseudo-cycle': {
        return this.loop(node, 'while (true)', 'break;');
      }
      case 'switch': {
        const cases = (node.children ?? []).map((option) => this.caseClause(expr(option.data), option)).join('\n');
        return `switch (${expr(data)}) {\n${indent(cases)}${cases === '' ? '' : '\n'}}`;
      }
      case 'parallel': {
        const threads = (node.children ?? []).map((thread) => {
          const body = this.block(thread);
          return body === '' ? '(async () => {})()' : `(async () => {\n${body}\n})()`;
        });
        return `await Promise.all([\n${indent(threads.join(',\n'))}\n]);`;
      }
      case 'magic': {
        const spell = str((data as Record<string, unknown> | undefined)?.spell);
        const head = spell.includes('\n') ? JSON.stringify(spell) : spell;
        const inner = this.list(withOut(node));
        return [`// ${MAGIC_START} ${head}`.trimEnd(), inner, `// ${MAGIC_END}`]
          .filter((part) => part !== '')
          .join('\n');
      }
      default: {
        throw new UnsupportedNodeError(node);
      }
    }
  }

  /** One `case v: { … }` of a switch-like node; the terminating `break;` is omitted when the body already ends in a jump. */
  caseClause(test: string, option: INode): string {
    this.frames.push({ depth: this.loopDepth(), kind: 'switch', usedLabel: false });
    try {
      const statements = withOut(option);
      const last = statements.at(-1);
      const body = this.list(statements);
      const terminator = last && JUMP_KINDS.has(last.name) ? '' : 'break;';
      const content = [body, terminator].filter((part) => part !== '').join('\n');
      // A `switch-option` whose value is `default` is the default branch (the logic constructor compiles it so).
      return `${test === 'default' ? 'default' : `case ${test}`}: {\n${indent(content)}\n}`;
    } finally {
      this.frames.pop();
    }
  }

  private ifStatement(node: INode): string {
    const [first, second] = node.children ?? [];
    const trueOnRight = node.meta?.trueOnRight === true;
    const thenChild = trueOnRight ? second : first;
    const elseChild = trueOnRight ? first : second;
    const thenBody = thenChild ? this.block(thenChild) : '';
    const elseBody = elseChild ? this.block(elseChild) : '';
    const head = `if (${expr(node.data)}) {\n${thenBody}${thenBody === '' ? '' : '\n'}}`;
    return elseBody === '' ? head : `${head} else {\n${elseBody}\n}`;
  }

  private action(text: string): string {
    const trimmed = text.trim();
    const directive = needsActionDirective(trimmed, this.ctx);
    const lastLine = trimmed.split('\n').at(-1) ?? '';
    // A trailing `// comment` would swallow the `;`: put it on its own line.
    const terminator = lastLine.includes('//') ? '\n;' : ';';
    const statement = trimmed === '' ? ';' : /[;}]$/.test(trimmed) ? trimmed : `${trimmed}${terminator}`;
    if (directive === 0) return statement;
    return `/*@action${directive > 1 ? ` ${directive}` : ''}*/ ${statement}`;
  }
}

/** Projects a statement list on its own (used by tests and by the action-directive check). */
export const projectStatements = (nodes: readonly INode[], ctx: IProjectionContext): string =>
  new Projector(ctx).list(nodes);
