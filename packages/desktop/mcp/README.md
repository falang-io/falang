# @falang/desktop-mcp

A plain-Node stdio MCP server exposing one falang project folder (`text` or `arduino`) to Claude Code
and other MCP clients — see
[ADR 0029 (private)](../../../ADR 0029 (private))
for the full design, and its "Implementation notes (phase E)" section for what this pass actually
found/decided versus the ADR's own text.

## What it is

One process per project folder, speaking MCP over stdio (`@modelcontextprotocol/sdk`'s
`McpServer` + `StdioServerTransport`). It serves `@falang/mcp-core`'s shared v1 tool list
(`get_project`, `list_documents`, `get_document`, `get_node_kinds`, `create_document`,
`set_document`, `rename_document`, `move_document`, `delete_document`, `create_folder`,
`lock_document`, `unlock_document`) backed by `@falang/desktop-project-fs` — every call is one
read-modify-write against the project's own JSON files, no in-memory document cache, so a concurrent
desktop-app save is at worst a lost update of one call, never a corrupt file.

`set_document` is the only write path (see the ADR's "Decisions after discussion") — there is no
node-level `insert_node`/`set_data`/… tool. It validates the whole tree against the project/document
type's `NodesStack` (`@falang/mcp-core`'s `applySetDocument`: acquire-or-renew the document's
5-minute agent lock → validate → `preserveMeta`), auto-acquiring the lock for this process's fixed
owner id, `'mcp'` (see the ADR's "Contract clarifications" §4 — one agent per project folder in v1).

## Project types

- `'text'` / `'logic'` / `'simple-code-<language>'` — `packages/desktop/app-sketch`'s seven real
  on-disk project types (see its own `src/shared/project-types.ts`): `'text'` (`contour`/`text-function`/`mind-tree`),
  `'logic'` (`function`, the three `*-structure` kinds), and one `'simple-code-<language>'` per
  language (`cpp`/`js`/`ts`/`php`/`rust`, one matching document type apiece). All registered by
  `@falang/mcp-core`'s own `createDefaultDocumentStackRegistry()`. A project created by an app build
  older than 2026-09-20 still has `type: 'text'` regardless of what it actually contains — see
  `@falang/mcp-core`'s own README for what that means for `create_document`/`set_document` against
  such a project.
- `'arduino'` — `packages/desktop/app-arduino`'s project type (one document type, `'function'`).
  `@falang/mcp-core` can't register this itself (the pin/driver node kinds live in an app package,
  not a `*-dto` package) — this server registers it via `@falang/mcp-core`'s `registerProjectType`
  seam (`arduino-project-type.ts`), combining `@falang/typescript-dto`'s `functionNodesGroup` with
  `@falang/desktop-arduino-dto`'s Electron-free pin node configs and every `driver-action::…` node
  config derived from the driver folders found under `--drivers-dir`.

Which registration a running server uses is decided once at startup from the project's own
`falang.json` `type` field — see "CLI" below for how `--drivers-dir` reaches it.

## CLI

```
tsx src/main.ts [projectDir] [--drivers-dir <path>]...
node dist/index.js [projectDir] [--drivers-dir <path>]...
```

- `projectDir` (optional, positional): defaults to `cwd`, then walked up to the nearest ancestor
  containing `falang.json` — so `claude` started from a subfolder of a project still finds it.
- `--drivers-dir <path>` (optional, repeatable): a directory to scan for `{driverId}/driver.config.
json` folders, only used when the project's own type is `'arduino'`. Later directories win on an
  `id` collision (bundled, then user, matches `@falang/desktop-arduino-dto`'s own
  `loadDriverRegistryFromDirs`). Also readable from `FALANG_ARDUINO_DRIVERS_DIRS` (a `PATH`-style
  list — `;`-separated on Windows, `:` elsewhere), applied before any `--drivers-dir` flags.
- Never writes anything to stdout except MCP protocol frames — every diagnostic (fatal startup
  errors, a skipped malformed driver folder) goes to stderr.

Both desktop apps write the exact command into each project's own `.mcp.json` via
`writeAgentFiles`/`mcp-server-path.ts` — see "How the apps find it" below.

## How the apps find it

`packages/desktop/{app-sketch,app-arduino}/src/main/mcp-server-path.ts` resolves this at project create/open
time:

