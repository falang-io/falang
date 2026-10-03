import { join } from 'node:path';
import { app } from 'electron';

/**
 * Where the bundled device drivers (ADR 0023 (private), Phase B) live as real files. They are the data of
 * `@falang/desktop-arduino-drivers` (ADR 0051 (private)) — a package of their own so a headless host can load the same
 * folders (`BUNDLED_DRIVERS_DIR`); this app resolves them itself because `BUNDLED_DRIVERS_DIR` is computed from its own
 * file location, which is meaningless inside this app's bundled `out/main`.
 *
 *  - **packaged**: `electron-builder.yml`'s `extraResources` copies the package's `drivers/` folder to
 *    `<resourcesPath>/drivers` (a real directory, never inside `app.asar`).
 *  - **dev**: `import.meta.dirname` is always `<app>/out/main` (electron-vite compiles `main` the same way for either), so
 *    the sibling workspace package is `../../../arduino-drivers/drivers`.
 */
export const PACKAGED_BUNDLED_DRIVERS_SUBDIR = 'drivers';

export const bundledDriversDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, PACKAGED_BUNDLED_DRIVERS_SUBDIR)
    : join(import.meta.dirname, '../../../arduino-drivers/drivers');
