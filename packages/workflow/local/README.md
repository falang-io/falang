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

## Control routes (for a shell such as the Electron app)

With `--status-file <path>` (or the `statusFile` option) the process writes `{ url, internalUrl, temporalAddress,
temporalUiUrl, pid, firstRun, controlToken }` to that file once everything is up (atomically, mode 0600) and removes it on
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
| `secrets.json`         | generated secrets, mode 0600. Back it up with the directory: without `CREDENTIALS_ENCRYPTION_KEY` the stored credentials cannot be decrypted. |

## What is different from the hosted stack

Runners are child processes of the backend (they stop when it stops). ActivePieces integrations and the ffmpeg media
service are off, mail is not configured, and inbound webhooks (including OAuth callbacks of third-party apps) need a tunnel
to the public port; Telegram in polling mode works. Signup is off - create more users on the admin page (`/admin`).

## Code map

- `src/local-control.ts` - the control routes; `src/local-mode.ts` - `startLocalMode`; `src/main.ts` - the CLI; `src/local-mode.module.ts` - the overlay Nest module.
- `src/db/`, `src/files/`, `src/runner/`, `src/temporal/` - PGlite driver, `DiskFileStorage`, `createProcessDeploymentsClient`, the Temporal CLI supervisor.
- `src/serve-client.ts` - static client with its own CSP; `src/secrets.ts` - `secrets.json`.

`npm run test-e2e:local` (repo root) starts the CLI in a child process and drives build, run, stop and file upload over HTTP.

`npm run test-e2e:fast` (repo root, `scripts/test-e2e-fast.ts`) runs the regular e2e suites — the workflow tier and the
Playwright browser tier — against this CLI plus `@falang/workflow-mocks`, both as child processes on free ports. Specs
that need a service the local mode does not start (ActivePieces, media, mail, user databases, the egress proxy,
per-project Temporal isolation) are skipped via `FALANG_E2E_MISSING`; `npm run test-e2e` on kind still covers them.
