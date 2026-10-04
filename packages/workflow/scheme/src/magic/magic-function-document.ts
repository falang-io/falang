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

/**
 * Deep clone of plain JSON-shaped data that may hold MobX observables at any depth (a live node store's
 * `data`, `collectScopeVariables`' types) — `structuredClone` throws on such a Proxy.
 */
const clone = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((item: unknown) => clone(item)) as T;
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = clone(item);
  return result as T;
};

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
