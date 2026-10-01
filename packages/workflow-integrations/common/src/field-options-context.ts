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
  /** Set by the backend; a `loadOptions` that connects somewhere tenant-controlled must use it (see `IBackendEgress`). */
  readonly egress?: IBackendEgress;
}

/**
 * Backend-only outbound-connection helper handed to vendor hooks that open a connection to an address
 * taken from tenant data (`loadOptions`, `syncVendorData`). Implemented by `@falang/workflow-backend`'s
 * `net/egress-guard.ts` (SSRF guard: resolves, refuses private/loopback/link-local addresses and connects
 * only to the checked address); declared here as a plain interface so vendor packages stay free of
 * `node:*` imports (they are barrel-exported into the browser bundle).
 */
export interface IBackendEgress {
  /** `fetch` through the guard — no redirects, connect timeout, only checked addresses. */
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Resolves `host` and returns one *checked* IP to connect to (throws when blocked). Use it as the socket host and keep the original name for TLS `servername`. */
  readonly resolveHost: (host: string) => Promise<string>;
}
