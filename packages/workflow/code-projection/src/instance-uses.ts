// oxlint-disable init-declarations, no-undefined -- spike code (ADR 0061 (private))
import { createSourceFile, type ICodeDiagnostic } from '@falang/code-projection';
import ts from 'typescript';

/** Where an integration call may stand: the whole statement, a `const x =` initializer, a question's `switch`, a trigger export. */
const isStatementLevelCall = (receiver: ts.Node): boolean => {
  const access = receiver.parent;
  if (!access || !ts.isPropertyAccessExpression(access) || access.expression !== receiver) return false;
  const call = access.parent;
  if (!call || !ts.isCallExpression(call) || call.expression !== access) return false;
  const owner = call.parent;
  if (owner && ts.isExportAssignment(owner)) return true;
  if (!owner || !ts.isAwaitExpression(owner)) return false;
  const holder = owner.parent;
  if (!holder) return false;
  if (ts.isExpressionStatement(holder) || ts.isSwitchStatement(holder)) return true;
  return (
    ts.isVariableDeclaration(holder) &&
    holder.initializer === owner &&
    !holder.type &&
    ts.isVariableDeclarationList(holder.parent)
  );
};

/**
 * An integration instance (or `<vendor>Instance(id)`) used anywhere but as a whole call statement can't become an
 * integration node: it would stay raw code that references a name only the projection knows, and the real compiler
 * rejects it (`String(await ai.callAiText(…))`, `reply = await ai.callAiText(…)`). Reported at write time with the form
 * that works.
 */
export const strayInstanceUses = (
  fileName: string,
  text: string,
  instanceNames: ReadonlySet<string>,
  factoryNames: ReadonlySet<string>,
): ICodeDiagnostic[] => {
  const source = createSourceFile(fileName, text);
  const problems: ICodeDiagnostic[] = [];
  const visit = (node: ts.Node): void => {
    let receiver: ts.Node | undefined;
    if (ts.isIdentifier(node) && instanceNames.has(node.text)) {
      const parent = node.parent;
      // A property name (`x.supportBot`) or a declaration name is not a use of the instance.
      const isName =
        parent &&
        ((ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node));
      if (!isName) receiver = node;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && factoryNames.has(node.expression.text))
      receiver = node;
    if (receiver && !isStatementLevelCall(receiver)) {
      const { line, character } = source.getLineAndCharacterOfPosition(receiver.getStart(source));
      const name = receiver.getText(source);
      problems.push({
        column: character + 1,
        file: fileName,
        line: line + 1,
        message:
          `\`${name}\` can only be called as a statement of its own, e.g. \`const reply = await ${name}.method({ … });\` ` +
          '(a question: `switch (await …)`). Use the result variable in the next statement instead of wrapping, reassigning ' +
          'or nesting the call.',
      });
      return;
    }
    if (receiver === undefined || !ts.isIdentifier(node)) ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
};
