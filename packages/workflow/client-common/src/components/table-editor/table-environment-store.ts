import { observable } from 'mobx';
import type { TTableEnv } from '@falang/workflow-dto';

export const tableEnvironmentStorageKey = (projectId: string): string => `falang:table-env:${projectId}`;

type TStorage = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): TStorage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export class TableEnvironmentStore {
  private readonly byProject = observable.map<string, TTableEnv>();
  private readonly storage: TStorage | null;

  constructor(storage: TStorage | null = defaultStorage()) {
    this.storage = storage;
  }

  get(projectId: string): TTableEnv {
    const current = this.byProject.get(projectId);
    if (current) return current;
    let stored: string | null = null;
    try {
      stored = this.storage?.getItem(tableEnvironmentStorageKey(projectId)) ?? null;
    } catch {
      // Storage is best-effort; the in-memory value still keeps every table in sync.
    }
    const env: TTableEnv = stored === 'dev' ? 'dev' : 'prod';
    this.byProject.set(projectId, env);
    return env;
  }

  set(projectId: string, env: TTableEnv): void {
    this.byProject.set(projectId, env);
    try {
      this.storage?.setItem(tableEnvironmentStorageKey(projectId), env);
    } catch {
      // Storage is best-effort; the in-memory value still keeps every table in sync.
    }
  }
}

export const tableEnvironmentStore = new TableEnvironmentStore();
