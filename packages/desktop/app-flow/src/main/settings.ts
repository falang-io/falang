import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

interface ISettings {
  language?: string;
  /** The public port used last time: the client keeps per-origin state (tabs, panel widths) in `localStorage`. */
  port?: number;
}

const settingsPath = (): string => path.join(app.getPath('userData'), 'settings.json');

export const readSettings = async (): Promise<ISettings> => {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as ISettings;
  } catch {
    return {};
  }
};

export const writeSettings = async (patch: Partial<ISettings>): Promise<void> => {
  const next = { ...(await readSettings()), ...patch };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2));
};

export const getLanguage = async (): Promise<string | null> => {
  const settings = await readSettings();
  return settings.language ?? null;
};
