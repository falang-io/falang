import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Workspace `@falang/*` packages publish raw TypeScript (`main: "src/index.ts"`, `.js`-suffixed
// relative imports resolved by the bundler, not by Node — see CLAUDE.md's nodenext convention).
// electron-vite's default `externalizeDeps` leaves every `package.json` dependency as a bare
// `require`/`import` for Node to resolve at runtime, which fails for these packages outside a
// bundler (confirmed by actually running the built main process: `Cannot find module`/`does not
// provide an export` for `.js` specifiers that only exist as `.ts` on disk). Excluding them here
// makes Vite bundle+transpile them into `out/main`/`out/preload` instead, exactly like the
// renderer already does for its own `@falang/*` imports.
const workspacePackages = [
  '@falang/desktop-project-fs',
  '@falang/desktop-project-converter',
  '@falang/di',
  '@falang/dto',
  '@falang/scheme',
  '@falang/text-dto',
  '@falang/text-scheme',
  '@falang/antd',
  // `main`'s logic-export IPC handlers pull these in (see `src/main/ipc-handlers.ts`). Any listed
  // `package.json` dependency they import transitively (`@falang/logic-dto`, `@falang/typescript-dto`)
  // has to be here too, or it gets externalized and hits the same runtime resolution failure.
  // `typescript` itself is deliberately NOT here: it's a real `package.json` dependency precisely so
  // it stays external (a 9MB CJS bundle with dynamic `require`s that has no business being inlined).
  '@falang/logic-export',
  '@falang/logic-constructor',
  '@falang/logic-dto',
  '@falang/typescript-dto',
  // `main`'s code-export IPC handler (`@falang/simple-code-export`) and its own `@falang/simple-code-dto`
  // dependency — same reasoning as the logic-export packages above. `@falang/simple-code-scheme` is
  // renderer-only (Monaco/React), so it's not needed here.
  '@falang/simple-code-export',
  '@falang/simple-code-dto',
  // `main`'s agent IPC handlers (ADR 0026) call `callOpenAiChat` from this package.
  '@falang/desktop-llm-client',
  // `@falang/desktop-project-fs`'s versioning module (`session-gap-store.ts`/`git-version-store.ts`,
  // ADR 0025) and `main`/`preload`'s own versioning wiring import value-level helpers
  // (`buildAutoVersionMessage`, `isSessionGap`, `diffSnapshots`, `isSnapshotDirty`) from this
  // package — same raw-TypeScript reasoning as every other entry here.
  '@falang/versioning',
  // `main`'s export-worker wiring (`export-worker/run-export-job.ts`) spawns the codegen worker
  // process through this package's `runInWorkerProcess` — see ADR 0019 (private)'s "Implementation
  // notes (export worker …)".
  '@falang/desktop-worker-process',
];

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
    },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [
      react({
        // MobX decorators (`@observable`/`@action`/`@computed`, used throughout this app's own
        // stores, e.g. `desktop-project-store.ts`/`navigation-store.ts`) are legacy-style TS
        // decorators (tsconfig's `experimentalDecorators`), which `@vitejs/plugin-react`'s babel
        // pipeline doesn't parse without this plugin — `legacy: true` matches tsc's own emit
        // shape so mobx's decorator implementation (reading annotations via `makeObservable`)
        // sees the same call shape it would from a real `tsc` build. `plugin-proposal-class-
        // properties` must run right after it (same `loose` setting) — legacy decorators on a
        // class field (e.g. `@observable isOpen = false`) rewrite the field into an initializer
        // the decorators plugin alone can't lower on its own; without the companion plugin,
        // Babel's "loose"/"non-loose" mismatch check throws `Decorating class property failed`
        // at runtime, not at build time (confirmed against a real `npm run dev`).
        babel: {
          plugins: [
            ['@babel/plugin-proposal-decorators', { legacy: true }],
            ['@babel/plugin-proposal-class-properties', { loose: true }],
          ],
        },
      }),
    ],
  },
});
