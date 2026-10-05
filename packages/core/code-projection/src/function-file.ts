// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import ts from 'typescript';
import { createSourceFile, foldOuts, Parser, syntaxDiagnostics } from './parser.js';
import { FOOTER_MARK, indent, Projector } from './projector.js';
import { ProjectionError, type IProjectionContext } from './types.js';

interface IParameter {
  readonly name: string;
  readonly type: TVariableInfo;
}

interface IFunctionBodyData {
  readonly parameters: readonly IParameter[];
  readonly returnValue?: TVariableInfo;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A function-header's description as a JSDoc block (or nothing). */
export const jsDoc = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  return ['/**', ...trimmed.split('\n').map((line) => (line.trim() === '' ? ' *' : ` * ${line}`)), ' */'].join('\n');
};

/** The `/** … *\/` comment right before `node`, as plain text. */
export const readJsDoc = (source: ts.SourceFile, node: ts.Node): string => {
  const ranges = ts.getLeadingCommentRanges(source.text, node.pos) ?? [];
  const doc = ranges.toReversed().find((range) => source.text.slice(range.pos, range.pos + 3) === '/**');
  if (!doc) return '';
  return source.text
    .slice(doc.pos + 3, doc.end - 2)
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, '').trimEnd())
    .join('\n')
    .trim();
};

/** The body of a function-like container (`function-body`, `trigger-function-body`) plus the footer marker. */
export const projectBody = (projector: Projector, body: INode | undefined, footer: INode | undefined): string => {
  const footerText = str(footer?.data).trim();
  const statements = body ? projector.list([...(body.children ?? []), ...(body.out ? [body.out] : [])]) : '';
  const parts = [statements, footerText === '' ? '' : `// ${FOOTER_MARK} ${footerText}`].filter((part) => part !== '');
  return parts.length === 0 ? '' : indent(parts.join('\n'));
};

export const renderParameters = (projector: Projector, parameters: readonly IParameter[]): string =>
  parameters
    .map((param) =>
      param.type.optional
        ? `${param.name}?: ${projector.type({ ...param.type, optional: false })}`
        : `${param.name}: ${projector.type(param.type)}`,
    )
    .join(', ');

export const renderReturnType = (projector: Projector, returnValue: TVariableInfo | undefined): string =>
  `Promise<${returnValue && returnValue.type !== 'void' ? projector.type(returnValue) : 'void'}>`;

/** A `function` document → its `functions/<name>.ts` text. */
export const projectFunctionFile = (root: INode, name: string, ctx: IProjectionContext): string => {
  const [header, body, footer] = root.children ?? [];
  const projector = new Projector(ctx);
  const data = (body?.data ?? { parameters: [] }) as IFunctionBodyData;
  const signature = `export async function ${name}(${renderParameters(projector, data.parameters)}): ${renderReturnType(projector, data.returnValue)}`;
  const content = projectBody(projector, body, footer);
  const doc = jsDoc(str(header?.data));
  return `${doc === '' ? '' : `${doc}\n`}${signature} {\n${content}${content === '' ? '' : '\n'}}\n`;
};

export const parseParameters = (parser: Parser, parameters: readonly ts.ParameterDeclaration[]): IParameter[] =>
  parameters.map((param) => {
    if (!ts.isIdentifier(param.name))
      parser.fail(param, 'Destructured parameters are not supported: use `name: Type`.');
    if (param.initializer) parser.fail(param, 'Default parameter values are not supported.');
    if (!param.type)
      parser.fail(param, `Add a type to parameter \`${param.name.text}\`: \`${param.name.text}: <type>\`.`);
    const type = parser.typeOf(param.type);
    return { name: param.name.text, type: param.questionToken ? { ...type, optional: true } : type };
  });

/** `Promise<T>` → T; `void`/missing → undefined (no return value). */
export const parseReturnType = (parser: Parser, node: ts.TypeNode | undefined): TVariableInfo | undefined => {
  if (!node) return undefined;
  const inner =
    ts.isTypeReferenceNode(node) &&
    ts.isIdentifier(node.typeName) &&
    node.typeName.text === 'Promise' &&
    node.typeArguments?.length === 1
      ? (node.typeArguments[0] as ts.TypeNode)
      : node;
  if (inner.kind === ts.SyntaxKind.VoidKeyword) return undefined;
  return parser.typeOf(inner);
};

/** Fails with every syntax error of the file, or returns the parsed source. */
export const parseSourceOrFail = (fileName: string, text: string): ts.SourceFile => {
  const source = createSourceFile(fileName, text);
  const syntax = syntaxDiagnostics(source, fileName);
  if (syntax.length > 0) throw new ProjectionError(syntax);
  return source;
};

/** The one top-level declaration a projected file must consist of (comments around it are fine). */
export const singleTopLevelStatement = (parser: Parser, source: ts.SourceFile, expected: string): ts.Statement => {
  const statements = source.statements.filter((statement) => !isEmptyExport(statement));
  const [first, extra] = statements;
  if (!first) parser.fail(source, `The file is empty: it must contain ${expected}.`);
  if (extra) parser.fail(extra, `A file holds exactly one ${expected}; move other code into it or into another file.`);
  return first;
};

const isEmptyExport = (statement: ts.Statement): boolean =>
  ts.isExportDeclaration(statement) &&
  !statement.moduleSpecifier &&
  statement.exportClause !== undefined &&
  ts.isNamedExports(statement.exportClause) &&
  statement.exportClause.elements.length === 0;

/** `functions/<name>.ts` text → a fresh `function` root (new ids everywhere — the matcher restores them). */
export const parseFunctionFile = (
  text: string,
  fileName: string,
  expectedName: string,
  ctx: IProjectionContext,
): INode => {
  const source = parseSourceOrFail(fileName, text);
  const parser: Parser = new Parser(source, ctx, fileName);
  const statement = singleTopLevelStatement(parser, source, `\`export async function ${expectedName}(…) { … }\``);
  if (!ts.isFunctionDeclaration(statement) || !statement.body) {
    parser.fail(statement, `Expected \`export async function ${expectedName}(…): Promise<…> { … }\`.`);
  }
  const name = statement.name?.text ?? '';
  if (name !== expectedName) {
    parser.fail(
      statement.name ?? statement,
      `The function in ${fileName} must be named \`${expectedName}\` (the file name). Renaming is not supported here.`,
    );
  }
  const parameters = parseParameters(parser, statement.parameters);
  const returnValue = parseReturnType(parser, statement.type);
  const list = parser.list(statement.body);
  const root: INode = {
    children: [
      { data: readJsDoc(source, statement), id: parser.newId(), name: 'function-header' },
      {
        children: list.nodes,
        data: returnValue ? { parameters, returnValue } : { parameters },
        id: parser.newId(),
        name: 'function-body',
      },
      { data: list.footer ?? '', id: parser.newId(), name: 'function-footer' },
    ],
    id: parser.newId(),
    name: 'function',
  };
  return foldOuts(root, ctx);
};
