import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, type Repository } from 'typeorm';
import { AuthToken, type TAuthTokenKind } from './auth-token.entity.js';

const TTL_MS: Record<TAuthTokenKind, number> = {
  'verify-email': 24 * 60 * 60 * 1000,
  'reset-password': 60 * 60 * 1000,
};

const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

@Injectable()
export class AuthTokensService {
  private readonly tokens: Repository<AuthToken>;

  constructor(@InjectRepository(AuthToken) tokens: Repository<AuthToken>) {
    this.tokens = tokens;
  }

  /** Issues a token and invalidates the user's older unused tokens of the same kind. Returns the raw token. */
  async issue(userId: string, kind: TAuthTokenKind): Promise<string> {
    await this.tokens.update({ userId, kind, usedAt: IsNull() }, { usedAt: new Date() });
    const raw = randomBytes(32).toString('base64url');
    await this.tokens.save(
      this.tokens.create({
        userId,
        kind,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + TTL_MS[kind]),
        usedAt: null,
      }),
    );
    return raw;
  }

  /** Marks a valid token used and returns its user id; `null` for unknown, used, expired or wrong-kind tokens. */
  async consume(raw: string, kind: TAuthTokenKind): Promise<string | null> {
    const token = await this.tokens.findOneBy({ tokenHash: hashToken(raw), kind });
    if (!token || token.usedAt || token.expiresAt.getTime() < Date.now()) return null;
    // Conditional update so two concurrent requests can't both consume the same token.
    const result = await this.tokens.update({ id: token.id, usedAt: IsNull() }, { usedAt: new Date() });
    return result.affected === 1 ? token.userId : null;
  }

  /** When the user's latest token of this kind was issued — for the resend cooldown. */
  async lastIssuedAt(userId: string, kind: TAuthTokenKind): Promise<Date | null> {
    const latest = await this.tokens.findOne({ where: { userId, kind }, order: { createdAt: 'DESC' } });
    return latest?.createdAt ?? null;
  }
}
