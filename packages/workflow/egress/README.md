# @falang/workflow-egress

Per-request egress routing for integration traffic (ADR 0056 (private)): lets an administrator send the outbound HTTP
traffic of selected vendors through a forward proxy (see `proxy/`) while everything else — and every internal call —
goes out directly. Node-only (no React/MobX), TypeScript sources, `undici` as the only runtime dependency.

## The rule

Whether a request is proxied is decided **per request** from two facts: the **vendor context** of the code that issued
it and its **destination**. A request is proxied iff a config exists, the current vendor is in `config.vendors`, and the
destination is not an internal origin (`isInternal`). Anything issued outside a vendor context goes direct. Hosts set the
context around vendor code only; they never install a blanket process-wide proxy.

## API

- `runWithEgressVendor(vendor, fn)` / `getEgressVendor()` — an `AsyncLocalStorage` holding the vendor id for `fn` and
  every async continuation it starts (so long-lived loops started inside inherit it). The storage lives on `globalThis`
  under `Symbol.for('falang.egress.vendor')`, not in module scope: the package can be loaded twice in one process (a
  runner bundle next to the host's copy, or the ActivePieces service's own copy of the runtime) and separate instances
  would never see each other's context.
- `createEgressDispatcher({ getConfig, isInternal? })` — an undici `Dispatcher` delegating to a direct `Agent` or a
  `ProxyAgent` (`Proxy-Authorization: Bearer <token>`) cached per `(url, token)`. `getConfig` is synchronous: hosts keep
  a refreshed copy in memory.
- `installEgressRouting(options)` — `setGlobalDispatcher` with the above; returns `{ dispose() }` restoring the previous
  dispatcher. Covers Node's global `fetch`.
- `createInternalOriginMatcher(urls)` — builds an `isInternal` predicate from origin URLs (undefined entries ignored).
- `createEgressConfigPoller({ load, intervalMs = 30000 })` — `{ get(), ready, dispose() }`; keeps the last good value when
  a refresh fails (one warning per failure streak); `ready` resolves after the first attempt and never rejects.
- `fetchEgressProxyConfig` — loads `GET /internal/egress-proxy/:projectId` (`ProjectTokenGuard`) →
  `{ proxy: { url, token, vendors } | null }`.
- Types: `IEgressProxyConfig`, `IEgressRoutingOptions`.

## Hosts

- `@falang/workflow-backend` — `EgressRoutingService` (`AppModule` only; `EGRESS_ROUTING=off` disables it), config from
  the admin proxy settings, refreshed every 15 s.
- `@falang/workflow-runner` — wraps each activity named in the compiled `__falangActivityVendors` map in
  `runWithEgressVendor`, config polled every 30 s.
- `activepieces/` keeps its own copy of this runtime (it cannot import workspace packages) plus `http`/`https`
  `globalAgent` replacements for axios-based pieces.

Not routed: raw TCP clients (database vendors), SOCKS, code that passes its own `http`/`https` agent.

## Commands

`npm test -w @falang/workflow-egress`, `npm run check -w @falang/workflow-egress`.
