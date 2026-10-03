import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service.js';

const KEY_URL = 'proxy.url';
const KEY_TOKEN = 'proxy.token';
const KEY_VENDORS = 'proxy.vendors';
const CACHE_TTL_MS = 15_000;

/** The egress proxy config handed to pods/services (mirrors `@falang/workflow-egress`'s `IEgressProxyConfig`). */
export interface IEgressProxySettings {
  readonly url: string;
  readonly token: string;
  readonly vendors: string[];
}

export interface IProxySettingsStatus {
  readonly configured: boolean;
  readonly url: string | null;
  readonly hasToken: boolean;
  readonly vendors: string[];
  readonly updatedAt: string | null;
}

export interface IUpsertProxySettingsParams {
  readonly url: string;
  /** Omitted/empty to keep the currently-stored token. */
  readonly token?: string;
  readonly vendors: readonly string[];
}

const tryParseUrl = (raw: string): URL | null => {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
};

const normalizeUrl = (raw: string): string => {
  const parsed = tryParseUrl(raw);
  if (!parsed) throw new BadRequestException('url must be a valid http:// or https:// URL');
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('url must use http: or https:');
  }
  if (!parsed.hostname) throw new BadRequestException('url must have a host');
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new BadRequestException('url must not contain a path, query or fragment');
  }
  return parsed.origin;
};

const parseVendors = (raw: string | null): string[] => {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * The app-wide egress proxy config — `AppSettingsService` typed onto `proxy.url`, `proxy.token`
 * (secret) and `proxy.vendors` (JSON array). See ADR 0056 (private).
 */
@Injectable()
export class ProxySettingsService {
  private readonly appSettings: AppSettingsService;
  private cached: { value: IEgressProxySettings | null; at: number } | null = null;
  private last: IEgressProxySettings | null = null;

  constructor(@Inject(AppSettingsService) appSettings: AppSettingsService) {
    this.appSettings = appSettings;
  }

  async getStatus(): Promise<IProxySettingsStatus> {
    const [url, token, vendors] = await Promise.all([
      this.appSettings.get(KEY_URL),
      this.appSettings.get(KEY_TOKEN),
      this.appSettings.get(KEY_VENDORS),
    ]);
    const updatedAts = await Promise.all(
      [KEY_URL, KEY_TOKEN, KEY_VENDORS].map((key) => this.appSettings.getUpdatedAt(key)),
    );
    const dates = updatedAts.filter((date): date is Date => date !== null);
    return {
      configured: Boolean(url),
      hasToken: token !== null,
      updatedAt: dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : null,
      url,
      vendors: parseVendors(vendors),
    };
  }

  /** `null` when no url is set. Cached in memory for 15 s; `upsert`/`remove` invalidate. */
  async resolve(): Promise<IEgressProxySettings | null> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < CACHE_TTL_MS) return this.cached.value;
    const [url, token, vendors] = await Promise.all([
      this.appSettings.get(KEY_URL),
      this.appSettings.getSecret(KEY_TOKEN),
      this.appSettings.get(KEY_VENDORS),
    ]);
    const value: IEgressProxySettings | null = url ? { token: token ?? '', url, vendors: parseVendors(vendors) } : null;
    this.cached = { at: now, value };
    this.last = value;
    return value;
  }

  /** Synchronous view of the last resolved value (`null` before the first `resolve`/`refresh`). */
  getCached(): IEgressProxySettings | null {
    return this.last;
  }

  /** Drops the cache and re-reads — for the routing step's periodic refresh. */
  async refresh(): Promise<void> {
    this.cached = null;
    await this.resolve();
  }

  async upsert(params: IUpsertProxySettingsParams): Promise<IProxySettingsStatus> {
    const url = normalizeUrl(params.url);
    const vendors = [...new Set(params.vendors.map((vendor) => vendor.trim()).filter((vendor) => vendor !== ''))];
    if (typeof params.token === 'string' && params.token !== '') {
      await this.appSettings.setSecret(KEY_TOKEN, params.token);
    } else if ((await this.appSettings.get(KEY_TOKEN)) === null) {
      throw new BadRequestException('token is required the first time the proxy is configured');
    }
    await Promise.all([this.appSettings.set(KEY_URL, url), this.appSettings.set(KEY_VENDORS, JSON.stringify(vendors))]);
    // Takes effect in this process immediately (`getCached()` backs the egress routing).
    await this.refresh();
    return this.getStatus();
  }

  async remove(): Promise<void> {
    await Promise.all([
      this.appSettings.remove(KEY_URL),
      this.appSettings.remove(KEY_TOKEN),
      this.appSettings.remove(KEY_VENDORS),
    ]);
    await this.refresh();
  }
}
