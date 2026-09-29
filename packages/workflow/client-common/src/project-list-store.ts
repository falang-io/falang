import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { workflowApi, type IApiProject, type IApiProjectExport } from './api-client.js';

const changedAt = (project: IApiProject): number => Date.parse(project.lastEditedAt ?? project.createdAt) || 0;

export class ProjectListStore {
  readonly projects = observable<IApiProject>([]);
  @observable isLoading = true;
  @observable error: string | null = null;
  @observable isCreating = false;
  @observable deletingId: string | null = null;

  /** Most recently changed first; a never-edited project counts by its creation time. */
  @computed get sortedProjects(): IApiProject[] {
    return this.projects.toSorted((a, b) => changedAt(b) - changedAt(a));
  }

  constructor() {
    makeObservable(this);
    this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      const projects = await workflowApi.listProjects();
      runInAction(() => {
        this.projects.replace(projects);
        this.isLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to load projects';
        this.isLoading = false;
      });
    }
  }

  @action async createProject(name: string): Promise<IApiProject | null> {
    this.isCreating = true;
    try {
      const project = await workflowApi.createProject(name);
      runInAction(() => {
        this.projects.push(project);
        this.isCreating = false;
      });
      return project;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to create project';
        this.isCreating = false;
      });
      return null;
    }
  }

  @action async importProject(payload: IApiProjectExport): Promise<IApiProject | null> {
    this.isCreating = true;
    try {
      const project = await workflowApi.importProject(payload);
      runInAction(() => {
        this.projects.push(project);
        this.isCreating = false;
      });
      return project;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to import project';
        this.isCreating = false;
      });
      return null;
    }
  }

  @action async deleteProject(id: string): Promise<boolean> {
    this.deletingId = id;
    try {
      await workflowApi.deleteProject(id);
      runInAction(() => {
        const project = this.projects.find((item) => item.id === id);
        if (project) this.projects.remove(project);
        this.deletingId = null;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to delete project';
        this.deletingId = null;
      });
      return false;
    }
  }
}
