// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import {
  matchAndValidate,
  parseFunctionFile,
  parseTypeText,
  ProjectionError,
  projectFunctionFile,
  Projector,
  renderParameters,
  renderReturnType,
  TypeTextError,
  type ICodeDiagnostic,
  type IMatchStats,
  type IProjectionContext,
} from '@falang/code-projection';
import type ts from 'typescript';
import { isValidFunctionName, type INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  FALANG_DECLARATIONS,
  integrationsDeclarations,
  typesDeclarations,
  vendorsDeclarations,
} from './declarations.js';
import { parseTriggerFile, projectTriggerFile, type ITriggerBodyData } from './trigger-file.js';
import { inferredTypeText, typeCheckFile } from './type-check.js';
import { WorkflowModel, type IWorkflowProjectDocument, type IWorkflowProjectInput } from './workflow-model.js';

export const FUNCTIONS_DIR = 'functions';
export const TRIGGERS_DIR = 'triggers';
export const READ_ONLY_FILES = ['falang.d.ts', 'vendors.d.ts', 'integrations.ts', 'types.d.ts'] as const;
/** Internal: the project's function signatures, so files can call each other without imports. */
const PROJECT_DECLARATIONS = '__project.d.ts';

export interface IProjectedFile {
  readonly path: string;
  readonly writable: boolean;
  readonly documentId?: string;
}

export interface IWriteOptions {
  /** `false` skips the type check (round-trip measurements; an agent's write is always checked). */
  readonly typeCheck?: boolean;
  /** The tree to match against instead of the document's current one. */
  readonly oldRoot?: INode;
}

export interface IWriteResult {
  /** `undefined` when the file is new — the caller creates the document. */
  readonly documentId?: string;
  readonly type: 'function' | 'trigger-function';
  readonly name: string;
  readonly root: INode;
  readonly stats: IMatchStats;
  /** For a new trigger file: the trigger binding to create the document with. */
  readonly triggerBody?: ITriggerBodyData;
}

const fileOf = (doc: IWorkflowProjectDocument): string | undefined => {
  if (doc.type === 'function') return `${FUNCTIONS_DIR}/${doc.name}.ts`;
  if (doc.type === 'trigger-function') return `${TRIGGERS_DIR}/${doc.name}.ts`;
  return undefined;
};

/** Extra advice for globals an agent reaches for out of habit. */
const NAME_HINTS: Readonly<Record<string, string>> = {
  console: 'Use log(`…`) to write to the run log.',
  fetch:
    'There is no fetch in a workflow: call an integration instance from integrations.ts (e.g. an http-request one).',
  require: 'No imports: integration instances, project functions and types are global.',
  setInterval: 'A workflow cannot use timers: use a schedule trigger.',
  setTimeout: 'A workflow cannot sleep with setTimeout: use a question with a timeout, or a schedule trigger.',
};

const withHint = (diagnostic: ICodeDiagnostic): ICodeDiagnostic => {
  const name = /Cannot find name '(\w+)'/.exec(diagnostic.message)?.[1];
  const hint = name ? NAME_HINTS[name] : undefined;
  if (!hint) return diagnostic;
  const message = diagnostic.message
    .replace(/ Do you need to change your target library\?.*$/s, '.')
    .replace(/\.\.$/, '.');
  return { ...diagnostic, message: `${message} ${hint}` };
};

const referencesReturnValue = (text: string): boolean => /\breturnValue\b/.test(text);

/** TS2366 "Function lacks ending return statement": the compiler adds `return returnValue;` itself. */
const IMPLICIT_RETURN_CODES = new Set([2366]);

/**
 * The project as a set of TypeScript files (ADR 0061): `functions/<name>.ts` and `triggers/<name>.ts` are projections
 * of the documents (writable), plus generated, read-only declarations. A write runs the whole pipeline — syntax,
 * type check against the declarations, parse to a tree, id/meta matching against the current tree, stack validation —
 * and returns the new tree; it never touches the documents itself.
 */
