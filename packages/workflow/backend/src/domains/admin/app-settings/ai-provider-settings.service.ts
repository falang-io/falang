import { runWithEgressVendor } from '@falang/workflow-egress';
import type { IBackendEgress } from '@falang/workflow-integrations-common';
import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getBackendEgress } from '../../../net/egress-guard.js';
import {
  parseAiProviderModels,
  readStoredAiProviderModels,
  type IAiProviderModel,
  type TAiProviderModelKind,
} from './ai-provider-models.js';
import { AppSettingsService } from './app-settings.service.js';

const KEY_BASE_URL = 'aiProvider.baseUrl';
const KEY_API_KEY = 'aiProvider.apiKey';
const KEY_MODELS = 'aiProvider.models';

/** The vendor the built-in provider speaks for: its upstream calls are routed like that vendor's (ADR 0056 egress proxy). */
const AI_PROVIDER_EGRESS_VENDOR = 'openai';

export interface IAiProviderSettingsStatus {
  /** `baseUrl` + key + at least one `chat` model. */
  readonly configured: boolean;
  readonly baseUrl: string | null;
  readonly hasApiKey: boolean;
  readonly models: IAiProviderModel[];
  readonly updatedAt: string | null;
}

/** What a signed-in user may see (`GET /ai-provider`): no endpoint, no key. */
export interface IAiProviderPublicStatus {
  readonly configured: boolean;
  readonly models: { readonly id: string; readonly label: string; readonly kind: TAiProviderModelKind }[];
}

export interface IResolvedAiProviderSettings {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly models: IAiProviderModel[];
}

export interface IUpsertAiProviderSettingsParams {
  readonly baseUrl: string;
  /** Omitted/empty to keep the stored key — a 400 if none is stored yet. */
  readonly apiKey?: string;
  /** Validated by `parseAiProviderModels`. */
  readonly models: unknown;
}

export interface IListUpstreamModelsParams {
  /** Overrides the stored value, so the admin can try an endpoint before saving it. */
  readonly baseUrl?: string;
  readonly apiKey?: string;
}

export interface IUpstreamModel {
  readonly id: string;
  readonly ownedBy?: string;
}

/** An `http(s)` URL without query/fragment, trailing slashes removed (`https://api.example.com/v1`). */
const tryParseUrl = (raw: string): URL | null => {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
};

export const normalizeAiProviderBaseUrl = (raw: string): string => {
  const parsed = tryParseUrl(raw);
  if (!parsed) throw new BadRequestException('baseUrl must be a valid http:// or https:// URL');
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('baseUrl must use http: or https:');
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new BadRequestException('baseUrl must not contain a query or fragment');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new BadRequestException('baseUrl must not contain credentials');
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, '')}`;
};

const isConfigured = (baseUrl: string | null, hasKey: boolean, models: readonly IAiProviderModel[]): boolean =>
  Boolean(baseUrl) && hasKey && models.some((model) => model.kind === 'chat');

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readUpstreamModels = (body: unknown): IUpstreamModel[] => {
  const data = isObject(body) ? body.data : null;
  if (!Array.isArray(data)) throw new BadGatewayException('The provider answered /models without a "data" array');
  const seen = new Set<string>();
  const models: IUpstreamModel[] = [];
  for (const entry of data) {
    if (!isObject(entry)) continue;
    const { id, owned_by: ownedBy } = entry;
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    seen.add(id);
    models.push(typeof ownedBy === 'string' && ownedBy !== '' ? { id, ownedBy } : { id });
  }
  return models;
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** One `GET <baseUrl>/models` through the guard, routed like the `openai` vendor; every failure is a 502. */
const fetchUpstreamModels = async (egress: IBackendEgress, baseUrl: string, apiKey: string): Promise<unknown> => {
  const response = await runWithEgressVendor(AI_PROVIDER_EGRESS_VENDOR, () =>
    egress.fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } }),
  ).catch((error: unknown) => {
    throw new BadGatewayException(`Could not reach the provider: ${describeError(error)}`);
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text.slice(0, 500);
    throw new BadGatewayException(
      `The provider answered /models with ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }
  return response.json().catch(() => {
    throw new BadGatewayException('The provider answered /models with invalid JSON');
  });
};

/**
 * The built-in AI provider for workflow OpenAI nodes (ADR 0081 (private)) — `AppSettingsService` typed onto
 * `aiProvider.baseUrl`, `aiProvider.apiKey` (secret) and `aiProvider.models` (JSON `[{ id, label?, kind }]`).
 * Separate from the in-app agent's settings (`AgentSettingsService`): its own key, endpoint and model list.
 */
