import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserLimitsModule } from '../admin/user-limits/user-limits.module.js';
import { FilesModule } from '../files/files.module.js';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { RunJournalModule } from '../run-journal/run-journal.module.js';
import { tableChangeDispatcherProviders } from './table-change-dispatcher.service.js';
import { TableDefinitionsService } from './table-definitions.service.js';
import { TableGcService } from './table-gc.service.js';
import { TableMetricsService } from './table-metrics.service.js';
import { TableRecordChange } from './table-record-change.entity.js';
import { TableRecord } from './table-record.entity.js';
import { TablesCsvService } from './tables-csv.service.js';
import { TablesInternalController } from './tables-internal.controller.js';
import { TablesProjectController } from './tables-project.controller.js';
import { TablesService } from './tables.service.js';

/**
 * Project tables (ADR 0075 (private)): definitions, the records API (project + internal routes), CSV, the change-log
 * GC, metrics and the change-log trigger dispatcher. Must not import `DocumentsModule` — `DocumentsModule`
 * imports this one.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Document, TableRecord, TableRecordChange]),
    ProjectsModule,
    UserLimitsModule,
    FilesModule,
    ProjectTokenModule,
    RunJournalModule,
  ],
  controllers: [TablesProjectController, TablesInternalController],
  providers: [
    TableDefinitionsService,
    TablesService,
    TablesCsvService,
    TableGcService,
    TableMetricsService,
    ...tableChangeDispatcherProviders,
  ],
  exports: [TableDefinitionsService, TablesService],
})
export class TablesModule {}
