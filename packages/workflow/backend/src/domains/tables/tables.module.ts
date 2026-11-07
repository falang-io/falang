import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../projects/documents/document.entity.js';
import { RunJournalModule } from '../run-journal/run-journal.module.js';
import { tableChangeDispatcherProviders } from './table-change-dispatcher.service.js';
import { TableDefinitionsService } from './table-definitions.service.js';
import { TableRecordChange } from './table-record-change.entity.js';
import { TableRecord } from './table-record.entity.js';

/**
 * Project tables (ADR 0075 (private)). For now only the definitions service; the records API (T2) and the change
 * dispatcher (T6) are added here. Must not import `DocumentsModule` — `DocumentsModule` imports this one.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Document, TableRecord, TableRecordChange]), RunJournalModule],
  providers: [TableDefinitionsService, ...tableChangeDispatcherProviders],
  exports: [TableDefinitionsService],
})
export class TablesModule {}
