// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import ts from 'typescript';
import { createSourceFile, Parser } from './parser.js';
import { ProjectionError, type IProjectionContext } from './types.js';

const normalize = (text: string): string => text.trim().replace(/;$/, '').trim();

/**
 * An `action` node holds raw code. Printed plainly, most actions parse back as an `action` — but some don't (`const x
 * = 1` reads as a `create-var`, `arr.push(x)` as an `arr-push`, `a(); b()` as two actions). Returns `0` when the plain
 * form round-trips, otherwise how many statements the `/*@action N*\/` directive must group.
 */
export const needsActionDirective = (text: string, ctx: IProjectionContext): number => {
  if (normalize(text) === '') return 1;
  const source = createSourceFile('action.ts', /[;}]$/.test(text) ? text : `${text};`);
  const count = Math.max(1, source.statements.length);
  if (source.statements.length !== 1) return count;
  try {
    const [node] = new Parser(source, { ...ctx, inferType: undefined }).statements(source.statements);
    const statement = source.statements[0] as ts.Statement;
    const hasComments = (ts.getLeadingCommentRanges(source.text, statement.pos) ?? []).length > 0;
    return node?.name === 'action' && !hasComments && normalize(String(node.data)) === normalize(text) ? 0 : count;
  } catch (error) {
    if (error instanceof ProjectionError) return count;
    throw error;
  }
};
