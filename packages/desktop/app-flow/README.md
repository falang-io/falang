# @falang/desktop-app-flow

"Falang Flow": the workflow product as a desktop app (ADR 0072, private). The Electron main process starts
`@falang/workflow-local` (PGlite database, `temporal` CLI dev server, process runners, the built client served from one
port) as a child process, signs the window in as the seeded `admin` and shows the product. No Docker, no Postgres.

```sh
npm install                              # repo root
npm run dev -w @falang/desktop-app-flow  # dev: the backend runs from the workspace sources through tsx
npm run build -w @falang/desktop-app-flow && npx tsx packages/desktop/app-flow/scripts/smoke-flow.ts   # live check
```

The first dev start builds `packages/workflow/client` (about a minute; the splash says so). If your shell exports
`ELECTRON_RUN_AS_NODE`, unset it before `dev`.

Data lives in `<userData>/flow` (`db/`, `files/`, `temporal/`, `bin/`, `secrets.json`; `File -> Show Data Folder`); the
shell's own `settings.json` (language, last port) is in `<userData>`. Quitting stops the backend through its control route
(see the `@falang/workflow-local` README). `FALANG_FLOW_USER_DATA` overrides `userData` (test-only: the smoke test).

## Packaging (ADR 0072, private)

```sh
npm run prebuild:linux -w @falang/desktop-app-flow   # client + backend-dist (`:mac`, `:win` for the other OSes)
npm run build -w @falang/desktop-app-flow            # electron-vite
cd packages/desktop/app-flow && npx electron-builder --linux AppImage --x64 --publish never   # (--linux deb for the .deb)
xvfb-run -a npx tsx scripts/release/smoke-desktop-app.ts flow --screenshot flow.png           # from the repo root
```

- `backend-dist/` (git-ignored) is assembled by `scripts/release/build-flow-backend-dist.ts`: 42 `@falang/*` source packages
  plus `tsx`/`typescript` in a real `node_modules` tree (about 450 MB; the native modules `bcrypt`/`@esbuild`/`@swc` are the
  building OS's, so build per OS and architecture). `--platform`/`--arch` keep only the matching `@temporalio/core-bridge`
  prebuild (538 MB -> 446 MB on Linux x64). `scripts/after-pack.cjs` copies it into the app's `resources/backend-dist`
  (electron-builder's `extraResources` always drops a top-level `node_modules`); the client lands in `resources/client`.
- The install location is read-only (AppImage mount, `/Applications`, `Program Files`) but the backend writes inside its own
  tree (`.builds/` must stay inside `node_modules`). So on start `stage-backend-dist.ts` copies `backend-dist` to
  `<userData>/flow/backend-dist` once per app build (`stageCopy`, stamp = version + dist mtime; about 9-11 s warm on Linux,
  the splash says "Preparing the engine") and the backend runs from the copy. Relocating `.builds` instead is a follow-up.
- The `temporal` CLI is not bundled: it is found on `PATH`/`FALANG_TEMPORAL_CLI` or downloaded into `<dataDir>/bin` on the
  first start.
- Linux AppImage on a machine that restricts unprivileged user namespaces needs `--no-sandbox` (the smoke test passes it).
