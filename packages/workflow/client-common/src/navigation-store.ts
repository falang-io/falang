import { action, computed, makeObservable, observable } from 'mobx';
import type { TAppRoute, TProjectRouteView } from './navigation-url.js';

export type TNavigationView = 'projects' | 'runs' | 'tasks' | `ext:${string}`;

/**
 * Which project (if any) is open, and which top-level screen is shown otherwise — no router library,
 * this is the entire navigation state. `bindNavigationToUrl` mirrors it into `location.hash` (and back),
 * so a reload or the browser's back/forward lands on the same screen, project and document.
 */
export class NavigationStore {
  @observable selectedProjectId: string | null = null;
  @observable selectedProjectName: string | null = null;
  @observable view: TNavigationView = 'projects';
  /** The open project's active document tab (written by its `WorkflowStore`, read to restore/follow the URL). */
  @observable documentId: string | null = null;
  /** The open project's non-document main view (`files`/`tasks`), if it is showing instead of a document. */
  @observable projectView: TProjectRouteView | null = null;

  constructor() {
    makeObservable(this);
  }

  /** The state as a route — what the URL hash serializes. */
  @computed get route(): TAppRoute {
    if (this.selectedProjectId) {
      return {
        kind: 'project',
        projectId: this.selectedProjectId,
        documentId: this.documentId,
        view: this.projectView,
      };
    }
    if (this.view === 'runs') return { kind: 'runs' };
    if (this.view === 'tasks') return { kind: 'tasks' };
    if (this.view.startsWith('ext:')) return { kind: 'ext', key: this.view.slice('ext:'.length) };
    return { kind: 'projects' };
  }

  @action selectProject(id: string, name: string | null): void {
    this.clearProjectLocation();
    this.selectedProjectId = id;
    this.selectedProjectName = name;
  }

  @action goToProjectList(): void {
    this.leaveProject();
    this.view = 'projects';
  }

  @action goToRuns(): void {
    this.leaveProject();
    this.view = 'runs';
  }

  @action goToTasks(): void {
    this.leaveProject();
    this.view = 'tasks';
  }

  /** Opens a page contributed through `IClientExtensions.views` (see `extensions/client-extensions.ts`). */
  @action goToExtension(key: string): void {
    this.leaveProject();
    this.view = `ext:${key}`;
  }

  /** The project's name arrived later than its id (a project opened straight from the URL). */
  @action setProjectName(id: string, name: string): void {
    if (this.selectedProjectId === id) this.selectedProjectName = name;
  }

  /** Reported by the open project's `WorkflowStore` whenever its active tab / main view changes. */
  @action setProjectLocation(documentId: string | null, view: TProjectRouteView | null): void {
    this.documentId = documentId;
    this.projectView = view;
  }

  /** Puts the app into `route` (URL → state: initial load, back/forward). The project name is unknown until resolved. */
  @action applyRoute(route: TAppRoute): void {
    switch (route.kind) {
      case 'project': {
        if (this.selectedProjectId !== route.projectId) {
          this.selectedProjectId = route.projectId;
          this.selectedProjectName = null;
        }
        this.documentId = route.documentId;
        this.projectView = route.view;
        break;
      }
      case 'projects': {
        this.goToProjectList();
        break;
      }
      case 'runs': {
        this.goToRuns();
        break;
      }
      case 'tasks': {
        this.goToTasks();
        break;
      }
      case 'ext': {
        this.goToExtension(route.key);
        break;
      }
      default: {
        break;
      }
    }
  }

  private leaveProject(): void {
    this.selectedProjectId = null;
    this.selectedProjectName = null;
    this.clearProjectLocation();
  }

  private clearProjectLocation(): void {
    this.documentId = null;
    this.projectView = null;
  }
}

export const navigationStore = new NavigationStore();
