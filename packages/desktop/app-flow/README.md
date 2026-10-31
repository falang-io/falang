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
(see the `@falang/workflow-local` README). Packaging (`backend-dist`, installers) is the next step; the command that starts
the backend for both modes is in `src/main/resolve-backend-command.ts`.
