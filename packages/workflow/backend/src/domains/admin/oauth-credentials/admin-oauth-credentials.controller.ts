import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { activepiecesVendorFor } from '@falang/workflow-integrations-activepieces';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { getPlatformClientIntegrations } from '../../integrations/platform-oauth-vendors.js';
import type { OAuthCredential } from './oauth-credential.entity.js';
import { OAuthCredentialsService } from './oauth-credentials.service.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { UpsertOAuthCredentialDto } from './dto/upsert-oauth-credential.dto.js';

export interface IAdminOAuthCredential {
  readonly vendor: string;
  /** `native` — a statically registered vendor with `oauth2.platformClient` (amoCRM); `activepieces` — an OAuth2 piece. */
  readonly source: 'native' | 'activepieces';
  /** The ActivePieces piece name; `null` for a native vendor. */
  readonly pieceName: string | null;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly clientId: string | null;
  readonly updatedAt: string | null;
  /** The callback URL to register in the vendor's app (`${BACKEND_PUBLIC_URL}/oauth2/callback/<vendor>`), `null` when `BACKEND_PUBLIC_URL` is unset. */
  readonly redirectUri: string | null;
}

interface IOAuthVendorEntry {
  readonly vendor: string;
  readonly source: IAdminOAuthCredential['source'];
  readonly pieceName: string | null;
  readonly displayName: string;
}

/**
 * `GET /admin/oauth-credentials` lists the native platform-client vendors (`oauth2.platformClient`, e.g. amoCRM)
 * followed by one entry per ActivePieces OAuth2 piece in the raw catalog (`ActivepiecesCatalogService.getPieces()`,
 * unfiltered) — see ADR 0030 (private). Never returns the secret.
 */
@UseGuards(AdminGuard)
@Controller('admin/oauth-credentials')
export class AdminOAuthCredentialsController {
  private readonly catalog: ActivepiecesCatalogService;
  private readonly oauthCredentials: OAuthCredentialsService;
  private readonly config: ConfigService;

  constructor(
    @Inject(ActivepiecesCatalogService) catalog: ActivepiecesCatalogService,
    @Inject(OAuthCredentialsService) oauthCredentials: OAuthCredentialsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.catalog = catalog;
    this.oauthCredentials = oauthCredentials;
    this.config = config;
  }

  /** Every vendor whose OAuth2 client an admin configures here: native platform-client vendors first, then pieces. */
  private async listVendors(): Promise<IOAuthVendorEntry[]> {
    const native = getPlatformClientIntegrations().map(
      (integration): IOAuthVendorEntry => ({
        vendor: integration.vendor,
        source: 'native',
        pieceName: null,
        displayName: integration.label,
      }),
    );
    const catalog = await this.catalog.getPieces();
    const pieces = catalog
      .filter((piece) => piece.auth?.type === 'OAUTH2')
      .map(
        (piece): IOAuthVendorEntry => ({
          vendor: activepiecesVendorFor(piece.pieceName),
          source: 'activepieces',
          pieceName: piece.pieceName,
          displayName: piece.displayName,
        }),
      );
    return [...native, ...pieces];
  }

  private toRow(entry: IOAuthVendorEntry, row: OAuthCredential | undefined): IAdminOAuthCredential {
    // Exactly the `redirect_uri` `oauth2.controller.ts` sends, so it can be pasted into the vendor's app as is.
    const backendUrl = this.config.get<string>('BACKEND_PUBLIC_URL');
    return {
      ...entry,
      enabled: Boolean(row),
      clientId: row?.clientId ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      redirectUri: backendUrl ? `${backendUrl}/oauth2/callback/${entry.vendor}` : null,
    };
  }

  @Get()
  async list(): Promise<IAdminOAuthCredential[]> {
    const vendors = await this.listVendors();
    const rows = await this.oauthCredentials.listAll();
    const rowByVendor = new Map(rows.map((row) => [row.vendor, row]));
    return vendors.map((entry) => this.toRow(entry, rowByVendor.get(entry.vendor)));
  }

  @Put(':vendor')
  async upsert(
    @Param('vendor') vendor: string,
    @Body() body: UpsertOAuthCredentialDto,
  ): Promise<IAdminOAuthCredential> {
    const vendors = await this.listVendors();
    const entry = vendors.find((candidate) => candidate.vendor === vendor);
    if (!entry) throw new NotFoundException(`"${vendor}" is not a vendor with a platform OAuth2 client`);
    const row = await this.oauthCredentials.upsert(vendor, body.clientId, body.clientSecret);
    return this.toRow(entry, row);
  }

  @Delete(':vendor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('vendor') vendor: string): Promise<void> {
    await this.oauthCredentials.remove(vendor);
  }
}
