import { action, makeObservable, observable } from 'mobx';

/** Which project (if any) is open — no router library, this is the entire navigation state. */
export class NavigationStore {
  @observable openProjectDir: string | null = null;
  @observable openProjectName: string | null = null;
  /** `falang.json`'s own `type` — see `../shared/project-types.ts`. Passed down to `DesktopProjectStore` so it can filter which document types the project tree offers. */
  @observable openProjectType: string | null = null;

  constructor() {
    makeObservable(this);
  }

  @action openProject(dir: string, name: string, type: string): void {
    this.openProjectDir = dir;
    this.openProjectName = name;
    this.openProjectType = type;
  }

  @action closeProject(): void {
    this.openProjectDir = null;
    this.openProjectName = null;
    this.openProjectType = null;
  }
}

export const navigationStore = new NavigationStore();
