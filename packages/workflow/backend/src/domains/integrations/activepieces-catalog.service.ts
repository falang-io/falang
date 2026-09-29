import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { activepiecesVendorFor, pieceToCredentialIntegration } from '@falang/workflow-integrations-activepieces';
import type { IActivepiecesPieceCatalogEntry } from '@falang/workflow-integrations-activepieces';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';

/**
 * ActivePieces' own `normalize.ts` injects these two fields into every OAUTH2 piece's `auth.fields`
 * (see ADR 0015 (private)) — stripped here per
 * ADR 0030 (private), which replaces them with one
 * platform-owned `oauth_credentials` row per vendor instead of a per-credential client id/secret.
 */
const OAUTH2_CLIENT_FIELD_NAMES = new Set(['client_id', 'client_secret']);

const stripOAuth2ClientFields = (piece: IActivepiecesPieceCatalogEntry): IActivepiecesPieceCatalogEntry => {
  if (piece.auth?.type !== 'OAUTH2') return piece;
  return {
    ...piece,
    auth: { ...piece.auth, fields: piece.auth.fields.filter((field) => !OAUTH2_CLIENT_FIELD_NAMES.has(field.name)) },
  };
};

/**
 * Fetches and caches the piece catalog from the standalone `falang-workflow-activepieces` service —
 * see ADR 0010 (private). Consulted anywhere that needs to know
 * about ActivePieces vendors alongside the statically registered ones (`REGISTERED_INTEGRATIONS`),
 * since those vendors are deliberately never added to that constant — adding a piece to the
 * service's allowlist must not require a code change here.
 *
 * Fetch-once-cache-forever for this pass (matches this codebase's existing "no scanning/refresh yet"
 * MVP posture elsewhere) — a process restart
 * picks up a changed allowlist. Fails soft (empty list, not thrown) when the service is unreachable
 * or unconfigured, since ordinary document reads/writes route through this for *every* `integrations`
 * document, not just ActivePieces ones — they must not break because a separate service is down.
 */
@Injectable()
export class ActivepiecesCatalogService {
  private readonly config: ConfigService;
  private readonly oauthCredentials: OAuthCredentialsService;
  private cachedPieces: Promise<readonly IActivepiecesPieceCatalogEntry[]> | null = null;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(OAuthCredentialsService) oauthCredentials: OAuthCredentialsService,
  ) {
    this.config = config;
    this.oauthCredentials = oauthCredentials;
  }

  getPieces(): Promise<readonly IActivepiecesPieceCatalogEntry[]> {
    this.cachedPieces ??= this.fetchPieces();
    return this.cachedPieces;
  }

  /**
   * Raw catalog minus OAuth2 pieces with no `oauth_credentials` row, `client_id`/`client_secret`
   * stripped from every remaining OAuth2 piece — see ADR 0030 (private)'s "Catalog gating". Backs
   * `GET /activepieces/pieces`, the single point that hides disabled integrations from both the
   * credential form and the editor's action picker. The enabled set is read from the DB on every
   * call (never cached) — admin edits must take effect without a restart.
   */
  async getEnabledPieces(): Promise<readonly IActivepiecesPieceCatalogEntry[]> {
    const pieces = await this.getPieces();
    const configuredVendors = await this.oauthCredentials.listConfiguredVendors();
    return pieces
      .filter((piece) => piece.auth?.type !== 'OAUTH2' || configuredVendors.has(activepiecesVendorFor(piece.pieceName)))
      .map((piece) => stripOAuth2ClientFields(piece));
  }

  /**
   * Backend-internal (encrypt/mask/resolve, discovery port, OAuth2 controller) — built from the raw
   * catalog with the same `client_id`/`client_secret` stripping as `getEnabledPieces` but *without*
   * the enabled filter, so existing credential instances of a since-disabled vendor still
   * mask/encrypt correctly; they just can't connect/refresh, which is the point of disabling.
   */
  async getDynamicIntegrations(): Promise<readonly IWorkflowIntegration[]> {
    const pieces = await this.getPieces();
    return pieces.map((piece) => pieceToCredentialIntegration(stripOAuth2ClientFields(piece)));
  }

  private async fetchPieces(): Promise<readonly IActivepiecesPieceCatalogEntry[]> {
    const baseUrl = this.config.get<string>('ACTIVEPIECES_SERVICE_URL');
    const secret = this.config.get<string>('ACTIVEPIECES_SERVICE_SECRET');
    if (!baseUrl || !secret) return [];
    try {
      const response = await fetch(`${baseUrl}/pieces`, { headers: { 'x-internal-api-key': secret } });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return (await response.json()) as readonly IActivepiecesPieceCatalogEntry[];
    } catch {
      return [];
    }
  }
}
