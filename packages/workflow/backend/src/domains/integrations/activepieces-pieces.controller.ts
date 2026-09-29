import { Controller, Get, Inject } from '@nestjs/common';
import type { IActivepiecesPieceCatalogEntry } from '@falang/workflow-integrations-activepieces';
import { ActivepiecesCatalogService } from './activepieces-catalog.service.js';

/** Browser-facing catalog endpoint — normal JWT auth (no `@Public()`), unlike the internal-only routes in this domain. */
@Controller('activepieces')
export class ActivepiecesPiecesController {
  private readonly catalog: ActivepiecesCatalogService;

  constructor(@Inject(ActivepiecesCatalogService) catalog: ActivepiecesCatalogService) {
    this.catalog = catalog;
  }

  @Get('pieces')
  getPieces(): Promise<readonly IActivepiecesPieceCatalogEntry[]> {
    return this.catalog.getEnabledPieces();
  }
}
