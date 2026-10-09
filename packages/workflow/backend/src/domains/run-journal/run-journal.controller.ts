import { Body, Controller, Get, Inject, Param, Put, Query } from '@nestjs/common';
import type { IRunJournalSettings } from '@falang/workflow-dto';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
// Value imports on purpose — Nest's `ValidationPipe` reads the DTO classes from runtime parameter metadata.
// oxlint-disable-next-line consistent-type-imports
import { ListRunJournalQueryDto } from './dto/list-run-journal.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { UpdateJournalSettingsDto } from './dto/update-journal-settings.dto.js';
import { RunJournalService } from './run-journal.service.js';
import type { IRunJournalPage } from './run-journal.types.js';

/** Owner-scoped read side of the run journal (ADR 0059 (private) §5) plus the project's text-policy switch (§6). */
@Controller('projects/:projectId')
export class RunJournalController {
  private readonly service: RunJournalService;

  constructor(@Inject(RunJournalService) service: RunJournalService) {
    this.service = service;
  }

  @Get('runs/:workflowId/:runId/journal')
  listRun(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Param('runId') runId: string,
    @Query() query: ListRunJournalQueryDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IRunJournalPage> {
    return this.service.listRun(projectId, user.id, workflowId, runId, query, 'read');
  }

  @Get('workflows/:workflowId/journal')
  listWorkflow(
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Query() query: ListRunJournalQueryDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IRunJournalPage> {
    return this.service.listWorkflow(projectId, user.id, workflowId, query, 'read');
  }

  @Get('journal-settings')
  getSettings(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IRunJournalSettings> {
    return this.service.getSettings(projectId, user.id, 'read');
  }

  @Put('journal-settings')
  setSettings(
    @Param('projectId') projectId: string,
    @Body() body: UpdateJournalSettingsDto,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IRunJournalSettings> {
    return this.service.setSettings(projectId, user.id, body.storeTexts);
  }
}
