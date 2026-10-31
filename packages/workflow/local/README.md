# @falang/workflow-local

Runs the workflow product locally without Docker, kind or Postgres (ADR 0072, private): one Node process plus the
[`temporal` CLI](https://docs.temporal.io/cli) dev server.

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
Temporal Web UI), `--status-file <path>` (see below). Every environment variable the entry point sets (`JWT_SECRET`, `SIGNUP_MODE=off`,
`EGRESS_ALLOW_PRIVATE=true`, `TEMPORAL_ADDRESS`, …) is applied only if you have not set it already, so any of them can be
overridden from the shell.

## Control routes (for a shell such as the Electron app)

With `--status-file <path>` (or the `statusFile` option) the process writes `{ url, internalUrl, temporalAddress,
temporalUiUrl, pid, firstRun, controlToken }` to that file once everything is up (atomically, mode 0600) and removes it on
stop. `controlToken` is a fresh random 32-byte hex string per run and enables two routes:

- `POST /internal/local/auto-login` -> `{ accessToken }` for the seeded `admin` (same token as `POST /auth/login`);
- `POST /internal/local/shutdown` -> 202, then a graceful stop and exit (the cross-platform way to quit: on Windows a signal
  is an immediate TerminateProcess that would orphan Temporal and the runners).

Both need the header `x-local-control-token: <controlToken>` (403 otherwise; 404 when no token is configured). Threat
model: the routes live under `/internal/`, so the backend serves them only on the internal port, which listens on loopback;
on top of that the token sits in a 0600 file, so only the same OS user can read it. `--port 0` / `--internal-port 0` pick free ports.

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
