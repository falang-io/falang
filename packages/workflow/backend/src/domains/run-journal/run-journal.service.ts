import type { IRunJournalSettings } from '@falang/workflow-dto';
import { Inject, Injectable } from '@nestjs/common';
import { ProjectsService } from '../projects/projects/projects.service.js';
import type { IngestRunJournalDto } from './dto/ingest-run-journal.dto.js';
import { DEFAULT_JOURNAL_LIMIT } from './dto/list-run-journal.dto.js';
import { prepareJournalEntries } from './prepare-journal-entries.js';
import { RUN_JOURNAL_STORE, type IRunJournalStore } from './run-journal-store.js';
import type { IRunJournalEntryInput, IRunJournalPage } from './run-journal.types.js';

export interface IJournalListQuery {
  readonly after?: string;
  readonly limit?: number;
}

@Injectable()
export class RunJournalService {
  private readonly store: IRunJournalStore;
  private readonly projectsService: ProjectsService;

  constructor(
    @Inject(RUN_JOURNAL_STORE) store: IRunJournalStore,
    @Inject(ProjectsService) projectsService: ProjectsService,
  ) {
    this.store = store;
    this.projectsService = projectsService;
  }

  /** Applies the project's text policy and the size limits, then stores (idempotently). A vanished project's entries are dropped. */
  async ingest(projectId: string, body: IngestRunJournalDto): Promise<void> {
    const storeTexts = await this.projectsService.getJournalStoreTexts(projectId);
    if (storeTexts === null) return;
    const rows = prepareJournalEntries(body.entries as readonly IRunJournalEntryInput[], {
      projectId,
      env: body.env,
      buildId: body.buildId ?? null,
      storeTexts,
    });
    await this.store.append(rows);
  }

  async listRun(
    projectId: string,
    ownerId: string,
    workflowId: string,
    runId: string,
    query: IJournalListQuery,
  ): Promise<IRunJournalPage> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    return this.store.listRun(projectId, workflowId, runId, {
      after: query.after,
      limit: query.limit ?? DEFAULT_JOURNAL_LIMIT,
    });
  }

  async listWorkflow(
    projectId: string,
    ownerId: string,
    workflowId: string,
    query: IJournalListQuery,
  ): Promise<IRunJournalPage> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    return this.store.listWorkflow(projectId, workflowId, {
      after: query.after,
      limit: query.limit ?? DEFAULT_JOURNAL_LIMIT,
    });
  }

  async getSettings(projectId: string, ownerId: string): Promise<IRunJournalSettings> {
    const project = await this.projectsService.getOwnedProject(projectId, ownerId);
    return { storeTexts: project.journalStoreTexts };
  }

  async setSettings(projectId: string, ownerId: string, storeTexts: boolean): Promise<IRunJournalSettings> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    await this.projectsService.setJournalStoreTexts(projectId, storeTexts);
    return { storeTexts };
  }
}
