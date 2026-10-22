import { action, computed, makeObservable, observable } from 'mobx';
import type { IAgentSettings } from '@falang/desktop-llm-client';

type TLoadAgentSettings = () => Promise<IAgentSettings | null>;

/**
 * The app-wide "Settings → Agent…" config (ADR 0026 (private)) as the renderer sees it — a
 * module-level singleton, same pattern as `settings-modal-store.ts`. The agent panel reads
 * `configured`/`model` from here, and `AgentSettingsModal` calls `apply()` after a save, so the panel
 * follows a change at once instead of keeping whatever was read when the sidebar first mounted.
 */
export class AgentSettingsStore {
  @observable settings: IAgentSettings | null = null;
  @observable loading = true;

  private loadVersion = 0;
  private readonly loadSettings: TLoadAgentSettings;

  constructor(loadSettings: TLoadAgentSettings) {
    this.loadSettings = loadSettings;
    makeObservable(this);
  }

  @computed get configured(): boolean {
    return Boolean(this.settings?.baseUrl && this.settings.model);
  }

  @computed get model(): string | null {
    return this.settings?.model || null;
  }

  async load(): Promise<void> {
    this.loadVersion += 1;
    const version = this.loadVersion;
    let settings: IAgentSettings | null = null;
    try {
      settings = await this.loadSettings();
    } catch {
      settings = null;
    }
    // A save that landed while this read was in flight wins.
    if (version === this.loadVersion) this.finishLoad(settings);
  }

  @action apply(settings: IAgentSettings): void {
    this.loadVersion += 1;
    this.finishLoad(settings);
  }

  @action private finishLoad(settings: IAgentSettings | null): void {
    this.settings = settings;
    this.loading = false;
  }
}

export const agentSettingsStore = new AgentSettingsStore(() => globalThis.falang.settings.getAgentSettings());
