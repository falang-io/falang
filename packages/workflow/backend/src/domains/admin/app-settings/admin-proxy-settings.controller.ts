import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Put, UseGuards } from '@nestjs/common';
import { activepiecesVendorFor } from '@falang/workflow-integrations-activepieces';
import { AdminGuard } from '../../auth/auth/admin.guard.js';
import { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { UpsertProxySettingsDto } from './dto/upsert-proxy-settings.dto.js';
import { ProxySettingsService, type IProxySettingsStatus } from './proxy-settings.service.js';

export interface IProxyVendorOption {
  readonly vendor: string;
  readonly label: string;
  readonly source: 'builtin' | 'activepieces';
}

/** `/admin/settings/proxy` — the egress proxy config. Never returns the token. See ADR 0056 (private). */
@UseGuards(AdminGuard)
@Controller('admin/settings/proxy')
export class AdminProxySettingsController {
  private readonly proxySettings: ProxySettingsService;
  private readonly catalog: ActivepiecesCatalogService;

  constructor(
    @Inject(ProxySettingsService) proxySettings: ProxySettingsService,
    @Inject(ActivepiecesCatalogService) catalog: ActivepiecesCatalogService,
  ) {
    this.proxySettings = proxySettings;
    this.catalog = catalog;
  }

  @Get()
  get(): Promise<IProxySettingsStatus> {
    return this.proxySettings.getStatus();
  }

  @Get('vendors')
  async vendors(): Promise<{ vendors: IProxyVendorOption[] }> {
    const vendors: IProxyVendorOption[] = REGISTERED_INTEGRATIONS.map((integration) => ({
      label: integration.label,
      source: 'builtin',
      vendor: integration.vendor,
    }));
    try {
      const pieces = await this.catalog.getPieces();
      for (const piece of pieces) {
        vendors.push({
          label: piece.displayName,
          source: 'activepieces',
          vendor: activepiecesVendorFor(piece.pieceName),
        });
      }
    } catch {
      // The catalog fails soft elsewhere; here too, the static list is still useful.
    }
    return { vendors };
  }

  @Put()
  put(@Body() body: UpsertProxySettingsDto): Promise<IProxySettingsStatus> {
    return this.proxySettings.upsert(body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(): Promise<void> {
    await this.proxySettings.remove();
  }
}
