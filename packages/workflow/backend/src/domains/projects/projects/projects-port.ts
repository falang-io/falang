import type { Project } from './project.entity.js';
import type { ProjectsService } from './projects.service.js';

/** What the runs/tasks services need of `ProjectsService` — `listAccessible` narrowed to plain projects so tests can fake it. */
export type TProjectsPort = Pick<ProjectsService, 'getOwnedProject'> & {
  listAccessible(userId: string, minimum?: 'edit' | 'tasks'): Promise<Project[]>;
};
