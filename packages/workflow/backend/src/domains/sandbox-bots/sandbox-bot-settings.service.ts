// oxlint-disable no-await-in-loop -- a handful of sequential settings deletes.
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AppSettingsService } from '../admin/app-settings/app-settings.service.js';

const KEY_TTL = 'sandbox.bindingTtlMinutes';
const keyOf = (vendor: string, name: 'token' | 'username' | 'title' | 'commandName'): string =>
  `sandbox.${vendor}.${name}`;

export const DEFAULT_BINDING_TTL_MINUTES = 15;
export const MAX_BINDING_TTL_MINUTES = 10_080;
export const DEFAULT_COMMAND_NAME = 'falang';
export const COMMAND_NAME_PATTERN = /^[a-z0-9_]{1,32}$/;

export interface ISandboxBotStored {
  readonly token: string;
  readonly username: string;
  readonly title: string;
  readonly commandName: string;
}

export interface ISandboxPlatformRow {
  readonly vendor: string;
  readonly configured: boolean;
  readonly username: string | null;
  readonly title: string | null;
  readonly commandName: string;
}

/** `app_settings` typed onto the sandbox bots' keys (ADR 0073 (private)): per vendor token (secret), identity, command name; global binding TTL. */
@Injectable()
export class SandboxBotSettingsService {
  private readonly appSettings: AppSettingsService;

  constructor(@Inject(AppSettingsService) appSettings: AppSettingsService) {
    this.appSettings = appSettings;
  }

  async getBindingTtlMinutes(): Promise<number> {
    const raw = await this.appSettings.get(KEY_TTL);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_BINDING_TTL_MINUTES;
  }

  async setBindingTtlMinutes(minutes: number): Promise<void> {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_BINDING_TTL_MINUTES) {
      throw new BadRequestException(`bindingTtlMinutes must be an integer between 1 and ${MAX_BINDING_TTL_MINUTES}`);
    }
    await this.appSettings.set(KEY_TTL, String(minutes));
  }

  async getCommandName(vendor: string): Promise<string> {
    return (await this.appSettings.get(keyOf(vendor, 'commandName'))) ?? DEFAULT_COMMAND_NAME;
  }

  async hasToken(vendor: string): Promise<boolean> {
    return (await this.appSettings.get(keyOf(vendor, 'token'))) !== null;
  }

  /** The full stored config, or `null` when no token is stored. */
  async load(vendor: string): Promise<ISandboxBotStored | null> {
    const token = await this.appSettings.getSecret(keyOf(vendor, 'token'));
    if (token === null) return null;
    const [username, title, commandName] = await Promise.all([
      this.appSettings.get(keyOf(vendor, 'username')),
      this.appSettings.get(keyOf(vendor, 'title')),
      this.getCommandName(vendor),
    ]);
    return { token, username: username ?? '', title: title ?? '', commandName };
  }

  async row(vendor: string): Promise<ISandboxPlatformRow> {
    const [hasToken, username, title, commandName] = await Promise.all([
      this.hasToken(vendor),
      this.appSettings.get(keyOf(vendor, 'username')),
      this.appSettings.get(keyOf(vendor, 'title')),
      this.getCommandName(vendor),
    ]);
    return {
      vendor,
      configured: hasToken,
      username: hasToken ? username : null,
      title: hasToken ? title : null,
      commandName,
    };
  }

  async saveToken(vendor: string, token: string, info: { username: string; title: string }): Promise<void> {
    await this.appSettings.setSecret(keyOf(vendor, 'token'), token);
    await this.appSettings.set(keyOf(vendor, 'username'), info.username);
    await this.appSettings.set(keyOf(vendor, 'title'), info.title);
  }

  async saveCommandName(vendor: string, commandName: string): Promise<void> {
    await this.appSettings.set(keyOf(vendor, 'commandName'), commandName);
  }

  async remove(vendor: string): Promise<void> {
    for (const name of ['token', 'username', 'title', 'commandName'] as const) {
      await this.appSettings.remove(keyOf(vendor, name));
    }
  }
}
