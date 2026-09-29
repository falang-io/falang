import { action, makeObservable, observable } from 'mobx';

export type TNavigationView = 'projects' | 'runs' | 'tasks' | `ext:${string}`;

/** Which project (if any) is open, and which top-level screen is shown otherwise — no router library, this is the entire navigation state. */
export class NavigationStore {
  @observable selectedProjectId: string | null = null;
  @observable selectedProjectName: string | null = null;
  @observable view: TNavigationView = 'projects';

  constructor() {
    makeObservable(this);
  }

  @action selectProject(id: string, name: string): void {
    this.selectedProjectId = id;
    this.selectedProjectName = name;
  }

  @action goToProjectList(): void {
    this.selectedProjectId = null;
    this.selectedProjectName = null;
    this.view = 'projects';
  }

  @action goToRuns(): void {
    this.selectedProjectId = null;
    this.selectedProjectName = null;
    this.view = 'runs';
  }

  @action goToTasks(): void {
    this.selectedProjectId = null;
    this.selectedProjectName = null;
    this.view = 'tasks';
  }

  /** Opens a page contributed through `IClientExtensions.views` (see `extensions/client-extensions.ts`). */
  @action goToExtension(key: string): void {
    this.selectedProjectId = null;
    this.selectedProjectName = null;
    this.view = `ext:${key}`;
  }
}

export const navigationStore = new NavigationStore();
