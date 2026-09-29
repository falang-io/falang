import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { IJwtPayloadUser } from '../auth/jwt.strategy.js';
import { UsersService } from '../../users/users/users.service.js';
import type { CreatePersonalAccessTokenDto } from './dto/create-personal-access-token.dto.js';
import { PersonalAccessToken } from './personal-access-token.entity.js';

/** Greppable prefix — see ADR 0029 (private)'s C1 deliverable. */
const TOKEN_PREFIX = 'flg_pat_';
const RAW_TOKEN_BYTES = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IPersonalAccessTokenSummary {
  readonly id: string;
  readonly name: string;
  readonly projectId: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
}

export interface ICreatedPersonalAccessToken {
  readonly token: IPersonalAccessTokenSummary;
  /** The raw `flg_pat_…` secret — returned exactly once, never persisted or retrievable again. */
  readonly rawToken: string;
}

export interface IResolvedPersonalAccessToken {
  readonly user: IJwtPayloadUser;
  /** `null` for an unscoped (whole-account) token. */
  readonly projectScope: string | null;
  /**
   * The token row's own id — used by the `/mcp` host (ADR 0029 (private)
   * phase F) to build the `"pat:<tokenId>"` document-lock owner string per the ADR's "Contract
   * clarifications" §4, stable across MCP sessions of the same token.
   */
  readonly tokenId: string;
}

const hashToken = (rawToken: string): string => createHash('sha256').update(rawToken).digest('hex');

const toSummary = (token: PersonalAccessToken): IPersonalAccessTokenSummary => ({
  id: token.id,
  name: token.name,
  projectId: token.projectId,
  createdAt: token.createdAt.toISOString(),
  expiresAt: token.expiresAt?.toISOString() ?? null,
  lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
});

/**
 * Personal access tokens for the future `/mcp` endpoint (ADR 0029 (private)
 * phase F) — this service is phase C's own deliverable, consumed today only by `PatOrJwtAuthGuard`
 * (exported, tested, not yet wired onto any route — v1 scope is `/auth/tokens` management only).
 * Never stores or returns the raw token after creation — only `tokenHash` (sha-256 over the raw
 * `flg_pat_…` string, chosen over a salted hash like bcrypt specifically so `resolve()` can look a
 * token up by an indexed equality match instead of hashing-and-comparing every row).
 */
@Injectable()
export class PersonalAccessTokensService {
  private readonly tokens: Repository<PersonalAccessToken>;
  private readonly usersService: UsersService;

  constructor(
    @InjectRepository(PersonalAccessToken) tokens: Repository<PersonalAccessToken>,
    @Inject(UsersService) usersService: UsersService,
  ) {
    this.tokens = tokens;
    this.usersService = usersService;
  }

  async list(userId: string): Promise<IPersonalAccessTokenSummary[]> {
    const rows = await this.tokens.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return rows.filter((row) => row.revokedAt === null).map((row) => toSummary(row));
  }

  async create(userId: string, input: CreatePersonalAccessTokenDto): Promise<ICreatedPersonalAccessToken> {
    const rawToken = `${TOKEN_PREFIX}${randomBytes(RAW_TOKEN_BYTES).toString('base64url')}`;
    const token = this.tokens.create({
      userId,
      name: input.name,
      tokenHash: hashToken(rawToken),
      projectId: input.projectId ?? null,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * MS_PER_DAY) : null,
      lastUsedAt: null,
      revokedAt: null,
    });
    const saved = await this.tokens.save(token);
    return { token: toSummary(saved), rawToken };
  }

  /** Revoke = set `revoked_at` (soft delete — a `resolve()` lookup on an already-checked-out session keeps failing predictably, never a hard row delete). */
  async revoke(userId: string, id: string): Promise<void> {
    const token = await this.tokens.findOneBy({ id, userId });
    if (!token || token.revokedAt !== null) throw new NotFoundException(`Personal access token "${id}" not found`);
    token.revokedAt = new Date();
    await this.tokens.save(token);
  }

  /**
   * Hash lookup + revoked/expired checks; bumps `last_used_at` best-effort (never blocks or fails
   * the caller on that write). Returns `null` for any unknown/revoked/expired token — the guard
   * turns that into a 401, same as an invalid JWT.
   */
  async resolve(rawToken: string): Promise<IResolvedPersonalAccessToken | null> {
    if (!rawToken.startsWith(TOKEN_PREFIX)) return null;
    const token = await this.tokens.findOneBy({ tokenHash: hashToken(rawToken) });
    if (!token) return null;
    if (token.revokedAt !== null) return null;
    if (token.expiresAt !== null && token.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.usersService.findById(token.userId);
    if (!user) return null;
    this.tokens.update({ id: token.id }, { lastUsedAt: new Date() }).catch(() => {
      // Best-effort only — a failed `last_used_at` bump must never fail authentication.
    });
    return {
      user: { id: user.id, username: user.username, role: user.role },
      projectScope: token.projectId,
      tokenId: token.id,
    };
  }
}
