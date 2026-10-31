// oxlint-disable no-console, no-undefined, no-await-in-loop, unicorn/no-process-exit -- a CLI smoke script.
/**
 * Live check of the built shell (`npm run build -w @falang/desktop-app-flow` first): launches it with a throwaway user
 * data dir, waits for the product to open signed in as admin, checks the menu, quits and verifies no child survives.
 * Usage: `npx tsx packages/desktop/app-flow/scripts/smoke-flow.ts [userDataDir]` (run twice with the same dir to see a
 * warm start).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const appDir = path.resolve(import.meta.dirname, '..');
const userData = process.argv[2] ?? mkdtempSync(path.join(os.tmpdir(), 'falang-flow-smoke-'));

const survivors = (): string[] => {
  const out = execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter((line) => line.includes(userData) && !line.includes('smoke-flow') && !line.includes('ps -eo'));
};

const started = Date.now();
const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string' && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
}
const app = await electron.launch({
  args: [path.join(appDir, 'out', 'main', 'index.js'), `--user-data-dir=${userData}`],
  env,
  timeout: 60_000,
});
console.log('node in electron main:', await app.evaluate(() => process.versions.node));
console.log('electron:', await app.evaluate(() => process.versions.electron));
const page = await app.firstWindow();
console.log(
  'splash status:',
  await page
    .locator('#status')
    .textContent({ timeout: 10_000 })
    .catch(() => '(gone)'),
);
await page.waitForURL(/^http:\/\/localhost:\d+\/(?!health)/, { timeout: 180_000 });
console.log('product url:', page.url(), `after ${Math.round((Date.now() - started) / 1000)}s`);
await page
  .getByText(/default admin password/i)
  .first()
  .waitFor({ timeout: 60_000 });
console.log('signed in: default-password banner visible; title:', await page.title());
const menuItems = await app.evaluate(({ Menu }) =>
  (Menu.getApplicationMenu()?.items ?? []).flatMap((top) =>
    (top.submenu?.items ?? []).map((item) => `${top.label}/${item.label}:${item.enabled}`),
  ),
);
console.log('menu:', menuItems.filter((item) => item.startsWith('File')).join(' | '));
await page.screenshot({ path: path.join(userData, 'flow.png') });
await app.close();
await new Promise((resolve) => {
  setTimeout(resolve, 2000);
});
const left = survivors();
console.log(left.length === 0 ? 'no leftover processes' : `LEFTOVER PROCESSES:\n${left.join('\n')}`);
console.log('userData:', userData);
process.exit(left.length === 0 ? 0 : 1);
