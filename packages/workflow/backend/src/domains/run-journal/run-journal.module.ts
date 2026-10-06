import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTokenModule } from '../internal-auth/project-token.module.js';
import { ProjectsModule } from '../projects/projects/projects.module.js';
import { InternalRunJournalController } from './internal-run-journal.controller.js';
import { PgRunJournalStore } from './pg-run-journal-store.js';
import { RunJournalController } from './run-journal.controller.js';
import { RunJournalEntry } from './run-journal-entry.entity.js';
import { RunJournalGcService } from './run-journal-gc.service.js';
import { RunJournalService } from './run-journal.service.js';
import { RUN_JOURNAL_STORE } from './run-journal-store.js';

/**
 * The run journal (ADR 0059 (private)): storage behind `IRunJournalStore`, the internal ingest endpoint runner pods
 * flush to, the owner-scoped read routes and the retention sweep. Exports the store token so other code (the gateway's
 * backend-side problem entries, the cloud edition) can write entries, and `BuildService` can delete a project's entries.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RunJournalEntry]), ProjectsModule, ProjectTokenModule],
  controllers: [InternalRunJournalController, RunJournalController],
  providers: [
    PgRunJournalStore,
    { provide: RUN_JOURNAL_STORE, useExisting: PgRunJournalStore },
    RunJournalService,
    RunJournalGcService,
  ],
  exports: [RUN_JOURNAL_STORE, RunJournalService],
})
export class RunJournalModule {}
