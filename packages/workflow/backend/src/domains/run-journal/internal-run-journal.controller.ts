import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
// Value import on purpose — Nest's `ValidationPipe` reads the DTO class from this parameter's runtime metadata.
// oxlint-disable-next-line consistent-type-imports
import { IngestRunJournalDto } from './dto/ingest-run-journal.dto.js';
import { RunJournalService } from './run-journal.service.js';

/**
 * Where runner pods flush their journal buffer (ADR 0059 (private) §4). Under `/internal/`, so the port split serves it on
 * the internal port only; `projectId` comes from the route (the guard checks the pod's token against it), never from the body.
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/projects/:projectId/run-journal')
export class InternalRunJournalController {
  private readonly service: RunJournalService;

  constructor(@Inject(RunJournalService) service: RunJournalService) {
    this.service = service;
  }

  @Post()
  @HttpCode(204)
  async ingest(@Param('projectId') projectId: string, @Body() body: IngestRunJournalDto): Promise<void> {
    await this.service.ingest(projectId, body);
  }
}
