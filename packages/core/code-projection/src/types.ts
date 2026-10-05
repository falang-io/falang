// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { INode, NodesStack } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type ts from 'typescript';

/** One problem in a projected file, 1-based line/column — what an agent gets back from a failed write. */
export interface ICodeDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** Thrown by the parser on the first construct it can't map back to nodes. */
export class ProjectionError extends Error {
  readonly diagnostics: readonly ICodeDiagnostic[];

  constructor(diagnostics: readonly ICodeDiagnostic[]) {
    super(diagnostics.map((d) => `${d.file}:${d.line}:${d.column} ${d.message}`).join('\n'));
    this.diagnostics = diagnostics;
  }
}

export type TNamedTypeRef =
  | { readonly kind: 'struct'; readonly id: string }
  | { readonly kind: 'enum'; readonly schemeId: string; readonly iconId: string };

/**
 * Struct/enum ids ↔ the names they are printed as. The tree keeps ids (a struct's id is a node id of its
 * `objects-structure` document, or a vendor id like `telegram/Message`); the projection prints names.
 */
export interface ITypeNames {
  structName(id: string): string | undefined;
  enumName(schemeId: string, iconId: string): string | undefined;
  resolve(name: string): TNamedTypeRef | undefined;
}

/** Project functions by name ↔ document id (`call-function`'s `schemeId`). */
export interface IFunctionNames {
  nameOf(documentId: string): string | undefined;
  idOf(name: string): string | undefined;
}

/** What a statement extension may call back into while projecting its node. */
export interface IProjector {
  readonly types: ITypeNames;
  /** Projects a statement list (children + the container's out) one level deeper, already indented. */
  block(container: INode, frame?: TJumpFrameKind): string;
  type(type: TVariableInfo): string;
  /** A template-string field as a template literal (backticks included). */
  template(body: string): string;
  /** One `case <test>: { …; break; }` clause of a switch-like node with `option`'s statements. */
  caseClause(test: string, option: INode): string;
}

/** What a statement extension may call back into while parsing its statement. */
export interface IParser {
  readonly source: ts.SourceFile;
  readonly types: ITypeNames;
  readonly stack: NodesStack;
  newId(): string;
  /** Throws a `ProjectionError` pointing at `node`. */
  fail(node: ts.Node, message: string): never;
  /** Source text of an expression, as stored in a node's data (dedented, no trailing `;`). */
  text(node: ts.Node): string;
  /** A template literal / string literal back to a template-string field body. */
  templateBody(node: ts.Expression): string;
  /** Statements of a block/single statement → child nodes of `containerName` (jumps resolved, trailing jump not yet folded into `out`). */
  statements(body: ts.Statement | readonly ts.Statement[], frame?: TJumpFrameKind): INode[];
  /** `case` clauses of a switch-like statement → `[caseExpression, statements]`, with the terminating `break;` removed. */
  /** `test` is `null` for `default:`. */
  cases(
    block: ts.CaseBlock,
  ): { readonly test: ts.Expression | null; readonly clause: ts.CaseOrDefaultClause; readonly nodes: INode[] }[];
  typeOf(node: ts.TypeNode): TVariableInfo;
}

/** `loop` frames are what `break`/`continue` levels count; `switch` frames only change what a bare `break;` means. */
export type TJumpFrameKind = 'loop' | 'switch' | 'none';

/**
 * A product's node kinds that the core statement mapping doesn't know (vendor actions, questions, …).
 * `project` returns the statement text (may span lines, no trailing newline); `parse` returns `null` when
 * the statement isn't its own.
 */
export interface IStatementExtension {
  handles(nodeName: string): boolean;
  project(node: INode, projector: IProjector): string;
  parse(statement: ts.Statement, parser: IParser): INode | null;
}

export interface IProjectionContext {
  readonly stack: NodesStack;
  readonly types: ITypeNames;
  readonly functions: IFunctionNames;
  readonly extensions?: readonly IStatementExtension[];
  /** Infers a declared variable's type when the code has no annotation (needs a type checker; absent = annotation required). */
  readonly inferType?: (declaration: ts.VariableDeclaration) => TVariableInfo | undefined;
}
