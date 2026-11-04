// oxlint-disable no-console, no-undefined, no-await-in-loop, unicorn/no-process-exit -- a CLI smoke script.
/**
 * Live check of the built shell (`npm run build -w @falang/desktop-app-flow` first): launches it with a throwaway user
 * data dir, waits for the product to open signed in as admin, checks the menu, quits and verifies no child survives.
 * Usage: `npx tsx packages/desktop/app-flow/scripts/smoke-flow.ts [userDataDir]` (run twice with the same dir to see a
 * warm start).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import net from 'node:net';
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
// Single-user mode: signed in as admin, the header's "Admin" item reads "Settings", no banner, no support chat.
const adminItem = page.getByTestId('nav-admin');
await adminItem.waitFor({ timeout: 60_000 });
const adminItemText = await adminItem.textContent();
console.log('signed in; header item:', JSON.stringify(adminItemText?.trim()), 'title:', await page.title());
console.log(
  'default-password banner:',
  await page.getByText(/default admin password/i).count(),
  'support button:',
  await page.getByTestId('support-button').count(),
);
const status = JSON.parse(readFileSync(path.join(userData, 'flow', 'status.json'), 'utf8')) as {
  temporalAddress: string;
};
const [temporalHost, temporalPort] = status.temporalAddress.split(':');
const temporalUp = await new Promise<boolean>((resolve) => {
  const socket = net.connect({ host: temporalHost, port: Number(temporalPort) });
  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('error', () => {
    socket.destroy();
    resolve(false);
  });
});
console.log('temporal listening before any run:', temporalUp);
await page.getByTestId('user-menu').click();
await page.getByRole('menuitem', { name: /Access tokens|Токены доступа/ }).waitFor({ timeout: 10_000 });
console.log('user menu logout:', await page.getByRole('menuitem', { name: /^(Logout|Выход)$/ }).count());
await page.keyboard.press('Escape');
await page.screenshot({ path: path.join(userData, 'flow-projects.png') });
await adminItem.click();
await page.waitForURL(/\/admin/, { timeout: 30_000 });
await page
  .getByText(/AI agent|ИИ-агент/)
  .first()
  .waitFor({ timeout: 30_000 });
console.log(
  'admin: users menu',
  await page.getByRole('menuitem', { name: /^(Users|Пользователи)$/ }).count(),
  'support menu',
  await page.getByRole('menuitem', { name: /User support|Поддержка/ }).count(),
  'change password',
  await page.getByRole('button', { name: /Change password|Сменить пароль/ }).count(),
  'logout',
  await page.getByRole('button', { name: /^(Logout|Выйти)$/ }).count(),
  'language select',
  await page.locator('.ant-layout-header .ant-select, header .ant-select').count(),
);
await page.screenshot({ path: path.join(userData, 'flow-admin.png') });
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
