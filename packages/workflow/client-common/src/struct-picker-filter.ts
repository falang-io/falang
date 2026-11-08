import type { ITypeRegistryObjectItem, TTypesPickerFilter } from '@falang/typescript-scheme';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
// Deep import for the same reason as `vendor-data-store.ts`: the package root pulls in monaco.
import { INTEGRATION_TYPES_PARENT_ID } from '@falang/workflow-scheme/src/registry/seed-integration-types.js';
import { getVendorsInUse } from './agent/integration-catalog.js';

export interface IStructPickerFilterParams {
  /** Every vendor whose static `types` were seeded into the registry (`REGISTERED_INTEGRATIONS`). */
  readonly integrations: readonly IWorkflowIntegration[];
  /** Vendors this deployment offers — their credential-less ones count as connected (`getVendorsInUse`). */
  readonly getEnabledIntegrations: () => readonly IWorkflowIntegration[];
  /** The project's integration instances (read on every call — observable in the editor). */
  readonly getInstances: () => readonly IIntegrationInstance[];
}

/**
 * The workflow product's `TTypesPickerFilter`: a vendor's static struct types are offered by the type pickers only
 * while the vendor is connected — the project has an instance of it in the `Integrations` document, or the vendor
 * needs no credentials at all (`files`, `http-request`, …; the same rule as the in-app agent's `list_types`). The
 * project's own interfaces, synced database tables (`db:<instanceId>`) and project tables are always offered. Only
 * the pickers are narrowed: every type stays registered for Monaco and the compilers.
 */
export const createStructPickerFilter = (params: IStructPickerFilterParams): TTypesPickerFilter => {
  const vendorsByType = new Map<string, string[]>();
  for (const integration of params.integrations) {
    for (const type of integration.types ?? []) {
      const vendors = vendorsByType.get(type.id);
      if (vendors) vendors.push(integration.vendor);
      else vendorsByType.set(type.id, [integration.vendor]);
    }
  }
  return (items: readonly ITypeRegistryObjectItem[]) => {
    const inUse = getVendorsInUse(params.getEnabledIntegrations(), params.getInstances());
    return items.filter((item) => {
      if (item.parentId !== INTEGRATION_TYPES_PARENT_ID) return true;
      const vendors = vendorsByType.get(item.id);
      // A seeded type no static vendor declares (shouldn't happen) is left visible rather than lost.
      return !vendors || vendors.some((vendor) => inUse.has(vendor));
    });
  };
};