export class WorkflowProjection {
  readonly model: WorkflowModel;
  private readonly ctx: IProjectionContext;

  constructor(input: IWorkflowProjectInput) {
    this.model = new WorkflowModel(input);
    this.ctx = this.model.context();
  }

  private documents(): readonly IWorkflowProjectDocument[] {
    return this.model.input.documents;
  }

  private rootOf(doc: IWorkflowProjectDocument): INode {
    if (doc.root) return doc.root;
    if (doc.type === 'function') return this.model.stack.factory('function');
    throw new Error(`Document "${doc.name}" has no tree`);
  }

  listFiles(): IProjectedFile[] {
    const documents = this.documents()
      .map((doc) => ({ doc, path: fileOf(doc) }))
      .filter((entry): entry is { doc: IWorkflowProjectDocument; path: string } => entry.path !== undefined)
      .map(({ doc, path }) => ({ documentId: doc.id, path, writable: true }));
    return [...READ_ONLY_FILES.map((path) => ({ path, writable: false })), ...documents];
  }

  findDocument(path: string): IWorkflowProjectDocument | undefined {
    return this.documents().find((doc) => fileOf(doc) === path);
  }

  readFile(path: string): string {
    switch (path) {
      case 'falang.d.ts': {
        return FALANG_DECLARATIONS;
      }
      case 'vendors.d.ts': {
        return vendorsDeclarations(this.model);
      }
      case 'integrations.ts': {
        return integrationsDeclarations(this.model);
      }
      case 'types.d.ts': {
        return typesDeclarations(this.model);
      }
      default: {
        break;
      }
    }
    const doc = this.findDocument(path);
    if (!doc)
      throw new Error(
        `No such file: ${path}. Files: ${this.listFiles()
          .map((file) => file.path)
          .join(', ')}`,
      );
    return this.projectDocument(doc);
  }

  /** A function/trigger document (or a modified copy of one) as file text. */
  projectDocument(doc: IWorkflowProjectDocument): string {
    return doc.type === 'function'
      ? projectFunctionFile(this.rootOf(doc), doc.name, this.ctx)
      : projectTriggerFile(this.rootOf(doc), this.model, this.ctx);
  }

  /** `declare function` lines for every function except `exceptName` (the file being checked declares itself). */
  private projectDeclarations(returnValueType: string | undefined): string {
    const projector = new Projector(this.ctx);
    const lines = this.documents()
      .filter((doc) => doc.type === 'function')
      .map((doc) => {
        const body = this.rootOf(doc).children?.[1];
        const data = (body?.data ?? { parameters: [] }) as {
          parameters: readonly { name: string; type: TVariableInfo }[];
          returnValue?: TVariableInfo;
        };
        return `declare function ${doc.name}(${renderParameters(projector, data.parameters ?? [])}): ${renderReturnType(projector, data.returnValue)};`;
      });
    if (returnValueType)
      lines.push(
        `/** The value a function without an explicit \`return\` returns. */`,
        `declare let returnValue: ${returnValueType};`,
      );
    return lines.join('\n');
  }

  /** The checker's input: every generated declaration + the file being written. */
  private checkFiles(path: string, text: string, returnValueType: string | undefined): Map<string, string> {
    return new Map([
      ['falang.d.ts', FALANG_DECLARATIONS],
      ['vendors.d.ts', vendorsDeclarations(this.model)],
      ['integrations.d.ts', integrationsDeclarations(this.model)],
      ['types.d.ts', typesDeclarations(this.model)],
      [PROJECT_DECLARATIONS, this.projectDeclarations(returnValueType)],
      [path, text],
    ]);
  }

