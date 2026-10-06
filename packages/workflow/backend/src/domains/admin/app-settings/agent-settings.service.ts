import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service.js';

const KEY_BASE_URL = 'agent.baseUrl';
const KEY_MODEL = 'agent.model';
const KEY_API_KEY = 'agent.apiKey';
const KEY_INTERFACE = 'agent.interface';

/** How the in-app agent edits documents: whole JSON files (default) or the node tools (fallback). ADR 0062 (private). */
export type TAgentInterface = 'json' | 'nodes';
export const AGENT_INTERFACES: readonly TAgentInterface[] = ['json', 'nodes'];
const DEFAULT_AGENT_INTERFACE: TAgentInterface = 'json';

export interface IAgentSettingsStatus {
  readonly configured: boolean;
  readonly baseUrl: string | null;
  readonly model: string | null;
  readonly hasApiKey: boolean;
  readonly interface: TAgentInterface;
  readonly updatedAt: string | null;
}

export interface IResolvedAgentSettings {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export interface IUpsertAgentSettingsParams {
  readonly baseUrl: string;
  readonly model: string;
  /** Omitted to keep the currently-stored key on an update — see `upsert`'s own doc comment. */
  readonly apiKey?: string;
  /** Omitted to keep the stored value. */
  readonly interface?: TAgentInterface;
}

/**
 * The app-wide AI agent config — `AppSettingsService` typed onto three keys (`agent.baseUrl`,
 * `agent.model`, `agent.apiKey`, the last one a secret). See
 * ADR 0031 (private).
 */
@Injectable()
export class AgentSettingsService {
  private readonly appSettings: AppSettingsService;

  constructor(@Inject(AppSettingsService) appSettings: AppSettingsService) {
    this.appSettings = appSettings;
  }

  async getStatus(): Promise<IAgentSettingsStatus> {
    const [baseUrl, model, apiKey, storedInterface] = await Promise.all([
      this.appSettings.get(KEY_BASE_URL),
      this.appSettings.get(KEY_MODEL),
      this.appSettings.get(KEY_API_KEY),
      this.appSettings.get(KEY_INTERFACE),
    ]);
    const [baseUrlUpdatedAt, modelUpdatedAt, apiKeyUpdatedAt] = await Promise.all([
      this.appSettings.getUpdatedAt(KEY_BASE_URL),
      this.appSettings.getUpdatedAt(KEY_MODEL),
      this.appSettings.getUpdatedAt(KEY_API_KEY),
    ]);
    const updatedAtCandidates = [baseUrlUpdatedAt, modelUpdatedAt, apiKeyUpdatedAt].filter(
      (date): date is Date => date !== null,
    );
    const updatedAt =
      updatedAtCandidates.length > 0
        ? new Date(Math.max(...updatedAtCandidates.map((date) => date.getTime()))).toISOString()
        : null;

    return {
      baseUrl,
      configured: Boolean(baseUrl && model && apiKey),
      hasApiKey: apiKey !== null,
      interface: (AGENT_INTERFACES as readonly string[]).includes(storedInterface ?? '')
        ? (storedInterface as TAgentInterface)
        : DEFAULT_AGENT_INTERFACE,
      model,
      updatedAt,
    };
  }

  /** `null` unless all three settings are configured. */
  async resolve(): Promise<IResolvedAgentSettings | null> {
    const [baseUrl, model, apiKey] = await Promise.all([
      this.appSettings.get(KEY_BASE_URL),
      this.appSettings.get(KEY_MODEL),
      this.appSettings.getSecret(KEY_API_KEY),
    ]);
    if (!baseUrl || !model || !apiKey) return null;
    return { apiKey, baseUrl, model };
  }

  /** `apiKey` may be omitted to keep the currently-stored one — throws if none is stored yet. */
  async upsert(params: IUpsertAgentSettingsParams): Promise<IAgentSettingsStatus> {
    if (typeof params.apiKey === 'string') {
      await this.appSettings.setSecret(KEY_API_KEY, params.apiKey);
    } else {
      const existing = await this.appSettings.get(KEY_API_KEY);
      if (existing === null) {
        throw new BadRequestException('apiKey is required the first time the agent is configured');
      }
    }
    await Promise.all([
      this.appSettings.set(KEY_BASE_URL, params.baseUrl),
      this.appSettings.set(KEY_MODEL, params.model),
    ]);
    if (typeof params.interface === 'string') await this.appSettings.set(KEY_INTERFACE, params.interface);
    return this.getStatus();
  }

  async remove(): Promise<void> {
    await Promise.all([
      this.appSettings.remove(KEY_BASE_URL),
      this.appSettings.remove(KEY_MODEL),
      this.appSettings.remove(KEY_API_KEY),
      this.appSettings.remove(KEY_INTERFACE),
    ]);
  }
}
