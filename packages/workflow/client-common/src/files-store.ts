import { makeObservable, observable, runInAction } from 'mobx';
import { workflowApi, type IApiFile, type IApiFilesList } from './api-client.js';

const errorMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/**
 * Project-scoped file list (ADR 0038 (private) §7). Unlike
 * `ScheduleStatusStore`/`DocumentLocksStore`, this store never polls — nothing outside this tab
 * changes a project's files behind its back the way a run can move a schedule's next-fire time or
 * another tab can steal a document lock, so the Files tab just reloads on mount and after every
 * action (upload/delete/publish/unpublish) instead.
 */
export class FilesStore {
  @observable files: IApiFile[] = [];
  @observable usage: IApiFilesList['usage'] | null = null;
  @observable loading = false;
  @observable error: string | null = null;

  private projectId: string | null = null;

  constructor() {
    makeObservable(this);
  }

  async load(projectId: string): Promise<void> {
    this.projectId = projectId;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const result = await workflowApi.listFiles(projectId);
      runInAction(() => {
        this.files = [...result.files];
        this.usage = result.usage;
      });
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to load files');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async upload(file: File, ttlHours?: number | null): Promise<void> {
    const projectId = this.requireProjectId();
    try {
      await workflowApi.uploadFile(projectId, file, ttlHours);
      await this.load(projectId);
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to upload file');
      });
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const projectId = this.requireProjectId();
    try {
      await workflowApi.deleteFile(projectId, id);
      await this.load(projectId);
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to delete file');
      });
      throw error;
    }
  }

  /** Returns the updated `IApiFile` (with its now-live `publicUrl`) so a caller can copy the link right away. */
  async publish(id: string): Promise<IApiFile> {
    const projectId = this.requireProjectId();
    try {
      const updated = await workflowApi.publishFile(projectId, id);
      this.replaceFile(updated);
      return updated;
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to publish file');
      });
      throw error;
    }
  }

  async unpublish(id: string): Promise<IApiFile> {
    const projectId = this.requireProjectId();
    try {
      const updated = await workflowApi.unpublishFile(projectId, id);
      this.replaceFile(updated);
      return updated;
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to unpublish file');
      });
      throw error;
    }
  }

  private replaceFile(updated: IApiFile): void {
    runInAction(() => {
      this.files = this.files.map((file) => (file.id === updated.id ? updated : file));
    });
  }

  private requireProjectId(): string {
    if (!this.projectId) throw new Error('FilesStore.load() must be called before mutating files');
    return this.projectId;
  }
}
