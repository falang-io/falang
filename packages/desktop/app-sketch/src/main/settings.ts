import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import type { IAgentSettings } from '@falang/desktop-llm-client';
import { DEFAULT_GIT_VERSIONING_OPTIONS, type IGitVersioningOptions } from '@falang/desktop-project-fs';

interface ISettings {
  language?: string;
  agent?: IAgentSettings;
  versioning?: IGitVersioningOptions;
}

const settingsPath = (): string => path.join(app.getPath('userData'), 'settings.json');

const readSettings = async (): Promise<ISettings> => {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    return JSON.parse(raw) as ISettings;
  } catch {
    return {};
  }
};

const writeSettings = async (settings: ISettings): Promise<void> => {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2));
};

export const getLanguage = async (): Promise<string | null> => {
  const settings = await readSettings();
  return settings.language ?? null;
};

export const setLanguage = async (language: string): Promise<void> => {
  const settings = await readSettings();
  settings.language = language;
  await writeSettings(settings);
};

export const getAgentSettings = async (): Promise<IAgentSettings | null> => {
  const settings = await readSettings();
  return settings.agent ?? null;
};

export const setAgentSettings = async (agent: IAgentSettings): Promise<void> => {
  const settings = await readSettings();
  settings.agent = agent;
  await writeSettings(settings);
};

/** Per-app git versioning settings (ADR 0025 (private), "Decisions (2026-09-17)" #3) — read fresh by `createGitVersionStore`'s `getOptions` callback on every operation, so a "Settings → Versioning…" change applies to the very next commit/restore without an app restart. */
export const getVersioningSettings = async (): Promise<IGitVersioningOptions> => {
  const settings = await readSettings();
  return settings.versioning ?? DEFAULT_GIT_VERSIONING_OPTIONS;
};

export const setVersioningSettings = async (versioning: IGitVersioningOptions): Promise<void> => {
  const settings = await readSettings();
  settings.versioning = versioning;
  await writeSettings(settings);
};
