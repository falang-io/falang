/* oxlint-disable no-require-imports, require-await -- electron-builder loads hooks as CommonJS. */
/**
 * electron-builder `afterPack` hook: copies `backend-dist` into the app's resources.
 *
 * `extraResources` cannot do this: electron-builder's file filter always drops a top-level `node_modules` directory
 * (`app-builder-lib/out/util/filter.js`), and `backend-dist` IS a node_modules tree the backend runs from (ADR 0072,
 * private). A plain recursive copy has no such rule.
 */
const fs = require('node:fs');
const path = require('node:path');

exports.default = async (context) => {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources');
  const source = path.resolve(__dirname, '..', 'backend-dist');
  if (!fs.existsSync(path.join(source, 'node_modules'))) {
    throw new Error(`backend-dist is missing or incomplete: ${source} (run the prebuild script first)`);
  }
  const target = path.join(resources, 'backend-dist');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true });
};
