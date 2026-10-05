import { action, makeObservable, observable } from 'mobx';
import { workflowApi } from '../api-client.js';

/**
 * `GET /agent/settings` once per project workspace — the app-wide admin agent config status (ADR 0031
 * (private)). Lifted out of `ProjectRightSidebar`'s local hook (ADR 0046 (private)) so the chat panel and
 * the magic-insert gate (`WorkflowStore.buildScheme`'s `defaultInsertNodeName`) read the same answer.
 */
export class AgentSettingsStore {
  @observable configured = false;
  @observable loading = true;

  private disposed = false;

  constructor() {
    makeObservable(this);
  }

  /** Never rejects: a failed request reads as "not configured". */
  async load(): Promise<void> {
    try {
      const status = await workflowApi.getAgentSettings();
      this.apply(status.configured);
    } catch {
      this.apply(false);
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  @action private apply(configured: boolean): void {
    if (this.disposed) return;
    this.configured = configured;
    this.loading = false;
  }
}
