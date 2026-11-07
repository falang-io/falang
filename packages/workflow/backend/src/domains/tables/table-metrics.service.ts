import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { tableRecordsGauge } from '../metrics/metrics.js';
import { TablesService } from './tables.service.js';

const CACHE_MS = 60_000;

/** Scrape-time `falang_table_records{env}` (a `GROUP BY env` over the records table, cached for 60 s). */
@Injectable()
export class TableMetricsService implements OnModuleInit {
  private readonly tables: TablesService;
  private cache: { at: number; rows: { env: string; n: number }[] } | null = null;

  constructor(@Inject(TablesService) tables: TablesService) {
    this.tables = tables;
  }

  onModuleInit(): void {
    tableRecordsGauge.onCollect(async (gauge) => {
      if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
        this.cache = { at: Date.now(), rows: await this.tables.countAll() };
      }
      gauge.reset();
      for (const row of this.cache.rows) gauge.set({ env: row.env }, row.n);
    });
  }
}
