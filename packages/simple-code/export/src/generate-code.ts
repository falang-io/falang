import type { INode } from '@falang/dto';
import { CODE_ROOT_NODE_NAME, type TCodeLanguage } from '@falang/simple-code-dto';
import { CodeBuilder } from './code-builder.js';
import { codeGenerators } from './code-generators.js';
import type { TCodeNodeKind } from './generators/types.js';

const dataOf = (node: INode): string => (typeof node.data === 'string' ? node.data : '');

const KNOWN_NODE_KINDS = [
  'action',
  'if',
  'switch',
  'while',
  'foreach',
  'pseudo-cycle',
  'break',
  'continue',
  'return',
  'throw',
] satisfies readonly TCodeNodeKind[];

const nodeKindOf = (node: INode): TCodeNodeKind | undefined => {
  if (node.name === CODE_ROOT_NODE_NAME) return 'function';
  return KNOWN_NODE_KINDS.find((kind) => kind === node.name);
};

/** Walks one `code` document's node tree (rooted at a `code-function` node) into a single source
 * string via simple string concatenation with indentation — no compilation/type-checking, unlike
 * `@falang/logic-constructor`. */
export const generateCode = (root: INode, language: TCodeLanguage): string => {
  const config = codeGenerators[language];
  const builder = new CodeBuilder();

  const generateNode = (node: INode): void => {
    const kind = nodeKindOf(node);
    if (!kind) {
      builder.print(`${config.commentLinePrefix} !!! no generator for node "${node.name}" (${node.id})`);
      return;
    }
    config.nodes[kind]({ node, data: dataOf(node), builder, generateNode });
  };

  if (config.fileStart) builder.print(config.fileStart);
  generateNode(root);
  if (config.fileEnd) builder.print(config.fileEnd);
  return builder.get();
};
