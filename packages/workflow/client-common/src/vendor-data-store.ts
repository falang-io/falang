import { action, makeObservable, ObservableMap, ObservableSet, runInAction } from 'mobx';
import type { TypesRegistryStore } from '@falang/typescript-scheme';
// Deep import (not the package root, which unconditionally re-exports `integrations.module.js` and so
// transitively pulls in `@falang/typescript-scheme`'s real, `window`-touching monaco-editor module
// graph) — same "reach past the heavy aggregated index" pattern
// `@falang/desktop-arduino-dto`'s consumers already use, needed here because this file (and its test)
// run in this package's plain-node Vitest environment (no jsdom). `structTypeToRegistryItem` itself has
// no such dependency — it's a pure object-literal mapper.
import { structTypeToRegistryItem } from '@falang/workflow-scheme/src/registry/seed-integration-types.js';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { workflowApi, type IApiVendorData } from './api-client.js';

/**
 * `TypesRegistryStore.updateTypesByParent`'s owning id for one configured instance's derived struct
 * types (ADR 0039 (private) §5) — mirrors `@falang/workflow-scheme`'s own
 * `INTEGRATION_TYPES_PARENT_ID` (one shared parent for every vendor's *static* `types`), but scoped
 * per instance since these types depend on that instance's own synced schema, not just its vendor.
 */
export const vendorDataTypesParentId = (instanceId: string): string => `db:${instanceId}`;

const isVendorDataCapable = (integration: IWorkflowIntegration): boolean =>
  Boolean(integration.syncVendorData) || Boolean(integration.instanceTypes);

/**
 * Per-instance backend-written vendor data (ADR 0039 (private) §4) — e.g. a
 * database credential's synced table schema. Owned by `WorkflowStore` (one per open project):
 * `loadAll` fetches every vendor-data-capable instance's stored data once, right after the project's
 * `integrations` document is known; `sync` re-runs one instance's "Sync structure" and updates it in
 * place; `registerInstanceTypes` turns the current `byInstance` data into `TypesRegistryStore` entries
 * — a separate step (not folded into `loadAll`/`sync` themselves) since it also needs to re-run
 * whenever the `integrations` document changes on its own (an instance renamed, or removed) with no
 * new vendor data fetched at all. Deliberately holds no reference to `TypesRegistryStore` or the
 * integration catalog itself, so it stays trivially testable — `WorkflowStore` supplies both as
 * arguments.
 */
export class VendorDataStore {
  readonly byInstance = new ObservableMap<string, IApiVendorData>();
  readonly syncing = new ObservableSet<string>();

  /** Instance ids this store has ever registered types for — so a since-removed/renamed instance's
   *  `db:<id>` parent can be cleared, not just left to grow forever. Not itself observable: it only
   *  ever affects `registerInstanceTypes`' own side effect on `typesRegistry`. */
  private readonly registeredInstanceIds = new Set<string>();

  constructor() {
    makeObservable(this);
  }

  /**
   * Fetches every vendor-data-capable instance's stored data in parallel. Called once, right after
   * `WorkflowStore`'s initial `GET /documents` load resolves (so the `integrations` document's
   * instances are known) — never polled, since nothing outside an explicit "Sync structure" click
   * changes this data. A failed fetch for one instance is logged and otherwise ignored (that instance
   * just reads as "not synced" — the same "not synced until re-pressed" gap the ADR already accepts
   * for a re-imported/restored project), never aborting the rest.
   */
  async loadAll(
    projectId: string,
    integrations: readonly IWorkflowIntegration[],
    instances: readonly IIntegrationInstance[],
  ): Promise<void> {
    const capable = instances.filter((instance) => {
      const integration = integrations.find((item) => item.vendor === instance.vendor);
      if (!integration) return false;
      return isVendorDataCapable(integration);
    });
    await Promise.all(
      capable.map(async (instance) => {
        try {
          const data = await workflowApi.getIntegrationVendorData(projectId, instance.id);
          runInAction(() => {
            this.byInstance.set(instance.id, data);
          });
        } catch (error) {
          // oxlint-disable-next-line no-console
          console.error(`VendorDataStore: failed to load vendor data for instance ${instance.id}`, error);
        }
      }),
    );
  }

  /**
   * "Sync structure" — `IntegrationsEditor`'s button for one instance. Rethrows on failure (unlike
   * `loadAll`, which is a background prefetch) so the caller can show it via `message.error`.
   */
  async sync(projectId: string, instanceId: string): Promise<void> {
    runInAction(() => {
      this.syncing.add(instanceId);
    });
    try {
      const data = await workflowApi.syncIntegrationSchema(projectId, instanceId);
      runInAction(() => {
        this.byInstance.set(instanceId, data);
      });
    } finally {
      runInAction(() => {
        this.syncing.delete(instanceId);
      });
    }
  }

  /**
   * Registers every vendor-data-capable instance's derived struct types into `typesRegistry`, one
   * `db:<instanceId>` parent per instance — replacing that instance's types wholesale each call (per
   * `updateTypesByParent`'s own contract) — and clears (`[]`) the parent for any instance this store
   * previously registered but that's no longer present (deleted, or its vendor data never having a
   * `db:<id>` parent seeded in the first place, e.g. renamed to a different vendor). Call after
   * `loadAll`, after any `integrations` document change (an instance's `name` feeds `instanceTypes`
   * too), and after `sync`.
   */
  @action.bound
  registerInstanceTypes(
    typesRegistry: TypesRegistryStore,
    integrations: readonly IWorkflowIntegration[],
    instances: readonly IIntegrationInstance[],
  ): void {
    const stillPresentIds = new Set(instances.map((instance) => instance.id));
    for (const id of this.registeredInstanceIds) {
      if (!stillPresentIds.has(id)) {
        typesRegistry.updateTypesByParent(vendorDataTypesParentId(id), []);
        this.registeredInstanceIds.delete(id);
      }
    }
    for (const instance of instances) {
      const integration = integrations.find((item) => item.vendor === instance.vendor);
      if (!integration?.instanceTypes) continue;
      const parentId = vendorDataTypesParentId(instance.id);
      const vendorData = this.byInstance.get(instance.id) ?? {};
      const items = integration.instanceTypes(instance, vendorData);
      typesRegistry.updateTypesByParent(
        parentId,
        items.map((type) => structTypeToRegistryItem(type, parentId)),
      );
      this.registeredInstanceIds.add(instance.id);
    }
  }

  dispose(): void {
    this.byInstance.clear();
    this.syncing.clear();
    this.registeredInstanceIds.clear();
  }
}
