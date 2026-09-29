import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { decryptSecret, encryptSecret, requireEncryptionKey } from '../../integrations/credentials-crypto.js';
import { AppSetting } from './app-setting.entity.js';

/**
 * Generic CRUD over the `app_settings` key/value table — deliberately knows nothing about the
 * agent or any other specific setting. See ADR 0031 (private).
 * `getSecret`/`setSecret` encrypt with `CREDENTIALS_ENCRYPTION_KEY` via the same
 * `credentials-crypto.ts` helpers `OAuthCredentialsService`/`DocumentsService` already use.
 */
@Injectable()
export class AppSettingsService {
  private readonly settings: Repository<AppSetting>;
  private readonly config: ConfigService;

  constructor(
    @InjectRepository(AppSetting) settings: Repository<AppSetting>,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.settings = settings;
    this.config = config;
  }

  private encryptionKey(): Buffer {
    return requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
  }

  async get(key: string): Promise<string | null> {
    const row = await this.settings.findOneBy({ key });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const existing = await this.settings.findOneBy({ key });
    const row = this.settings.create({ ...existing, key, value });
    await this.settings.save(row);
  }

  async remove(key: string): Promise<void> {
    await this.settings.delete({ key });
  }

  async getUpdatedAt(key: string): Promise<Date | null> {
    const row = await this.settings.findOneBy({ key });
    return row?.updatedAt ?? null;
  }

  async getSecret(key: string): Promise<string | null> {
    const value = await this.get(key);
    if (value === null) return null;
    return decryptSecret(value, this.encryptionKey());
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.set(key, encryptSecret(value, this.encryptionKey()));
  }
}
