import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * One `objects-structure` thread (a named struct), keyed everywhere in this package by the thread
 * node's own `INode.id` — the same id a `{ type: 'struct', id }` `TVariableInfo` value references
 * (matches `@falang/typescript-scheme`'s `TypesRegistryStore`/`ITypeRegistryObjectItem`, which
 * resolves struct types the same way for the Monaco editor's hidden-scope code).
 */
export interface IStructDefinition {
  readonly name: string;
  readonly properties: Readonly<Record<string, TVariableInfo>>;
}
