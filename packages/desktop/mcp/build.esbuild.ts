import * as esbuild from 'esbuild';
import { copyTypescriptLibs } from '../../../scripts/release/copy-typescript-libs.js';

/**
 * Bundles the whole server into one self-contained `dist/index.js` — the packaged-build shape
 * `mcp-server-path.ts` in both desktop apps expects (`node <resourcesPath>/mcp-server/index.js .`,
 * no `node_modules` shipped alongside it). CJS output: the file is copied into `resources/mcp-server/`
 * with no `package.json` of its own, so Node's module-type detection for a directly-executed file
 * with no ancestor `"type"` field defaults to CommonJS — matching this package's own
 * `"type": "commonjs"` anyway. No `external` beyond Node's own builtins (which esbuild's
 * `platform: 'node'` already keeps as `require(...)` calls without being told to) — see
 * ADR 0029 (private)'s phase E task description. Only `server/mcp.js` and
 * `server/stdio.js` are ever imported from `@modelcontextprotocol/sdk`, so esbuild's own
 * import-graph tracing keeps the Streamable-HTTP-only dependencies (`express`, `hono`, …) out of the
 * bundle without needing to `external` them by hand.
 */
// Top-level `await` would need this script itself to run as an ES module, but `tsx` transforms it
// according to this package's own `"type": "commonjs"` — a plain async function + `.catch()`
// sidesteps that instead of adding a second, single-purpose `package.json`/`"type": "module"` just
// for this one build script.
const run = async (): Promise<void> => {
  await esbuild.build({
    bundle: true,
    entryPoints: ['src/main.ts'],
    format: 'cjs',
    logLevel: 'info',
    outfile: 'dist/index.js',
    platform: 'node',
    target: 'node24',
  });
  // The TypeScript lib files must sit next to the bundle (see `copy-typescript-libs.ts`).
  await copyTypescriptLibs('dist');
};

run().catch((error: unknown) => {
  // oxlint-disable-next-line no-console -- a build script, not the server itself; stdout/stderr have no wire-protocol meaning here.
  console.error(error);
  process.exitCode = 1;
});
