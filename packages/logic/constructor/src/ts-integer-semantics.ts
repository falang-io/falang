import ts from 'typescript';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { INumericTypeContext } from './numeric-coercion.js';
import { resolveVariableInfo } from './numeric-coercion.js';

/**
 * Integer semantics for the TS/JS targets (ADR 0069 (private) §3), so one project prints the same thing in every
 * target: an integer `/` integer division and a float/decimal stored into an integer-typed target are truncated.
 * Integer overflow and unsigned wrap-around are NOT emulated. An operand whose number type can't be resolved is left
 * alone, as in the native targets' casts.
 */

const FLOAT_MATH_CALLS: ReadonlySet<string> = new Set([
  'Math.sqrt',
  'Math.pow',
  'Math.floor',
  'Math.ceil',
  'Math.round',
  'Math.random',
]);

const FLOAT64_INFO: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

export const createTsNumericContext = (base: Omit<INumericTypeContext, 'resolveLiterals'>): INumericTypeContext => ({
  ...base,
  resolveLiterals: true,
});

const isIntegerInfo = (info: TVariableInfo | undefined): boolean =>
  info?.type === 'number' && info.numberType.type === 'integer';

const isFractionalInfo = (info: TVariableInfo | undefined): boolean =>
  info?.type === 'number' && (info.numberType.type === 'float' || info.numberType.type === 'decimal');

/** `resolveVariableInfo` plus the `Math.*` calls that always produce a (possibly fractional) float. */
const resolveInfo = (node: ts.Expression, context: INumericTypeContext, sourceFile: ts.SourceFile) => {
  if (ts.isCallExpression(node) && FLOAT_MATH_CALLS.has(node.expression.getText(sourceFile))) return FLOAT64_INFO;
  return resolveVariableInfo(node, context);
};

interface IInsertion {
  readonly position: number;
  readonly text: string;
}

const wrap = (node: ts.Node, sourceFile: ts.SourceFile): IInsertion[] => [
  { position: node.getStart(sourceFile), text: 'Math.trunc(' },
  { position: node.getEnd(), text: ')' },
];

const collectInsertions = (
  root: ts.Node,
  context: INumericTypeContext,
  sourceFile: ts.SourceFile,
  insertions: IInsertion[],
): void => {
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      const leftInfo = resolveInfo(node.left, context, sourceFile);
      const rightInfo = resolveInfo(node.right, context, sourceFile);
      if (operator === ts.SyntaxKind.SlashToken && isIntegerInfo(leftInfo) && isIntegerInfo(rightInfo)) {
        insertions.push(...wrap(node, sourceFile));
      } else if (operator === ts.SyntaxKind.EqualsToken && isIntegerInfo(leftInfo) && isFractionalInfo(rightInfo)) {
        insertions.push(...wrap(node.right, sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
};

/**
 * Returns `expression` rewritten for integer semantics. `exprNode` is the checked initializer of the virtual file;
 * `exprStart` is the offset of `expression` inside that file's text; `targetType` is the declared type of the store
 * the whole expression flows into (`create-var`, `return`, an argument), when there is one.
 */
export const applyTsIntegerSemantics = (
  expression: string,
  exprNode: ts.Expression,
  exprStart: number,
  sourceFile: ts.SourceFile,
  context: INumericTypeContext,
  targetType?: TVariableInfo,
): string => {
  const insertions: IInsertion[] = [];
  collectInsertions(exprNode, context, sourceFile, insertions);
  if (isIntegerInfo(targetType) && isFractionalInfo(resolveInfo(exprNode, context, sourceFile))) {
    insertions.push(...wrap(exprNode, sourceFile));
  }
  if (insertions.length === 0) return expression;
  // Closing parens first at an equal position (a node ending exactly where another one starts can't occur, but two
  // nested wraps can share a boundary), then apply back to front so earlier offsets stay valid.
  const sorted = insertions
    .map((insertion, order) => ({ position: insertion.position, text: insertion.text, order }))
    .toSorted((a, b) => b.position - a.position || b.order - a.order);
  let result = expression;
  for (const insertion of sorted) {
    const at = insertion.position - exprStart;
    result = `${result.slice(0, at)}${insertion.text}${result.slice(at)}`;
  }
  return result;
};
