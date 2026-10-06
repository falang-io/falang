// oxlint-disable no-undefined, init-declarations, complexity, no-map-spread -- spike code (ADR 0061 (private))
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { nanoid } from 'nanoid';
import ts from 'typescript';
import { parseSourceOrFail } from './function-file.js';
import { Parser } from './parser.js';
import { UnsupportedNodeError } from './projector.js';
import { createTypeNames } from './simple-registries.js';
import { renderType } from './type-text.js';
import { ProjectionError, type IProjectionContext, type ITypeNames, type TNamedTypeRef } from './types.js';

/** `// @header: …` — an `objects-structure` document's header text (it has no code form of its own). */
export const TYPES_HEADER_MARK = '@header:';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

interface IProperty {
  readonly name: string;
  readonly variableType: TVariableInfo;
}

/** An `objects-structure` document → `types/<name>.ts`: one `interface` per thread, one property per child. */
export const projectTypesFile = (root: INode, types: ITypeNames): string => {
  const [header, body] = root.children ?? [];
  const blocks: string[] = [];
  const headerText = str(header?.data).trim();
  if (headerText !== '') blocks.push(`// ${TYPES_HEADER_MARK} ${headerText.replaceAll('\n', ' ')}`);
  for (const thread of body?.children ?? []) {
    const lines = (thread.children ?? []).map((child) => {
      if ((child.children ?? []).length > 0)
        throw new UnsupportedNodeError(child, 'Nested properties have no code form');
      const data = child.data as IProperty;
      return data.variableType.optional
        ? `  ${data.name}?: ${renderType({ ...data.variableType, optional: false }, types)};`
        : `  ${data.name}: ${renderType(data.variableType, types)};`;
    });
    blocks.push([`interface ${str(thread.data)} {`, ...lines, '}'].join('\n'));
  }
  return `${blocks.join('\n\n')}\n`;
};

/** Interface names a types file declares — read before parsing, so properties can refer to them. */
export const declaredInterfaces = (source: ts.SourceFile): ts.InterfaceDeclaration[] =>
  source.statements.filter((statement): statement is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(statement));

export interface IParseTypesFileOptions {
  /** The document's current tree: threads keep their ids by interface name, properties by property name. */
  readonly oldRoot?: INode;
  /** Names declared by other documents (a clash is an error — TypeScript would silently merge them). */
  readonly takenNames?: ReadonlySet<string>;
}

/**
 * `types/<name>.ts` → an `objects-structure` tree. Thread ids are what other documents' types point at (`{ type:
 * 'struct', id }`), so they are matched by interface name here instead of by the generic matcher; a renamed interface
 * gets a new id (its users then fail the type check, which names them).
 */
export const parseTypesFile = (
  text: string | ts.SourceFile,
  fileName: string,
  ctx: IProjectionContext,
  options: IParseTypesFileOptions = {},
): INode => {
  const source = parseSourceOrFail(fileName, text);
  const oldBody = options.oldRoot?.children?.[1];
  const oldThreads = new Map((oldBody?.children ?? []).map((thread) => [str(thread.data), thread]));
  const interfaces = declaredInterfaces(source);
  const ids = new Map(interfaces.map((decl) => [decl.name.text, oldThreads.get(decl.name.text)?.id ?? nanoid()]));
  // The file's own interfaces resolve to their (kept or new) thread ids, everything else through the project.
  const local = createTypeNames(new Map([...ids].map(([name, id]) => [id, name])));
  const types: ITypeNames = {
    enumName: (schemeId, iconId) => ctx.types.enumName(schemeId, iconId),
    resolve: (name): TNamedTypeRef | undefined => local.resolve(name) ?? ctx.types.resolve(name),
    structName: (id) => local.structName(id) ?? ctx.types.structName(id),
  };
  const parser: Parser = new Parser(source, { ...ctx, types }, fileName);
  const seen = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement)) continue;
    parser.fail(statement, 'A types file holds only `interface Name { property: Type; … }` declarations.');
  }
  const threads: INode[] = interfaces.map((decl) => {
    const name = decl.name.text;
    if (seen.has(name)) parser.fail(decl.name, `Interface \`${name}\` is declared twice in this file.`);
    seen.add(name);
    if (options.takenNames?.has(name))
      parser.fail(decl.name, `Interface \`${name}\` already exists in another types file.`);
    if (decl.typeParameters || decl.heritageClauses)
      parser.fail(decl, 'Generic interfaces and `extends` are not supported.');
    const oldThread = oldThreads.get(name);
    const oldChildren = new Map(
      (oldThread?.children ?? []).map((child) => [str((child.data as IProperty).name), child]),
    );
    const children: INode[] = decl.members.map((member) => {
      if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name) || !member.type) {
        parser.fail(
          member,
          'Only `name: Type;` properties are supported (no methods, index signatures or computed names).',
        );
      }
      const propertyName = member.name.text;
      const type = parser.typeOf(member.type);
      const variableType = member.questionToken ? { ...type, optional: true } : type;
      const old = oldChildren.get(propertyName);
      return {
        children: [],
        data: { name: propertyName, variableType },
        id: old?.id ?? nanoid(),
        ...(old?.meta ? { meta: old.meta } : {}),
        name: 'objects-structure-child',
      };
    });
    return {
      children,
      data: name,
      id: ids.get(name) as string,
      ...(oldThread?.meta ? { meta: oldThread.meta } : {}),
      name: 'objects-structure-thread',
    };
  });
  if (threads.length === 0) parser.fail(source, 'A types file must declare at least one interface.');
  const headerComment = (ts.getLeadingCommentRanges(source.text, 0) ?? [])
    .map((range) => source.text.slice(range.pos, range.end))
    .find((comment) => comment.startsWith(`// ${TYPES_HEADER_MARK}`));
  const oldRoot = options.oldRoot;
  return {
    children: [
      {
        data: headerComment ? headerComment.slice(`// ${TYPES_HEADER_MARK}`.length).trim() : '',
        id: oldRoot?.children?.[0]?.id ?? nanoid(),
        name: 'objects-structure-header',
      },
      { children: threads, data: null, id: oldBody?.id ?? nanoid(), name: 'objects-structure-body' },
    ],
    id: oldRoot?.id ?? nanoid(),
    ...(oldRoot?.meta ? { meta: oldRoot.meta } : {}),
    name: 'objects-structure',
  };
};

/** Thrown when a types file would drop an interface other documents still use. */
export const assertNoDroppedTypes = (
  fileName: string,
  oldRoot: INode | undefined,
  newRoot: INode,
  isUsed: (threadId: string) => string | undefined,
): void => {
  const kept = new Set((newRoot.children?.[1]?.children ?? []).map((thread) => thread.id));
  const problems = (oldRoot?.children?.[1]?.children ?? [])
    .filter((thread) => !kept.has(thread.id))
    .flatMap((thread) => {
      const user = isUsed(thread.id);
      return user
        ? [
            {
              column: 1,
              file: fileName,
              line: 1,
              message: `Interface \`${str(thread.data)}\` is still used by ${user}: keep it (or change that file first).`,
            },
          ]
        : [];
    });
  if (problems.length > 0) throw new ProjectionError(problems);
};
