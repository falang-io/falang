import type { ITypeRegistryObjectItem, TypesRegistryStore } from '@falang/typescript-scheme';
import type { IIntegrationStructType, IWorkflowIntegration } from '@falang/workflow-integrations-common';

/**
 * Owning id `updateTypesByParent` diffs/replaces against — vendor struct types aren't owned by any
 * project document (unlike `objects-structure`'s per-document types, see
 * `updateTypesRegistryFromINode`), so a single fixed constant stands in for "every registered
 * integration's built-in types," replaced wholesale on every scheme instantiation.
 */
export const INTEGRATION_TYPES_PARENT_ID = 'workflow-integrations';

/**
 * `IIntegrationStructType` → `ITypeRegistryObjectItem`, parametrized by `parentId` — shared by
 * `seedIntegrationTypes` below (every registered vendor's static `types`, under
 * `INTEGRATION_TYPES_PARENT_ID`) and `@falang/workflow-client-common`'s `VendorDataStore`
 * (per-instance types derived from synced vendor data, under `` `db:${instanceId}` `` — see
 * ADR 0039 (private) §5). Exported (not just used internally) so that
 * store doesn't need to re-derive the same `ITypeRegistryObjectItem` shape by hand.
 */
export const structTypeToRegistryItem = (type: IIntegrationStructType, parentId: string): ITypeRegistryObjectItem => ({
  type: 'object',
  id: type.id,
  parentId,
  name: type.name,
  properties: type.properties,
});

/**
 * Seeds `TypesRegistryStore` with every registered vendor's struct types (e.g. Telegram's incoming
 * message shape) so a trigger's `scopeType` struct reference resolves for Monaco autocomplete/hidden
 * scope code exactly like a user-authored `objects-structure` struct — see ADR 0006's open follow-up
 * "Editor-side scope typing for trigger-function bodies."
 */
export const seedIntegrationTypes = (
  integrations: readonly IWorkflowIntegration[],
  typesRegistry: TypesRegistryStore,
) => {
  const items: ITypeRegistryObjectItem[] = integrations.flatMap((integration) =>
    (integration.types ?? []).map((type) => structTypeToRegistryItem(type, INTEGRATION_TYPES_PARENT_ID)),
  );
  typesRegistry.updateTypesByParent(INTEGRATION_TYPES_PARENT_ID, items);
};
