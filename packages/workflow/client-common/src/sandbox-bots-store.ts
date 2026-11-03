import { action, makeObservable, observable, runInAction } from 'mobx';
import type { IApiSandboxPlatform } from './api-types.js';
import { workflowApi } from './api-client.js';

/**
 * The deployment's configured sandbox (test) bot platforms (`GET /sandbox-bots`, ADR 0073 (private)). Loaded once per
 * project; a failure or an empty answer leaves `platforms` empty, so the editor shows no sandbox UI at all.
 */
export class SandboxBotsStore {
  @observable.ref platforms: readonly IApiSandboxPlatform[] = [];
  private loading: Promise<void> | null = null;

  constructor() {
    makeObservable(this);
  }

  ensureLoaded(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  @action private async load(): Promise<void> {
    try {
      const result = await workflowApi.getSandboxBots();
      runInAction(() => {
        this.platforms = result.platforms;
      });
    } catch {
      // No sandbox UI on failure.
    }
  }
}