- **dev**: `npx tsx <repoRoot>/packages/desktop/mcp/src/main.ts .` — the app's own args are just
  `['.']`; the Arduino app additionally appends
  `--drivers-dir <bundled drivers> --drivers-dir <userData/drivers>` (the bundled drivers are `@falang/desktop-arduino-drivers`' `drivers/` folder: `<repo>/packages/desktop/arduino-drivers/drivers` in dev, `<resourcesPath>/drivers` packaged). `packages/desktop/app-sketch` passes
  nothing extra (it has no drivers concept).
- **packaged build**: `<resourcesPath>/mcp-server/index.js .` (+ the same `--drivers-dir` pair for
  the Arduino app) run by **the app's own binary in Node mode** — `.mcp.json` gets `command` = the
  app executable and `env: { "ELECTRON_RUN_AS_NODE": "1" }` (`@falang/desktop-worker-process`'s
  `electronNodeCommand`). A user's machine has no `node` on `PATH` to rely on. Inside a Linux AppImage
  the command is the AppImage file itself (`$APPIMAGE`), and the server bundle and the bundled drivers
  are first copied into `userData/staged/` (`stageCopy`), because everything under `resourcesPath`
  lives in the image's temporary mount and is gone once the app quits. `writeAgentFiles` rewrites the
  `falang` entry on every project open whenever it differs, so an update or a reinstall never leaves a
  stale path behind (other servers in the file are kept; a file without a `falang` entry is never
  touched). See ADR 0050 (private), "B1".

**Known gap** (flagged in the ADR, not fixed here): the Arduino app's own `userData/drivers` — the
Phase C "install your own driver" folder — is an Electron `app.getPath('userData')` path, which this
plain-Node package has no way to discover on its own; `mcp-server-path.ts` passes it explicitly via
`--drivers-dir` for exactly this reason. If a project's `.mcp.json` is later run from a different
machine/user profile than the one that wrote it (moving a project folder, or running the dev `tsx`
command by hand against someone else's `userData`), that path is stale and the server silently
scans nothing there (`loadDriverRegistryFromDirs` treats a missing directory as zero drivers, not an
error) — bundled drivers still work either way.

## Packaged-build bundle

`npm run build` (`build.esbuild.ts`) bundles `src/main.ts` into one self-contained `dist/index.js`
(esbuild, `platform: 'node'`, `format: 'cjs'`, `bundle: true`, no `external` beyond Node's own
builtins) — `node dist/index.js <dir>` works with no `node_modules` next to it. Both apps'
`electron-builder.yml` copy it into `resources/mcp-server/index.js` via `extraResources`, and both
apps' `package.json` gained a `prebuild:{linux,mac,win}` hook (`npm run build -w @falang/desktop-mcp`)
so the bundle exists before `electron-builder` runs — see each `electron-builder.yml`'s own comment.
Only `server/mcp.js` and `server/stdio.js` are ever imported from `@modelcontextprotocol/sdk`, so
esbuild's own import-graph tracing keeps the Streamable-HTTP-only half of the SDK (`express`, `hono`,
…) out of the bundle without needing to list them as `external` by hand (bundle size: ~1.1 MB).

## Testing

- `handlers.test.ts`, `arduino-project-type.test.ts`, `resolve-project-dir.test.ts` — plain Vitest
  unit tests, each against a real temp project directory (`@falang/desktop-project-fs`'s
  `createProject`), no MCP transport involved.
- `e2e.test.ts` — a real stdio round-trip: spawns `tsx src/main.ts <tempDir>` (the exact dev command
  `mcp-server-path.ts` resolves) and drives it with `@modelcontextprotocol/sdk`'s own `Client` +
  `StdioClientTransport`. Covers: the tool list (all 12 names), `get_node_kinds('function')`,
  `create_document` with no `root` (the document type's default tree), `set_document` with an invalid
  tree (error naming the zod path, document untouched), `set_document` with a valid tree (file on
  disk changed, `.falang-locks.json` holds the `mcp` lock) → `unlock_document` (lock gone), and an
  `'arduino'` project's `set_document` validating a tree containing a `pin-write-digital` node.
  `npm test -w @falang/desktop-mcp` runs it inline with the rest (~4s total, no Docker/e2e stack
  needed) — it is real process I/O, not a separate `test-e2e-*` script, since spawning `tsx` is cheap
  compared to this repo's other e2e suites.

## Manual verification against Claude Code

If the `claude` CLI is available: point a temp project's `.mcp.json` at
`npx tsx <repoRoot>/packages/desktop/mcp/src/main.ts .` and run, from inside that project folder:

```
claude -p "call the falang get_project tool and print the result" \
  --mcp-config .mcp.json --allowedTools "mcp__falang__get_project"
```

See the ADR's "Implementation notes (phase E)" for whether this was possible to run in the sandbox
this pass was built in, and its result if so.
