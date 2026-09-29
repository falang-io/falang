import { action, makeObservable, observable } from 'mobx';

/** Which project (if any) is open — no router library, this is the entire navigation state. */
export class NavigationStore {
  @observable openProjectDir: string | null = null;
  @observable openProjectName: string | null = null;

  constructor() {
    makeObservable(this);
  }

  @action openProject(dir: string, name: string): void {
    this.openProjectDir = dir;
    this.openProjectName = name;
  }

  @action closeProject(): void {
    this.openProjectDir = null;
    this.openProjectName = null;
  }
}

export const navigationStore = new NavigationStore();
