import type { KeyObject } from 'node:crypto';
import { createPublicKey } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JWT_ISSUER, type ITemporalJwtConfig } from './temporal-config.js';
import {
  normalizePem,
  parsePrivateKey,
  publicKeyOf,
  rsaThumbprint,
  signJwt,
  toJwk,
  type IJwks,
} from './temporal-jwt.js';
import { temporalNamespaceFor } from './temporal-namespace.js';

export interface ITemporalToken {
  readonly token: string;
  /** ISO timestamp the token stops being valid at. */
  readonly expiresAt: string;
}

/** Lifetime of the backend's own admin token (`temporal-system:admin`) — short, re-minted on demand by the backend's connection. */
export const ADMIN_TOKEN_TTL_SECONDS = 300;

/**
 * Signs the JWTs Temporal's default `ClaimMapper` authorizes (ADR 0050 (private)): a runner pod gets
 * `permissions: ["falang-<projectId>:write"]` (writer on its own namespace and nothing else), the
 * backend itself gets `["temporal-system:admin"]` for a few minutes at a time. The public half of the
 * signing key (and, while rotating, the previous one) is published as a JWKS by `JwksController`.
 */
@Injectable()
export class TemporalTokenService {
  private readonly privateKey: KeyObject;
  private readonly keyId: string;
  private readonly previousPublicKey: KeyObject | null;
  private readonly config: ITemporalJwtConfig;
  private readonly now: () => number;

  constructor(config: ITemporalJwtConfig, now: () => number = Date.now) {
    this.config = config;
    this.now = now;
    this.privateKey = parsePrivateKey(config.privateKeyPem);
    this.keyId = config.keyId ?? rsaThumbprint(publicKeyOf(this.privateKey));
    this.previousPublicKey = config.previousPublicKeyPem
      ? createPublicKey(normalizePem(config.previousPublicKeyPem))
      : null;
  }

  get currentKeyId(): string {
    return this.keyId;
  }

  /** A writer token for exactly `projectId`'s namespace, valid for `ttlSeconds` (default `TEMPORAL_JWT_TTL_SECONDS`). */
  mintProjectToken(projectId: string): ITemporalToken {
    return this.mint(`project:${projectId}`, [`${temporalNamespaceFor(projectId)}:write`], this.config.ttlSeconds);
  }

  /** Cluster-wide admin token for the backend's own connection (registering/deleting namespaces, listing, raw RPCs). */
  mintAdminToken(ttlSeconds: number = ADMIN_TOKEN_TTL_SECONDS): ITemporalToken {
    return this.mint('falang-backend', ['temporal-system:admin'], ttlSeconds);
  }

  /** Public keys Temporal verifies against: the current one first, then the previous one (rotation) if configured. */
  getJwks(): IJwks {
    const keys = [toJwk(publicKeyOf(this.privateKey), this.keyId)];
    if (this.previousPublicKey) {
      keys.push(toJwk(this.previousPublicKey, rsaThumbprint(this.previousPublicKey)));
    }
    return { keys };
  }

  private mint(subject: string, permissions: readonly string[], ttlSeconds: number): ITemporalToken {
    const issuedAt = Math.floor(this.now() / 1000);
    const expiresAtSeconds = issuedAt + ttlSeconds;
    const token = signJwt({
      privateKey: this.privateKey,
      kid: this.keyId,
      claims: {
        iss: JWT_ISSUER,
        aud: this.config.audience,
        sub: subject,
        iat: issuedAt,
        exp: expiresAtSeconds,
        permissions,
      },
    });
    return { token, expiresAt: new Date(expiresAtSeconds * 1000).toISOString() };
  }
}
