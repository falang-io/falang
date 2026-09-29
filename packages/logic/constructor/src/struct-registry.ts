import type { IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import type { IStructDefinition } from './struct-definition.js';

export interface IStructRegistry {
  /** thread node id -> struct name, the shape `compileExpression`'s `structNames` param already expects. */
  readonly structNames: ReadonlyMap<string, string>;
  /** thread node id -> full definition (name + properties), for emitting the actual `struct { ... }` bodies. */
  readonly structDefinitions: ReadonlyMap<string, IStructDefinition>;
  /**
   * thread node id -> owning `objects-structure` document's own id/name — needed by per-document-file
   * targets (`compileRustProject`, see ADR 0019 (private)'s "Rust target — old-app layout"
   * implementation notes) to fully-qualify a struct type as `crate::falang::<DocName>::<StructName>`
   * and to know which struct declarations belong in which generated file. Single-translation-unit
   * targets (cpp/Go/C#) simply don't read this.
   */
  readonly structDocumentId: ReadonlyMap<string, string>;
  readonly structDocumentName: ReadonlyMap<string, string>;
  /** `objects-structure` document id -> its own thread ids, in declaration order — the per-document grouping `compileRustProject` walks to emit one file per document. */
  readonly documentStructIds: ReadonlyMap<string, readonly string[]>;
}

interface IObjectPropertyData {
  readonly name: string;
  readonly variableType: TVariableInfo;
}

/**
 * Walks every `objects-structure` document's threads (one per struct — see `mindTreeCfg`'s
 * root/header/body/thread/child shape in `@falang/typescript-dto`) into a project-wide struct
 * registry, keyed by the thread node's own id — the same id a `{ type: 'struct', id }`
 * `TVariableInfo` value references (confirmed against `@falang/typescript-scheme`'s
 * `TypesRegistryStore`/`updateTypesRegistryFromINode`, which resolves struct types the same way
 * for the editor's Monaco hidden-scope code).
 */
export const buildStructRegistry = (documents: readonly IProjectDocument[]): IStructRegistry => {
  const structNames = new Map<string, string>();
  const structDefinitions = new Map<string, IStructDefinition>();
  const structDocumentId = new Map<string, string>();
  const structDocumentName = new Map<string, string>();
  const documentStructIds = new Map<string, readonly string[]>();

  for (const document of documents) {
    if (document.type !== OBJECTS_STRUCTURE_NAME || !document.root) continue;
    const [, body] = document.root.children ?? [];
    const threadIds: string[] = [];
    for (const thread of body?.children ?? []) {
      const name = typeof thread.data === 'string' ? thread.data : thread.id;
      const properties: Record<string, TVariableInfo> = {};
      for (const child of thread.children ?? []) {
        const data = child.data as IObjectPropertyData;
        properties[data.name] = data.variableType;
      }
      structNames.set(thread.id, name);
      structDefinitions.set(thread.id, { name, properties });
      structDocumentId.set(thread.id, document.id);
      structDocumentName.set(thread.id, document.name);
      threadIds.push(thread.id);
    }
    documentStructIds.set(document.id, threadIds);
  }

  return { structNames, structDefinitions, structDocumentId, structDocumentName, documentStructIds };
};

/** Every struct id a `TVariableInfo` directly or transitively (via array/struct nesting) refers to. */
export const collectStructDependencyIds = (type: TVariableInfo): readonly string[] => {
  if (type.type === 'struct') return [type.id];
  if (type.type === 'array') return collectStructDependencyIds(type.elementType);
  return [];
};
