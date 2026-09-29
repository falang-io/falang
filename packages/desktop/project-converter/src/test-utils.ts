// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const FIXTURES_DIR = path.join(__dirname, '..', 'test-fixtures');

/** Copies `test-fixtures/<name>` (a real old-format project, `project.falangproject.json` + `falang/schemas/`) into a fresh tmpdir, since conversion mutates the project directory in place. */
export const copyFixtureToTmpDir = async (name: string): Promise<string> => {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), `project-converter-test-${name}-`));
  await fs.cp(path.join(FIXTURES_DIR, name), projectDir, { recursive: true });
  return projectDir;
};