  /** Runs the write pipeline. Throws `ProjectionError` (every diagnostic, with file/line) on any failure. */
  writeFile(path: string, text: string, options: IWriteOptions = {}): IWriteResult {
    const match = /^(functions|triggers)\/([^/]+)\.ts$/.exec(path);
    if (!match) {
      const readOnly = (READ_ONLY_FILES as readonly string[]).includes(path);
      throw new ProjectionError([
        {
          column: 1,
          file: path,
          line: 1,
          message: readOnly
            ? `${path} is generated and read-only.`
            : 'Only functions/<name>.ts and triggers/<name>.ts files can be written.',
        },
      ]);
    }
    const [, dir, name = ''] = match;
    const type = dir === FUNCTIONS_DIR ? 'function' : 'trigger-function';
    const existing = this.findDocument(path);
    if (!existing) this.assertNewName(path, name);
    const oldRoot = options.oldRoot ?? (existing ? this.rootOf(existing) : undefined);

    let ctx: IProjectionContext = this.ctx;
    let input: string | ts.SourceFile = text;
    if (options.typeCheck !== false) {
      // Structure first (unsupported constructs, falang rules — cheap, and the errors an agent can't learn from tsc),
      // then types; a declaration without an annotation is fine at this stage.
      this.parse(type, text, path, name, { ...this.ctx, inferType: () => ({ type: 'any' }) });
      const returnValueType = this.implicitReturnType(text);
      const check = typeCheckFile(this.checkFiles(path, text, returnValueType), path, {
        ignoreCodes: returnValueType ? IMPLICIT_RETURN_CODES : undefined,
      });
      if (check.diagnostics.length > 0) throw new ProjectionError(check.diagnostics.slice(0, 20).map(withHint));
      input = check.source;
      ctx = {
        ...this.ctx,
        inferType: (declaration) => {
          try {
            return parseTypeText(inferredTypeText(check.checker, declaration), this.model.types);
          } catch (error) {
            if (error instanceof TypeTextError) return;
            throw error;
          }
        },
      };
    }
    const parsed = this.parse(type, input, path, name, ctx);
    const document = { file: path, id: existing?.id ?? 'new', name };
    const { root, stats } = oldRoot
      ? matchAndValidate(oldRoot, parsed, this.model.stack, document)
      : matchAndValidate(parsed, parsed, this.model.stack, document);
    const triggerBody = type === 'trigger-function' ? (root.children?.[1]?.data as ITriggerBodyData) : undefined;
    return {
      ...(existing ? { documentId: existing.id } : {}),
      name,
      root,
      stats: oldRoot ? stats : { fresh: stats.kept, kept: 0 },
      ...(triggerBody && !existing ? { triggerBody } : {}),
      type,
    };
  }

  private parse(
    type: 'function' | 'trigger-function',
    text: string | ts.SourceFile,
    path: string,
    name: string,
    ctx: IProjectionContext,
  ): INode {
    return type === 'function'
      ? parseFunctionFile(text, path, name, ctx)
      : parseTriggerFile(text, path, this.model, ctx);
  }

  /** When the file uses the implicit `returnValue` local of a function with a return type: that type's text. */
  private implicitReturnType(text: string): string | undefined {
    if (!referencesReturnValue(text)) return undefined;
    const match = /\):\s*Promise<(.+?)>\s*(?:=>\s*)?\{/s.exec(text);
    const type = match?.[1]?.trim();
    return type && type !== 'void' ? type : undefined;
  }

  private assertNewName(path: string, name: string): void {
    const fail = (message: string): never => {
      throw new ProjectionError([{ column: 1, file: path, line: 1, message }] satisfies ICodeDiagnostic[]);
    };
    if (!isValidFunctionName(name))
      fail(`"${name}" is not a valid name: use camelCase Latin letters and digits, e.g. greetUser.`);
    const clash = this.documents().find((doc) => doc.name.toLowerCase() === name.toLowerCase());
    if (clash) fail(`A document named "${clash.name}" already exists (${clash.type}).`);
  }
}
