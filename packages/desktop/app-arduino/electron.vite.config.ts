import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Workspace `@falang/*` packages publish raw TypeScript (`main: "src/index.ts"`, `.js`-suffixed
// relative imports resolved by the bundler, not by Node — see CLAUDE.md's nodenext convention).
// electron-vite's default `externalizeDeps` leaves every `package.json` dependency as a bare
// `require`/`import` for Node to resolve at runtime, which fails for these packages outside a
// bundler. Excluding them here makes Vite bundle+transpile them into `out/main`/`out/preload`
// instead, exactly like the renderer already does for its own `@falang/*` imports. Only the
// packages `main`/`preload` actually import need listing (unlike the renderer, which is always
// fully bundled regardless of this setting) — see ADR 0005 (private)'s
// implementation notes for the original gotcha this works around. `@falang/logic-constructor`
// (+ its own `@falang/logic-dto`/`@falang/typescript-dto` dependencies) is `main`-only, not
// renderer — it wraps the real TypeScript Compiler API and `node:path`, neither available in the
// renderer's browser-like Vite environment (see ADR 0020 (private), Implementation notes).
const workspacePackages = [
  '@falang/debug',
  '@falang/desktop-project-fs',
  '@falang/desktop-arduino-cli',
  '@falang/desktop-arduino-compiler',
  '@falang/desktop-arduino-dto',
  // `main`'s agent IPC handlers (ADR 0026) call `callOpenAiChat` from this package — the same
  // gotcha `app-sketch`'s own `electron.vite.config.ts` already lists it for.
  '@falang/desktop-llm-client',
  '@falang/dto',
  '@falang/logic-constructor',
  '@falang/logic-dto',
  '@falang/typescript-dto',
  // `main`/`preload`'s versioning wiring (ADR 0025, `@falang/desktop-project-fs`'s
  // `createGitVersionStore`) imports value-level helpers from this package.
  '@falang/versioning',
  // `main`'s compile-worker wiring (`compile-worker/run-compile-job.ts`) spawns the sketch-compile
  // worker process through this package's `runInWorkerProcess` — see ADR 0020 (private)'s
  // "Implementation notes (compile worker …)".
  '@falang/desktop-worker-process',
];

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
      // `@falang/logic-constructor` pulls in the real `typescript` npm package (used for its
      // TS-Compiler-API-based expression compiler). `typescript`'s own CJS source does
      // environment detection (`getNodeSystem`'s `isFileSystemCaseSensitive`) referencing
      // `__filename` at module-init time — Rollup's CJS-into-ESM interop shim for `out/main`
      // (this package is `"type": "module"`) places its generated `__filename` binding so that
      // shim call happens before the binding initializes, a real TDZ `ReferenceError` confirmed
      // by actually launching the built app (`Cannot access '__filename' before initialization`).
      // `typescript` is a normal, properly-published dual CJS/ESM npm package (unlike the
      // `@falang/*` workspace packages above), so Node can `require`/`import` it natively at
      // runtime — externalizing it here (rather than bundling it) sidesteps Rollup's interop
      // shim entirely instead of trying to fix its ordering.
      rollupOptions: { external: ['typescript'] },
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
    // `.tsx` files go through `@vitejs/plugin-react`'s own Babel transform (needed for JSX/Fast
    // Refresh), which — unlike the esbuild transform Vite uses for plain `.ts` files — doesn't
    // understand `tsconfig.web.json`'s `experimentalDecorators: true` out of the box. Files that mix
    // JSX with a MobX class-field-decorated store in the same `.tsx` (this app's `pin-nodes`/
    // `driver-nodes` block configs, which define both together per ADR 0023 (private)) hit a real
    // parse error ("Support for the experimental syntax 'decorators' isn't currently enabled") —
    // confirmed by actually running `electron-vite dev`. `@babel/plugin-proposal-decorators` alone
    // only gets past that: a decorated class *field* (e.g. `@observable isOpen = false`, also used
    // by this app's plain `.ts` stores, which go through the same Babel pipeline too — `app-sketch`
    // needs this same fix, see its own `electron.vite.config.ts`) then throws at runtime
    // (`Decorating class property failed. Please ensure that transform-class-properties is enabled
    // and runs after the decorators transform.`) the first time such a class is instantiated —
    // invisible to `check`/`lint`/`build`, only caught by a real `npm run dev` click-through.
    // `@babel/plugin-proposal-class-properties` (matching `loose`/`legacy` settings, listed right
    // after) fixes that second half — see the memory note on this
    // (`feedback_electron_vite_mobx_decorators_need_babel_plugins.md`).
    plugins: [
      react({
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
