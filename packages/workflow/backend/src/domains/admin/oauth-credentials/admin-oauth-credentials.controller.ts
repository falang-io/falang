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
import { activepiecesVendorFor } from '@falang/workflow-integrations-activepieces';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { OAuthCredentialsService } from './oauth-credentials.service.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { UpsertOAuthCredentialDto } from './dto/upsert-oauth-credential.dto.js';

export interface IAdminOAuthCredential {
  readonly vendor: string;
  readonly pieceName: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly clientId: string | null;
  readonly updatedAt: string | null;
}

/**
 * `GET /admin/oauth-credentials` lists one entry per ActivePieces OAuth2 piece in the raw catalog
 * (`ActivepiecesCatalogService.getPieces()`, unfiltered) — see
 * ADR 0030 (private). Never returns the secret.
 */
@UseGuards(AdminGuard)
@Controller('admin/oauth-credentials')
export class AdminOAuthCredentialsController {
  private readonly catalog: ActivepiecesCatalogService;
  private readonly oauthCredentials: OAuthCredentialsService;

  constructor(
    @Inject(ActivepiecesCatalogService) catalog: ActivepiecesCatalogService,
    @Inject(OAuthCredentialsService) oauthCredentials: OAuthCredentialsService,
  ) {
    this.catalog = catalog;
    this.oauthCredentials = oauthCredentials;
  }

  @Get()
  async list(): Promise<IAdminOAuthCredential[]> {
    const pieces = await this.catalog.getPieces();
    const oauthPieces = pieces.filter((piece) => piece.auth?.type === 'OAUTH2');
    const rows = await this.oauthCredentials.listAll();
    const rowByVendor = new Map(rows.map((row) => [row.vendor, row]));
    return oauthPieces.map((piece) => {
      const vendor = activepiecesVendorFor(piece.pieceName);
      const row = rowByVendor.get(vendor);
      return {
        vendor,
        pieceName: piece.pieceName,
        displayName: piece.displayName,
        enabled: Boolean(row),
        clientId: row?.clientId ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  @Put(':vendor')
  async upsert(
    @Param('vendor') vendor: string,
    @Body() body: UpsertOAuthCredentialDto,
  ): Promise<IAdminOAuthCredential> {
    const pieces = await this.catalog.getPieces();
    const piece = pieces.find(
      (candidate) => candidate.auth?.type === 'OAUTH2' && activepiecesVendorFor(candidate.pieceName) === vendor,
    );
    if (!piece) throw new NotFoundException(`"${vendor}" is not an ActivePieces OAuth2 vendor`);
    const row = await this.oauthCredentials.upsert(vendor, body.clientId, body.clientSecret);
    return {
      vendor,
      pieceName: piece.pieceName,
      displayName: piece.displayName,
      enabled: true,
      clientId: row.clientId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  @Delete(':vendor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('vendor') vendor: string): Promise<void> {
    await this.oauthCredentials.remove(vendor);
  }
}
