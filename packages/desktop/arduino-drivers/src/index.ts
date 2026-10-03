import * as path from 'node:path';

/**
 * The bundled device drivers (ADR 0023 (private), Phase B) — one `{driverId}/driver.config.json` folder per driver, scanned by
 * `@falang/desktop-arduino-dto`'s `loadDriverRegistryFromDirs`. Absolute path to the `drivers/` folder shipped in this package.
 *
 * Resolved from this file's own location, so it is right wherever the package's sources run as real files (`tsx`, vitest, a
 * published copy under `node_modules`). It is NOT right inside a bundled build (electron-vite/esbuild put every module into one
 * output file, so `import.meta.dirname` is the bundle's directory): `@falang/desktop-app-arduino` therefore resolves its own drivers
 * directory itself (the `extraResources` copy when packaged, this folder in dev) and never imports this constant.
 */
export const BUNDLED_DRIVERS_DIR: string = path.resolve(import.meta.dirname, '..', 'drivers');
