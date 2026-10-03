import type { INode } from '@falang/dto';
import type { IScopeVariable } from '@falang/typescript-common';
import {
  MAGIC_FUNCTION_BODY_NAME,
  MAGIC_FUNCTION_FOOTER_NAME,
  MAGIC_FUNCTION_HEADER_NAME,
  MAGIC_FUNCTION_NAME,
  type TMagicData,
} from '@falang/workflow-dto';
import { nanoid } from 'nanoid';

const clone = <T>(value: T): T => structuredClone(value);

/**
 * The transient popup document for one magic node (never persisted): header = the spell, body = a deep
 * clone of the node's children (ids kept, so a result can be matched back), footer, plus the variables in
 * scope where the magic node sits (`collectScopeVariables` of it in the main scheme) as body `outerScope`.
 */
export const buildMagicFunctionDocument = (magicNode: INode, outerScope: IScopeVariable[]): INode => ({
  id: nanoid(),
  name: MAGIC_FUNCTION_NAME,
  children: [
    {
      id: nanoid(),
      name: MAGIC_FUNCTION_HEADER_NAME,
      data: { spell: (magicNode.data as Partial<TMagicData> | undefined)?.spell ?? '' } satisfies TMagicData,
    },
    {
      id: nanoid(),
      name: MAGIC_FUNCTION_BODY_NAME,
      data: { outerScope: clone(outerScope) },
      children: clone([...(magicNode.children ?? [])]),
    },
    { id: nanoid(), name: MAGIC_FUNCTION_FOOTER_NAME },
  ],
});

/** Reads the spell and the steps back out of a popup document (deep-cloned, ready to write into the main magic node). */
export const readMagicFunctionDocument = (root: INode): { spell: string; children: INode[] } => {
  const header = root.children?.find((child) => child.name === MAGIC_FUNCTION_HEADER_NAME);
  const body = root.children?.find((child) => child.name === MAGIC_FUNCTION_BODY_NAME);
  return {
    spell: (header?.data as Partial<TMagicData> | undefined)?.spell ?? '',
    children: clone([...(body?.children ?? [])]),
  };
};
