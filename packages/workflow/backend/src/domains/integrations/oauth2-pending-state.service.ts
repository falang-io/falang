import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, type Repository } from 'typeorm';
import { OAuth2PendingStateRow } from './oauth2-pending-state.entity.js';

export interface IPendingOAuth2State {
  readonly projectId: string;
  readonly credentialId: string;
  readonly vendor: string;
  readonly codeVerifier?: string;
}

const STATE_TTL_MS = 10 * 60_000;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Pending OAuth2 authorization-code attempts, stored in the database (so any backend replica can finish a
 * flow another one started) and bound to the initiating browser (security audit P1-8):
 *
 * 1. `create` (from the JWT-authed `/oauth2/start`) stores the attempt and returns a one-time `launchId`;
 * 2. `launch` (the popup's first request, `/oauth2/launch/:launchId`) consumes the launch id atomically and
 *    issues a nonce that the controller puts in an httpOnly cookie — only its hash is stored;
 * 3. `consume` (the vendor's callback) deletes the row atomically and succeeds only when the cookie nonce matches.
 *
 * Expired rows are deleted opportunistically on every `create`.
 */
@Injectable()
export class OAuth2PendingStateService {
  private readonly rows: Repository<OAuth2PendingStateRow>;

  constructor(@InjectRepository(OAuth2PendingStateRow) rows: Repository<OAuth2PendingStateRow>) {
    this.rows = rows;
  }

  async create(state: string, launchId: string, value: IPendingOAuth2State, authorizeUrl: string): Promise<void> {
    await this.deleteExpired();
    await this.rows.insert({
      stateHash: sha256(state),
      launchIdHash: sha256(launchId),
      nonceHash: null,
      payload: JSON.stringify(value),
      authorizeUrl,
      launchedAt: null,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
  }

  /** Single-use: marks the attempt launched (atomic conditional update) and returns the vendor URL and a fresh browser nonce. */
  async launch(launchId: string): Promise<{ authorizeUrl: string; nonce: string } | undefined> {
    const launchIdHash = sha256(launchId);
    const nonce = randomBytes(32).toString('base64url');
    const result = await this.rows.update(
      { launchIdHash, launchedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      { launchedAt: new Date(), nonceHash: sha256(nonce) },
    );
    if (result.affected !== 1) return;
    const row = await this.rows.findOneBy({ launchIdHash });
    if (!row) return;
    return { authorizeUrl: row.authorizeUrl, nonce };
  }

  /** Single-use: deletes the row (whatever the outcome) and returns the payload only for a launched attempt with a matching nonce. */
  async consume(state: string, nonce: string | null): Promise<IPendingOAuth2State | undefined> {
    const stateHash = sha256(state);
    const row = await this.rows.findOneBy({ stateHash });
    if (!row) return;
    const deleted = await this.rows.delete({ stateHash });
    if (deleted.affected !== 1) return;
    if (row.expiresAt.getTime() < Date.now()) return;
    if (!nonce || !row.nonceHash || row.nonceHash !== sha256(nonce)) return;
    return JSON.parse(row.payload) as IPendingOAuth2State;
  }

  private async deleteExpired(): Promise<void> {
    await this.rows.delete({ expiresAt: LessThan(new Date()) });
  }
}
