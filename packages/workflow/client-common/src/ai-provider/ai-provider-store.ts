import { action, computed, makeObservable, observable } from 'mobx';
import type { IApiAiProviderModel } from '../api-types.js';
import { chatModelsOf, modelsOfKind } from './ai-provider-model.js';

export interface IBuiltInAiProviderModelInfo {
  readonly id: string;
  readonly label: string;
}

/** What the in-app agent is told about the built-in AI provider (ADR 0081 (private)); `null` while it is not configured. */
export interface IBuiltInAiProviderInfo {
  /** For `call-ai-text`/`call-ai-choice`. */
  readonly chatModels: readonly IBuiltInAiProviderModelInfo[];
  /** For `call-ai-image`. */
  readonly imageModels: readonly IBuiltInAiProviderModelInfo[];
  /** For `call-ai-transcribe`. */
  readonly transcribeModels: readonly IBuiltInAiProviderModelInfo[];
}

const toInfo = (models: readonly IApiAiProviderModel[]): readonly IBuiltInAiProviderModelInfo[] =>
  models.map(({ id, label }) => ({ id, label }));

type TAiProviderStatusLoader = () => Promise<{
  readonly configured: boolean;
  readonly models: readonly IApiAiProviderModel[];
}>;

/**
 * `GET /ai-provider` once per project workspace (ADR 0081 (private)): whether the deployment's built-in AI provider is
 * configured and which models it offers. Never loaded for a guest (no account, the route needs one). A failed request
 * reads as "not configured" — then no switch is offered and the agent is told nothing.
 */
export class AiProviderStore {
  @observable configured = false;
  @observable.ref models: readonly IApiAiProviderModel[] = [];
  @observable loaded = false;
  private loading: Promise<void> | null = null;
  private readonly loader: TAiProviderStatusLoader;

  // Imported lazily: `api-client.ts` reads `localStorage` at module scope, which plain-node consumers (tests) lack.
  constructor(
    loader: TAiProviderStatusLoader = () =>
      import('../api-client.js').then(({ workflowApi }) => workflowApi.getAiProvider()),
  ) {
    this.loader = loader;
    makeObservable(this);
  }

  /** Loads once; later calls return the same promise. Never rejects. */
  ensureLoaded(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  @computed get chatModels(): readonly IApiAiProviderModel[] {
    return chatModelsOf(this.models);
  }

  /** The agent-facing summary, `null` unless configured. */
  get info(): IBuiltInAiProviderInfo | null {
    if (!this.configured) return null;
    return {
      chatModels: toInfo(this.chatModels),
      imageModels: toInfo(modelsOfKind(this.models, 'image')),
      transcribeModels: toInfo(modelsOfKind(this.models, 'transcribe')),
    };
  }

  private async load(): Promise<void> {
    try {
      const status = await this.loader();
      this.apply(status.configured === true, Array.isArray(status.models) ? status.models : []);
    } catch {
      this.apply(false, []);
    }
  }

  @action private apply(configured: boolean, models: readonly IApiAiProviderModel[]): void {
    this.configured = configured;
    this.models = models;
    this.loaded = true;
  }
}
