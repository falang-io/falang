import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

/**
 * Copies every `lib*.d.ts` of the installed `typescript` package into `outDir`.
 *
 * Why: `@falang/logic-constructor`'s `compile-expression.ts` type-checks through `ts.createCompilerHost`, whose
 * default-library directory is `dirname(ts.sys.getExecutingFilePath())`. Inside an esbuild bundle (the packaged
 * MCP server and the compile/export workers) that is the bundle's own directory, so the standard lib files must sit
 * next to `index.js` or every type check fails with "Cannot find global type 'Array'". Only the `lib*.d.ts` files
 * are copied (not the whole `typescript/lib`).
 *
 * Run from a package directory (resolution starts at the current working directory).
 */
export const copyTypescriptLibs = async (outDir: string): Promise<number> => {
  const requireFromCwd = createRequire(path.join(process.cwd(), 'package.json'));
  const libDir = path.join(path.dirname(requireFromCwd.resolve('typescript/package.json')), 'lib');
  const entries = await fs.readdir(libDir);
  const names = entries.filter((name) => /^lib\..*\.d\.ts$/.test(name) || name === 'lib.d.ts');
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(names.map((name) => fs.copyFile(path.join(libDir, name), path.join(outDir, name))));
  return names.length;
};
