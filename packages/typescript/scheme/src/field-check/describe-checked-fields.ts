import type { NodeStore } from '@falang/scheme';
import type { ICheckedField, IFieldCheckContext } from './checked-field.js';
import { registerBuiltinFieldDescribers } from './builtin-describers.js';
import { findFieldDescriber } from './field-describer-registry.js';

/**
 * Every field of `node` the background check looks at, as the text the type checker sees. `[]` for node kinds without
 * a describer. Reads observable state only (node data, the scope above the node, the project's registries), so run
 * inside a MobX reaction it re-runs exactly when something the node's fields depend on changes.
 */
export const describeCheckedFields = (node: NodeStore, ctx: IFieldCheckContext): ICheckedField[] => {
  registerBuiltinFieldDescribers();
  return findFieldDescriber(node, ctx)?.(node, ctx) ?? [];
};
