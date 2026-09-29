import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { decryptSecret, encryptSecret, requireEncryptionKey } from '../../integrations/credentials-crypto.js';
import { OAuthCredential } from './oauth-credential.entity.js';

export interface IResolvedOAuth2ClientCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * CRUD + resolution over the `oauth_credentials` table — one platform-owned OAuth2 client per
 * vendor, see ADR 0030 (private). Kept in its own
 * small module (not folded into `AdminModule`) so both `AdminModule` (CRUD, the admin UI's list)
 * and `IntegrationsModule` (catalog gating, `oauth2.controller.ts`, `internal-credentials.controller.ts`)
 * can import it without a module cycle — `AdminModule` also needs `IntegrationsModule`'s
 * `ActivepiecesCatalogService` to build the admin oauth-credentials list.
 */
@Injectable()
export class OAuthCredentialsService {
  private readonly credentials: Repository<OAuthCredential>;
  private readonly config: ConfigService;

  constructor(
    @InjectRepository(OAuthCredential) credentials: Repository<OAuthCredential>,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.credentials = credentials;
    this.config = config;
  }

  private encryptionKey(): Buffer {
    return requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
  }

  findByVendor(vendor: string): Promise<OAuthCredential | null> {
    return this.credentials.findOneBy({ vendor });
  }

  listAll(): Promise<OAuthCredential[]> {
    return this.credentials.find();
  }

  /** Read per call, never cached — admin edits (enable/disable a vendor) must take effect without a restart. */
  async listConfiguredVendors(): Promise<ReadonlySet<string>> {
    const rows = await this.credentials.find({ select: { vendor: true } });
    return new Set(rows.map((row) => row.vendor));
  }

  /** Decrypted client id/secret for `vendor`, or `null` if no platform row exists for it. */
  async resolve(vendor: string): Promise<IResolvedOAuth2ClientCredentials | null> {
    const row = await this.findByVendor(vendor);
    if (!row) return null;
    return { clientId: row.clientId, clientSecret: decryptSecret(row.clientSecretEncrypted, this.encryptionKey()) };
  }

  async upsert(vendor: string, clientId: string, clientSecret: string): Promise<OAuthCredential> {
    const existing = await this.findByVendor(vendor);
    const clientSecretEncrypted = encryptSecret(clientSecret, this.encryptionKey());
    const row = this.credentials.create({ ...existing, vendor, clientId, clientSecretEncrypted });
    return this.credentials.save(row);
  }

  async remove(vendor: string): Promise<void> {
    await this.credentials.delete({ vendor });
  }
}
