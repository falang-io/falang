import { randomUUID } from 'node:crypto';
import {
  IntegrationsRuntimeService,
  type IRunJournalProblemParams,
  type IRunJournalProblemPort,
} from '@falang/workflow-gateway';
import type { IRunJournalSettings } from '@falang/workflow-dto';
import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
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
export class RunJournalService implements IRunJournalProblemPort, OnModuleInit {
  private readonly logger = new Logger(RunJournalService.name);
  private readonly store: IRunJournalStore;
  private readonly projectsService: ProjectsService;
  private readonly gatewayRuntime: IntegrationsRuntimeService | undefined;

  constructor(
    @Inject(RUN_JOURNAL_STORE) store: IRunJournalStore,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Optional() @Inject(IntegrationsRuntimeService) gatewayRuntime?: IntegrationsRuntimeService,
  ) {
    this.store = store;
    this.projectsService = projectsService;
    this.gatewayRuntime = gatewayRuntime;
  }

  /** Hands the gateway its writer for input that reaches no workflow (ADR 0059 (private) §2c). */
  onModuleInit(): void {
    this.gatewayRuntime?.setRunJournal(this);
  }

  /**
   * Backend-side producer (ADR 0059 (private) §2c): one `error` entry for a problem that happened before any workflow
   * saw the input. Goes through the same normalisation as runner entries (text policy, size limits) and never throws.
   */
  async recordProblem(params: IRunJournalProblemParams): Promise<void> {
    try {
      const storeTexts = await this.projectsService.getJournalStoreTexts(params.projectId);
      if (storeTexts === null) return;
      const rows = prepareJournalEntries(
        [
          {
            workflowId: params.workflowId,
            runId: params.runId ?? null,
            sourceKey: `b:${randomUUID()}`,
            kind: 'error',
            level: params.level ?? 'warn',
            message: params.message,
            data: params.data ?? null,
            documentId: params.documentId ?? null,
            nodeId: params.nodeId ?? null,
            vendor: params.vendor ?? null,
            ts: Date.now(),
          },
        ],
        { projectId: params.projectId, env: params.env, buildId: null, storeTexts },
      );
      await this.store.append(rows);
    } catch (error) {
      this.logger.error(
        `Failed to record a run journal problem for project ${params.projectId}`,
        error instanceof Error ? error.stack : error,
      );
    }
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