@Injectable()
export class AiProviderSettingsService {
  private readonly appSettings: AppSettingsService;

  constructor(@Inject(AppSettingsService) appSettings: AppSettingsService) {
    this.appSettings = appSettings;
  }

  async getStatus(): Promise<IAiProviderSettingsStatus> {
    const [baseUrl, apiKey, models] = await Promise.all([
      this.appSettings.get(KEY_BASE_URL),
      this.appSettings.get(KEY_API_KEY),
      this.appSettings.get(KEY_MODELS),
    ]);
    const updatedAts = await Promise.all(
      [KEY_BASE_URL, KEY_API_KEY, KEY_MODELS].map((key) => this.appSettings.getUpdatedAt(key)),
    );
    const dates = updatedAts.filter((date): date is Date => date !== null);
    const parsedModels = readStoredAiProviderModels(models);
    return {
      baseUrl,
      configured: isConfigured(baseUrl, apiKey !== null, parsedModels),
      hasApiKey: apiKey !== null,
      models: parsedModels,
      updatedAt: dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : null,
    };
  }

  /** `GET /ai-provider`: whether it is usable and which models it offers (none while not configured). */
  async getPublicStatus(): Promise<IAiProviderPublicStatus> {
    const status = await this.getStatus();
    if (!status.configured) return { configured: false, models: [] };
    return {
      configured: true,
      models: status.models.map((model) => ({ id: model.id, kind: model.kind, label: model.label ?? model.id })),
    };
  }

  /** The full config for the relay — `null` unless configured (`baseUrl` + key + at least one `chat` model). */
  async resolve(): Promise<IResolvedAiProviderSettings | null> {
    const [baseUrl, apiKey, models] = await Promise.all([
      this.appSettings.get(KEY_BASE_URL),
      this.appSettings.getSecret(KEY_API_KEY),
      this.appSettings.get(KEY_MODELS),
    ]);
    const parsedModels = readStoredAiProviderModels(models);
    if (!baseUrl || !apiKey || !isConfigured(baseUrl, true, parsedModels)) return null;
    return { apiKey, baseUrl, models: parsedModels };
  }

  async upsert(params: IUpsertAiProviderSettingsParams): Promise<IAiProviderSettingsStatus> {
    const baseUrl = normalizeAiProviderBaseUrl(params.baseUrl);
    const parsed = parseAiProviderModels(params.models);
    if (!parsed.ok) throw new BadRequestException({ errors: parsed.errors, message: 'Invalid models' });
    if (typeof params.apiKey === 'string' && params.apiKey.trim() !== '') {
      await this.appSettings.setSecret(KEY_API_KEY, params.apiKey.trim());
    } else if ((await this.appSettings.get(KEY_API_KEY)) === null) {
      throw new BadRequestException('apiKey is required the first time the built-in provider is configured');
    }
    await Promise.all([
      this.appSettings.set(KEY_BASE_URL, baseUrl),
      this.appSettings.set(KEY_MODELS, JSON.stringify(parsed.models)),
    ]);
    return this.getStatus();
  }

  async remove(): Promise<void> {
    await Promise.all([
      this.appSettings.remove(KEY_BASE_URL),
      this.appSettings.remove(KEY_API_KEY),
      this.appSettings.remove(KEY_MODELS),
    ]);
  }

  /**
   * Lists `<baseUrl>/models` upstream (stored values unless overridden) through the backend egress guard, routed like
   * the `openai` vendor — so the admin picks models instead of typing them. 400 without a base URL or key, 502 when the
   * provider can't be reached or answers with an error.
   */
  async listUpstreamModels(
    params: IListUpstreamModelsParams = {},
    egress: IBackendEgress = getBackendEgress(),
  ): Promise<IUpstreamModel[]> {
    const overrideKey = params.apiKey?.trim();
    const [storedBaseUrl, storedKey] = await Promise.all([
      params.baseUrl ? Promise.resolve(null) : this.appSettings.get(KEY_BASE_URL),
      overrideKey ? Promise.resolve(null) : this.appSettings.getSecret(KEY_API_KEY),
    ]);
    const rawBaseUrl = params.baseUrl ?? storedBaseUrl;
    if (!rawBaseUrl) throw new BadRequestException('baseUrl is required: none is stored yet');
    const baseUrl = normalizeAiProviderBaseUrl(rawBaseUrl);
    const apiKey = overrideKey || storedKey;
    if (!apiKey) throw new BadRequestException('apiKey is required: none is stored yet');
    return readUpstreamModels(await fetchUpstreamModels(egress, baseUrl, apiKey));
  }
}
