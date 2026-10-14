import type { NodeStore } from '@falang/scheme';
import type { ICheckedField, IFieldCheckContext } from './checked-field.js';

/** Describes the fields of one node kind as the type checker sees them. Pure: reads observable state only. */
export type TFieldDescriber = (node: NodeStore, ctx: IFieldCheckContext) => ICheckedField[];

/** A describer for a family of node kinds that cannot be listed by name (e.g. one node kind per integration action). */
export interface IFieldDescriberResolver {
  /** Returns the describer for `node`, or `undefined` when this resolver doesn't know the node. */
  resolve(node: NodeStore): TFieldDescriber | undefined;
}

const describersByName = new Map<string, TFieldDescriber>();
const resolvers: IFieldDescriberResolver[] = [];

/**
 * Registers (or replaces) the describer of a node kind. This is the extension point for other packages: the
 * TypeScript blocks register themselves in `builtin-describers.ts`; `@falang/workflow-scheme` registers its
 * integration blocks the same way.
 */
export const registerFieldDescriber = (nodeName: string, describer: TFieldDescriber): void => {
  describersByName.set(nodeName, describer);
};

export const unregisterFieldDescriber = (nodeName: string): void => {
  describersByName.delete(nodeName);
};

/** Registers a resolver consulted for nodes that have no describer registered by name. Returns an unregister function. */
export const registerFieldDescriberResolver = (resolver: IFieldDescriberResolver): (() => void) => {
  resolvers.push(resolver);
  return () => {
    const index = resolvers.indexOf(resolver);
    if (index !== -1) resolvers.splice(index, 1);
  };
};

export const findFieldDescriber = (node: NodeStore): TFieldDescriber | undefined => {
  const byName = describersByName.get(node.name);
  if (byName) return byName;
  for (const resolver of resolvers) {
    const found = resolver.resolve(node);
    if (found) return found;
  }
};
