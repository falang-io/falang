import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import type { IRecentProject } from '../shared/recent-project.js';

const RECENT_PROJECTS_LIMIT = 10;

const recentProjectsPath = (): string => path.join(app.getPath('userData'), 'recent-projects.json');

export const listRecentProjects = async (): Promise<IRecentProject[]> => {
  try {
    const raw = await fs.readFile(recentProjectsPath(), 'utf8');
    return JSON.parse(raw) as IRecentProject[];
  } catch {
    return [];
  }
};

export const addRecentProject = async (projectPath: string, name: string): Promise<void> => {
  const recentProjects = await listRecentProjects();
  const existing = recentProjects.filter((entry) => entry.path !== projectPath);
  const updated = [{ path: projectPath, name, openedAt: new Date().toISOString() }, ...existing].slice(
    0,
    RECENT_PROJECTS_LIMIT,
  );
  await fs.mkdir(path.dirname(recentProjectsPath()), { recursive: true });
  await fs.writeFile(recentProjectsPath(), JSON.stringify(updated, null, 2));
};
