import type { INode, IProjectDocument } from '@falang/dto';
import { CODE_DOCUMENT_TYPE_BY_LANGUAGE, CODE_ROOT_NODE_NAME, type TCodeLanguage } from '@falang/simple-code-dto';
import { convertStatement, fixFirstStatementOut, type IConvertContext } from './convert-common.js';
import type { IOldBlock, IOldIcon, IOldScheme } from './old-types.js';

/**
 * Old `console_cpp`/`console_js`/`console_ts`/`console_php`/`console_rust` → new `simple-code-*`. Every
 * field in both the old and new shape is one raw, unvalidated source-code string (`block.code` ↔
 * `codeDataType`) — confirmed field-for-field against `console_js`'s real `Main.falang.json` /
 * `helloWorld.falang.json` (`block.code`, `header.code`, `footer.code` on the root `function` icon
 * match `code-function`/`code-function-header`/`code-function-footer`'s `data` exactly).
 */
const codeText = (block: IOldBlock | undefined, id: string): string => {
  if (typeof block?.code !== 'string') throw new Error(`Old code-domain node ${id} is missing "block.code"`);
  return block.code;
};

const convertLeaf = (old: IOldIcon): INode => {
  if (old.alias === 'action') return { id: old.id, name: 'action', data: codeText(old.block, old.id) };
  throw new Error(`Unsupported old icon alias for a code-domain project: "${old.alias}" (node ${old.id})`);
};

const context: IConvertContext = {
  conditionText: codeText,
  foreachData: codeText,
  // No "returnValue"-variable convention in the code domain (no structured create-var/assign-var
  // statements to piggyback on) — the return expression is the out node's own raw code, same as
  // `throw`. Best-effort: no real `console_*` sample uses an explicit `out{type:'return'}` node.
  finalizeReturn: (children, out) => ({ children, data: out.block?.code ?? '' }),
  convertLeaf,
};

export const convertCodeDocument = (scheme: IOldScheme, language: TCodeLanguage): IProjectDocument => {
  const root = scheme.root;
  if (root.alias !== 'function')
    throw new Error(`Expected a "function" root icon in code-domain document ${scheme.id}, got "${root.alias}"`);

  const bodyStatements = fixFirstStatementOut(
    (root.children ?? []).flatMap((child) => convertStatement(child, context)),
    `${CODE_ROOT_NODE_NAME}-body`,
  );

  const rootNode: INode = {
    id: root.id,
    name: CODE_ROOT_NODE_NAME,
    children: [
      { id: `${root.id}-header`, name: `${CODE_ROOT_NODE_NAME}-header`, data: codeText(root.header, root.id) },
      {
        id: `${root.id}-body`,
        name: `${CODE_ROOT_NODE_NAME}-body`,
        data: codeText(root.block, root.id),
        children: bodyStatements,
      },
      { id: `${root.id}-footer`, name: `${CODE_ROOT_NODE_NAME}-footer`, data: codeText(root.footer, root.id) },
    ],
  };

  return { id: scheme.id, type: CODE_DOCUMENT_TYPE_BY_LANGUAGE[language], name: scheme.name, root: rootNode };
};
