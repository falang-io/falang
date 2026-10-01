import { nanoid } from 'nanoid';
import type { INode, IProjectDocument } from '@falang/dto';
import { convertStatement, fixFirstStatementOut, type IConvertContext } from './convert-common.js';
import type { IOldBlock, IOldIcon, IOldLifegramFunction, IOldScheme } from './old-types.js';

/**
 * Old `text` project documents: a plain `function` icon (single function, no named exit points) or
 * `lifegram_root` (multiple functions plus a shared "finish" — no real sample of this one exists,
 * see `old-types.ts`'s module doc; mapped best-effort). Both merge into one `contour` document —
 * `@falang/text-dto`'s `countourNodeConfig` unifies exactly this old `function`/`lifegram` split
 * (see ADR 0005 (private)).
 */
const textLeaf = (block: IOldBlock | undefined, id: string): string => {
  if (typeof block?.text !== 'string') throw new Error(`Old text-domain node ${id} is missing "block.text"`);
  return block.text;
};

const convertLeaf = (old: IOldIcon): INode => {
  if (old.alias === 'action') return { id: old.id, name: 'action', data: textLeaf(old.block, old.id) };
  if (old.alias === 'link') {
    const schemeId = old.block?.schemeId;
    if (!schemeId) throw new Error(`Old "link" node ${old.id} is missing "block.schemeId"`);
    return { id: old.id, name: 'link', data: { documentId: schemeId } };
  }
  throw new Error(`Unsupported old icon alias for a text-domain project: "${old.alias}" (node ${old.id})`);
};

/** Node kinds of the text stack that accept a `timer` mod (keep in step with `@falang/text-dto`). */
const TIMER_HOSTS = new Set(['action', 'link', 'if', 'switch', 'foreach', 'while']);

const convertLeftSide = (leftSide: IOldIcon, host: INode): INode[] => {
  if (!TIMER_HOSTS.has(host.name)) {
    throw new Error(
      `Old node ${host.id} ("${host.name}") has a side icon, which only ${[...TIMER_HOSTS].join('/')} support`,
    );
  }
  return [{ id: leftSide.id, name: 'timer', data: textLeaf(leftSide.block, leftSide.id) }];
};

const context: IConvertContext = {
  convertLeftSide,
  conditionText: textLeaf,
  foreachData: textLeaf,
  // No structured "returnValue" convention in the text domain (no create-var/assign-var statement
  // kind to piggyback on, same reasoning as the code domain) — best-effort, no real sample uses an
  // explicit `out{type:'return'}` node in a text project.
  finalizeReturn: (children, out) => ({ children, data: out.block?.text ?? '' }),
  convertLeaf,
};

/** One old `function` icon (a real document root, or one `LifegramDto.functions[]` entry) → one `contour-function`. */
const convertContourFunction = (fn: {
  id: string;
  block?: IOldBlock;
  children?: IOldIcon[];
  footer?: IOldBlock;
}): INode => ({
  id: fn.id,
  name: 'contour-function',
  children: [
    {
      id: nanoid(),
      name: 'contour-function-body',
      data: fn.block?.text ?? '',
      children: fixFirstStatementOut(
        (fn.children ?? []).flatMap((child) => convertStatement(child, context)),
        'contour-function-body',
      ),
    },
    {
      id: nanoid(),
      name: 'contour-function-footer',
      children: [{ id: nanoid(), name: 'contour-function-return', data: fn.footer?.text ?? '' }],
    },
  ],
});

/** `LifegramFunctionDto` has multiple named `returns[]` instead of one scalar `footer` — one `contour-function-return` each. */
const convertLifegramFunction = (fn: IOldLifegramFunction): INode => ({
  id: fn.id,
  name: 'contour-function',
  children: [
    {
      id: nanoid(),
      name: 'contour-function-body',
      data: fn.block?.text ?? '',
      children: fixFirstStatementOut(
        (fn.children ?? []).flatMap((child) => convertStatement(child, context)),
        'contour-function-body',
      ),
    },
    {
      id: nanoid(),
      name: 'contour-function-footer',
      children: (fn.returns ?? []).map((returnBlock) => ({
        id: nanoid(),
        name: 'contour-function-return',
        data: returnBlock.text ?? '',
      })),
    },
  ],
});

export const convertTextDocument = (scheme: IOldScheme): IProjectDocument => {
  const root = scheme.root;

  if (root.alias === 'function') {
    const rootNode: INode = {
      id: nanoid(),
      name: 'contour',
      children: [
        { id: nanoid(), name: 'contour-header', data: root.header?.text ?? '' },
        { id: nanoid(), name: 'contour-body', data: '', children: [convertContourFunction(root)] },
        { id: nanoid(), name: 'contour-finish', data: '', children: [] },
        { id: nanoid(), name: 'contour-finish-footer', data: '' },
      ],
    };
    return { id: scheme.id, type: 'contour', name: scheme.name, root: rootNode };
  }

  if (root.alias === 'lifegram_root') {
    // Best-effort — no real `lifegram_root` sample exists, see `old-types.ts`'s module doc.
    const finish = root.finish;
    if (!finish) throw new Error(`Old "lifegram_root" node ${root.id} is missing "finish"`);
    const rootNode: INode = {
      id: root.id,
      name: 'contour',
      children: [
        { id: nanoid(), name: 'contour-header', data: root.headerBlock?.text ?? '' },
        {
          id: nanoid(),
          name: 'contour-body',
          data: '',
          children: (root.functions ?? []).map((fn) => convertLifegramFunction(fn)),
        },
        {
          id: finish.id,
          name: 'contour-finish',
          data: finish.block?.text ?? '',
          children: fixFirstStatementOut(
            (finish.children ?? []).flatMap((child) => convertStatement(child, context)),
            'contour-finish',
          ),
        },
        { id: nanoid(), name: 'contour-finish-footer', data: finish.return?.text ?? '' },
      ],
    };
    return { id: scheme.id, type: 'contour', name: scheme.name, root: rootNode };
  }

  throw new Error(
    `Unsupported old root icon alias for a text-domain document: "${root.alias}" (document ${scheme.id})`,
  );
};
