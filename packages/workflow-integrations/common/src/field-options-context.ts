import type { IIntegrationInstance } from './integrations-document.js';

/**
 * Second argument to `IFieldConfig.loadOptions`, added by ADR 0039 (private)
 * §6 for a `select` field whose options come from previously-synced, backend-written vendor data
 * (e.g. a database credential's synced table list — `sql-common`'s `table` field reads
 * `vendorData.schema`) rather than a fresh live round trip. Optional so an existing `loadOptions`
 * implementation that only reads `credentialFields` (e.g. `call-ai-text`'s `model`) keeps compiling
 * and working unchanged.
 */
export interface IFieldOptionsContext {
  readonly instance: IIntegrationInstance;
  readonly vendorData: Readonly<Record<string, Record<string, unknown>>>;
}
