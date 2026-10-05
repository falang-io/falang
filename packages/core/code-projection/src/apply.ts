// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { INode, NodesStack } from '@falang/dto';
import { zod } from '@falang/dto';
import { matchDocumentTree, type IMatchStats } from './match.js';
import { ProjectionError } from './types.js';

export interface IApplyResult {
  readonly root: INode;
  readonly stats: IMatchStats;
}

/**
 * The tail of every write: pair the freshly parsed tree with the current one (ids/meta kept), then validate the result
 * with the document's own `NodesStack` — the same check the editor and `set_document` use.
 */
export const matchAndValidate = (
  oldRoot: INode,
  newRoot: INode,
  stack: NodesStack,
  document: { readonly id: string; readonly name: string; readonly file: string },
): IApplyResult => {
  const matched = matchDocumentTree(oldRoot, newRoot, stack);
  try {
    stack.parseDocument({ id: document.id, name: document.name, root: matched.root });
  } catch (error) {
    if (error instanceof zod.ZodError) {
      throw new ProjectionError(
        error.issues.map((issue) => ({
          column: 1,
          file: document.file,
          line: 1,
          message: `Invalid node tree at ${issue.path.join('.') || '<root>'}: ${issue.message}`,
        })),
      );
    }
    throw error;
  }
  return matched;
};
