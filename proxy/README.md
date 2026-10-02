# falang-proxy

A small standalone HTTP forward proxy used as an egress point for outbound integration traffic (see ADR 0056
(private)). Zero runtime dependencies (`node:http`/`node:net`), Node >= 24, run with `tsx`. Like `activepieces/` it is
**not** an npm workspace member: own `package.json`/lockfile, talked to over HTTP only.

- `CONNECT host:port` tunnels (HTTPS, and what undici's `ProxyAgent` uses for every target);
- absolute-URI plain HTTP requests (`GET http://host/path`), forwarded with hop-by-hop headers removed
  (`https://` absolute URIs are rejected with 400 — use CONNECT);
- auth on every request/tunnel: `Proxy-Authorization: Bearer <token>` or `Basic base64(<any user>:<token>)`,
  constant-time comparison; otherwise `407` with `Proxy-Authenticate: Basic realm="falang-proxy"`;
- `GET /health` (no auth) → `200 ok`; optional `GET /__stats` (auth required) → `{ "connections": { "host:port": n } }`;
- one access log line per request/tunnel on stdout (`<method> <target> <status>`), never the token.

## Environment

| Variable              | Default  | Meaning                                                               |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `HTTP_PORT`           | `8080`   | listen port                                                           |
| `PROXY_TOKENS`        | required | comma-separated accepted tokens; the process refuses to start if none |
| `PROXY_ALLOWED_PORTS` | `443,80` | allowed target ports, `*` = any                                       |
| `PROXY_EXPOSE_STATS`  | `false`  | `true` enables `GET /__stats` (meant for e2e only)                    |

## Run

```sh
npm install
PROXY_TOKENS=s3cret npm start          # or: docker build -t falang-proxy . && docker run -e PROXY_TOKENS=s3cret -p 8080:8080 falang-proxy
npm run check && npm test
```

## Examples

```sh
curl -x http://u:s3cret@127.0.0.1:8080 https://example.com/        # Basic via CONNECT
curl -x http://127.0.0.1:8080 --proxy-header 'Proxy-Authorization: Bearer s3cret' http://example.com/
curl http://127.0.0.1:8080/health
```

## Security notes

- Always keep `PROXY_ALLOWED_PORTS` narrow in production; `*` lets a token holder reach any port of any host the
  proxy can reach (including its own network). The proxy does not filter destination addresses.
- Tokens travel in a header: put the proxy behind TLS or on a private network.
- Tokens are never logged; do not enable `PROXY_EXPOSE_STATS` outside test stacks.
