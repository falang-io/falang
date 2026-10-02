# falang-workflow-activepieces

Standalone service hosting ActivePieces piece packages (outside the npm workspace; talked to over HTTP only).

## Egress proxy routing (ADR 0056 (private))

Piece traffic can be sent through a platform-configured HTTP proxy (`CONNECT` tunnel, `Proxy-Authorization: Bearer`).
The runtime lives in `src/egress/` (a copy of `@falang/workflow-egress`, which this service cannot import) and is
installed once by `main.ts` (`installEgress()`):

- **Vendor context**: `run`/`poll`/`options` handlers run piece code inside `runWithPieceEgress(pieceName, …)`, i.e. an
  `AsyncLocalStorage` set to `activepieces-<pieceName>` (kept on `globalThis` under `Symbol.for('falang.egress.vendor')`).
- **Config**: before the handler body, the request's `projectId`/`internalProjectToken` are used for
  `GET ${BACKEND_INTERNAL_URL}/internal/egress-proxy/:projectId`; the platform-wide result is cached for 30 s, a failed
  refresh keeps the last good value (no proxy if there never was one) and logs one warning.
- **Decision**: proxied iff a config exists, the current vendor is in `config.vendors` and the target is not the
  origin of `BACKEND_INTERNAL_URL`.
- **fetch**: undici's global dispatcher routes to a `ProxyAgent` or a direct `Agent`.
- **axios / `http(s).request`**: `http.globalAgent`/`https.globalAgent` are replaced by subclasses whose
  `createConnection` opens the `CONNECT` tunnel asynchronously (Node's `Agent` accepts the callback form) and, for
  https, runs `tls.connect` over the tunnel. The pool key gets a marker for proxied requests so a kept-alive tunnel is
  never reused by a direct request.

Limitations: requests that pass their own `agent` (or `HTTP(S)_PROXY`-aware clients that build one), raw `net`/TCP
clients (database pieces: `postgres`, `mysql`, `mongodb`, `imap`, `smtp`) and SOCKS are not routed.
