# @falang/workflow-local

Runs the workflow product locally without Docker, kind or Postgres (ADR 0072, private): one Node process plus the
[`temporal` CLI](https://docs.temporal.io/cli) dev server, which starts only when something needs it (see "Temporal on
demand").

```sh
npm install                 # repo root
npm run start-local         # from the repo root
```

The first run builds the client (`VITE_BACKEND_URL=same-origin`, about a minute), downloads the `temporal` CLI into
`<dataDir>/bin` when it is neither on `PATH` nor named by `FALANG_TEMPORAL_CLI`, creates `secrets.json` and seeds the
user `admin` / `admin` (change the password in Settings). Then it opens the browser.

## Flags

`--data-dir <dir>` (default `~/.falang-flow`, or `FALANG_LOCAL_DATA_DIR`), `--port` (4000), `--internal-port` (3001,
used by runner processes only), `--client-dir <dir>`, `--skip-client` (API only), `--no-browser`, `--no-ui` (no
Temporal Web UI), `--status-file <path>` (see below), `--single-user` (`SINGLE_USER_MODE=true`: the one user is signed in
by the shell without a password, so the client hides the default-password warning, the Users and Support admin pages, the
support chat, "Change password" and Logout; the desktop app passes it). Every environment variable the entry point sets (`JWT_SECRET`, `SIGNUP_MODE=off`,
`EGRESS_ALLOW_PRIVATE=true`, `TEMPORAL_ADDRESS`, …) is applied only if you have not set it already, so any of them can be
overridden from the shell.

## Optional services (`--with`)

`--with <a,b>` (or `startLocalMode({ services })`) starts optional external services before the backend and stops them
after it: `mailpit`, `egress-proxy`, `media`, `postgres-user-db`, `mysql-user-db`, `activepieces` (the names are fixed;
one not implemented yet is a start error). `--test-mode` marks an e2e run (a service may enable test-only behaviour,
e.g. ActivePieces' mock pieces). Each service lives in `src/services/<name>.ts` as an `ILocalService` and is registered by
one line in `src/services/index.ts`. Its `start(ctx)` gets its own data directory (`<dataDir>/services/<name>`), a free-port
helper, the backend's public and internal URLs, `childEnv` (the environment without the platform secrets) and
`getSecret(key)` (a value persisted in `secrets.json` next to the platform secrets). It returns `backendEnv` (applied
as `??=` defaults, after the local mode's own), `backendSecretEnv` (the same, but never passed to runner processes),
`testEnv`, the e2e capabilities it provides and `stop()`. `startSupervisedProcess` (spawn, output piped as
`[name] <line>`, wait for an HTTP URL or a TCP port with the output tail in the error, SIGTERM then SIGKILL) and
`tsxEntryCommand` (`node --import tsx <entry>`) are the shared helpers. The started services appear in the status file
as `services: { <name>: { testEnv, capabilities } }`; `npm run test-e2e:fast -- --with <list>` merges every `testEnv`
into the test environment and drops the capabilities from `FALANG_E2E_MISSING`.

Downloaded binaries go to `$FALANG_LOCAL_BIN_DIR`, default `<dataDir>/bin` (`services/managed-binary.ts`: `resolveBinary` =
env var → `PATH` → that directory; `downloadBinary` checks a pinned SHA-256, extracts with `tar`, installs atomically).
`test-e2e:fast` points it at `node_modules/.cache/falang-e2e-fast/bin` and starts all six services by default.

- **`mailpit`** (capability `mail`): an SMTP sink with a web UI and API ([mailpit](https://github.com/axllent/mailpit)).
  Binary: `FALANG_MAILPIT` → `mailpit` on `PATH` → `<bin>/mailpit`, else v1.31.6 is downloaded there (SHA-256 of the
  GitHub release asset digests pinned in `services/mailpit.ts`). SMTP and HTTP on free loopback ports; mail kept in
  `<dataDir>/services/mailpit/mailpit.db` (a temporary database in `--test-mode`). Backend: `SMTP_URL`,
  `MAIL_FROM=noreply@falang.local`; tests: `MAILPIT_URL`. For real mail don't use it — export your own `SMTP_URL`.
- **`egress-proxy`** (capability `egress-proxy`): the repository's `proxy/` (`node --import tsx proxy/src/main.ts`;
  checkouts only, or `FALANG_PROXY_ENTRY`), token `LOCAL_EGRESS_PROXY_TOKEN` from `secrets.json`; `--test-mode` also
  allows every target port and `GET /__stats`. It does not configure the product (the admin "Proxy" page does — the e2e
  spec uses the API). Tests: `E2E_PROXY_URL`, `E2E_PROXY_TOKEN`, `E2E_PROXY_STATS_URL`. `test-e2e:fast` reaches the
  Telegram mock as `localhost` from runners and `127.0.0.1` from the backend (`RUNNER_TELEGRAM_API_BASE_URL`), so the
  spec tells the two apart (`E2E_PROXY_BACKEND_TARGET`/`E2E_PROXY_POD_TARGET`).
- **`media`** (capability `media`): `@falang/workflow-media` (a dependency of this package) as
  `node --import tsx <media>/src/main.ts`, work directory `<dataDir>/services/media`. ffmpeg/ffprobe from
  `FALANG_FFMPEG`/`FALANG_FFPROBE`, else `PATH`; missing ones fail the start with an install hint (nothing is
  downloaded). Backend and runners: `MEDIA_SERVICE_URL`; tests: `MEDIA_URL`. Without `nice` (Windows) ffmpeg runs at
  normal priority.
- **`activepieces`** (capability `activepieces`): the repository's `activepieces/` (outside the npm workspace; or
  `FALANG_ACTIVEPIECES_DIR`). On start its `node_modules` is (re)installed with `npm ci` when the stamp
  `node_modules/.falang-install-stamp` (lockfile sha256 + Node ABI) is missing or stale, serialized by a pid lock file in
  the OS temp directory (taken over when its process is gone or after 30 min); then `src/main.ts` runs as one Node process
  with the service's own `tsx`, ready on `GET /health`. Backend and runners: `ACTIVEPIECES_SERVICE_URL`; backend only:
  `ACTIVEPIECES_SERVICE_SECRET` (`secrets.json`, or the exported value). `--test-mode`: `NODE_ENV=test` (mock pieces)
  and `MOCK_OAUTH_BASE_URL` on itself. Tests: `ACTIVEPIECES_URL`, `ACTIVEPIECES_SERVICE_SECRET`. ~220 MB of
  dependencies, ~8 s to start.
- **`postgres-user-db`, `mysql-user-db`** (capabilities of the same names): e2e fixtures standing in for "the user's
  own database" (the kind stack's containers), on `127.0.0.1:<free port>`, account `falang`/`falang`, database `userdb`,
  seeded from `docker/e2e-seed/*.sql` (checkouts only). Their libraries are devDependencies of this package, loaded
  lazily. The product needs neither: `EGRESS_ALLOW_PRIVATE=true` already lets "Sync structure" and runners reach a
  database on localhost. Tests: `E2E_{POSTGRES,MYSQL}_USER_DB_URL` and `…_RUNNER_URL` (the kind ports are the defaults).
  - Postgres 18 from `embedded-postgres`'s binaries, without its JS API (it installs process-wide exit hooks): `initdb` +
    seed once per data directory (`<dataDir>/services/postgres-user-db/pgdata`), fast shutdown on stop. PGlite behind
    `pglite-socket` was rejected: it multiplexes every connection onto PGlite's one session per protocol message, so
    concurrent extended-protocol queries corrupt each other's unnamed statements and portals (308 of 400 queries failed
    in a spike with two `pg` pools).
  - MySQL 8.4 from `mysql-memory-server` in a child process (`mysql-user-db-child.ts`; the library's `signal-exit`
    handlers would end the local mode on its first signal). The first start downloads ~400 MB into
    `<os tmpdir>/mysqlmsn/binaries/` (~1 min), later starts take ~8 s; a system MySQL 8.4 is used when installed. The
    database is ephemeral (deleted and re-seeded on every start).

## Control routes (for a shell such as the Electron app)

With `--status-file <path>` (or the `statusFile` option) the process writes `{ url, internalUrl, temporalAddress,
temporalUiUrl, pid, firstRun, controlToken, services }` to that file once everything is up (atomically, mode 0600) and removes it on
stop. `controlToken` is a fresh random 32-byte hex string per run and enables two routes:

- `POST /internal/local/auto-login` -> `{ accessToken }` for the seeded `admin` (same token as `POST /auth/login`);
- `POST /internal/local/temporal/start` -> 200 once the Temporal dev server is up (the shell's "Open Temporal UI");
- `POST /internal/local/shutdown` -> 202, then a graceful stop and exit (the cross-platform way to quit: on Windows a signal
  is an immediate TerminateProcess that would orphan Temporal and the runners).

All of them need the header `x-local-control-token: <controlToken>` (403 otherwise; 404 when no token is configured). Threat
model: the routes live under `/internal/`, so the backend serves them only on the internal port, which listens on loopback;
on top of that the token sits in a 0600 file, so only the same OS user can read it. `--port 0` / `--internal-port 0` pick free ports.

## Temporal on demand

The `temporal` CLI is looked up (or downloaded) in the background at start, but the dev server itself is started only by
the first runner process (a test stand or production start, a woken trigger, a schedule's reconcile) and by reads of runs
or tasks once `temporal/temporal.db` exists. Background sweeps (schedule wake, the editor's schedule list) never start it:
while it is down nothing fires anyway. Its ports are picked at start, so `TEMPORAL_ADDRESS` and the UI URL in the status
file are known before the server exists (the UI answers only once it has started). The backend side is the optional
`TEMPORAL_SERVER_CONTROL` token of `@falang/workflow-backend` (`OnDemandTemporalServer` provides it).

## Data directory

| Path                   | What                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/`                  | the PGlite cluster (Postgres 17 files)                                                                                                        |
| `files/`               | project files (`<projectId>/<fileId>`)                                                                                                        |
| `temporal/temporal.db` | Temporal's SQLite database (workflow history)                                                                                                 |
| `bin/`                 | the downloaded `temporal` CLI                                                                                                                 |
| `services/<name>/`     | data of an optional service (`--with`)                                                                                                        |
| `secrets.json`         | generated secrets, mode 0600. Back it up with the directory: without `CREDENTIALS_ENCRYPTION_KEY` the stored credentials cannot be decrypted. |

## What is different from the hosted stack

Runners are child processes of the backend (they stop when it stops). ActivePieces integrations, the ffmpeg media
service and mail are off unless started with `--with` (see above; ActivePieces needs a repository checkout), and inbound webhooks (including OAuth callbacks of third-party apps) need a tunnel
to the public port; Telegram in polling mode works. Signup is off - create more users on the admin page (`/admin`).

## Code map

- `src/local-control.ts` - the control routes; `src/local-mode.ts` - `startLocalMode`; `src/main.ts` - the CLI; `src/local-mode.module.ts` - the overlay Nest module.
- `src/db/`, `src/files/`, `src/runner/`, `src/temporal/` - PGlite driver, `DiskFileStorage`, `createProcessDeploymentsClient`, the Temporal CLI supervisor.
- `src/serve-client.ts` - static client with its own CSP; `src/secrets.ts` - `secrets.json`; `src/status-file.ts` - the status file.
- `src/services/` - the optional services (`--with`): `types.ts`, `supervisor.ts`, `start-services.ts`, the registry `index.ts`.

`npm run test-e2e:local` (repo root) starts the CLI in a child process and drives build, run, stop and file upload over HTTP.

`npm run test-e2e:fast` (repo root, `scripts/test-e2e-fast.ts`) runs the regular e2e suites — the workflow tier and the
Playwright browser tier — against this CLI plus `@falang/workflow-mocks`, both as child processes on free ports. By
default it starts all six optional services (`DEFAULT_SERVICES` in the script, `--with <list>` overrides); specs that
need something no started service provides are skipped via `FALANG_E2E_MISSING` — always per-project Temporal
isolation, which `temporal server start-dev` cannot do; `npm run test-e2e` on kind still covers that.
