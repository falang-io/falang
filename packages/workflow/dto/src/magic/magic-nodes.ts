import { nanoid } from 'nanoid';
import { zod, type IDataInfo, type INode, type INodeConfig } from '@falang/dto';

const spellDataType = {
  type: zod.object({ spell: zod.string() }),
  default: () => ({ spell: '' }),
} as const satisfies IDataInfo;

export const MAGIC_NAME = 'magic';
export const MAGIC_FUNCTION_NAME = 'magic-function';
export const MAGIC_FUNCTION_HEADER_NAME = 'magic-function-header';
export const MAGIC_FUNCTION_BODY_NAME = 'magic-function-body';
export const MAGIC_FUNCTION_FOOTER_NAME = 'magic-function-footer';

export type TMagicData = zod.infer<typeof spellDataType.type>;

export const createMagicNode = (spell = ''): INode => ({
  id: nanoid(),
  name: MAGIC_NAME,
  data: { spell },
  children: [],
});

/**
 * The "magic node" (ADR 0046 (private)): a transparent group. `data.spell` is a plain-language description
 * of the step, `children` are the real nodes (compiled inlined, see `@falang/workflow-compiler`). A magic
 * node can't contain another magic node (`excludeChildren`). `meta` is free-form (`handEdited`, `note`).
 */
export const magicNodesGroup: readonly INodeConfig[] = [
  {
    name: MAGIC_NAME,
    data: spellDataType,
    children: true,
    excludeChildren: [MAGIC_NAME],
    haveOut: true,
    factory: () => createMagicNode(),
  },
];

const outerScopeDataType = {
  type: zod.object({ outerScope: zod.array(zod.any()) }),
  default: () => ({ outerScope: [] as unknown[] }),
} as const satisfies IDataInfo;

/**
 * Popup-only transient document root for editing a magic node's steps: never persisted, never registered
 * in the MCP registry or the main scheme's stack. `magic-function-body`'s `outerScope` is the list of
 * variables in scope where the magic node sits (see `@falang/typescript-common`'s scope contributors).
 */
export const magicFunctionNodesGroup: readonly INodeConfig[] = [
  {
    name: MAGIC_FUNCTION_NAME,
    documentRootOnly: true,
    childTuple: [MAGIC_FUNCTION_HEADER_NAME, MAGIC_FUNCTION_BODY_NAME, MAGIC_FUNCTION_FOOTER_NAME],
    factory: () => ({
      id: nanoid(),
      name: MAGIC_FUNCTION_NAME,
      children: [
        { id: nanoid(), name: MAGIC_FUNCTION_HEADER_NAME, data: spellDataType.default() },
        { id: nanoid(), name: MAGIC_FUNCTION_BODY_NAME, children: [], data: outerScopeDataType.default() },
        { id: nanoid(), name: MAGIC_FUNCTION_FOOTER_NAME },
      ],
    }),
  },
  { name: MAGIC_FUNCTION_HEADER_NAME, data: spellDataType },
  {
    name: MAGIC_FUNCTION_BODY_NAME,
    data: outerScopeDataType,
    children: true,
    excludeChildren: [MAGIC_NAME],
  },
  { name: MAGIC_FUNCTION_FOOTER_NAME },
];
