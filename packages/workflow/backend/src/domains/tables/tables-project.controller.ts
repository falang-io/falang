// oxlint-disable no-undefined -- optional query values.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type {
  ITableChangeEntry,
  ITableClearResponse,
  ITableCopyToProdResponse,
  ITableFileRef,
  ITableHistoryResponse,
  ITableImportCsvResponse,
  ITableRecord,
  ITableRecordsResponse,
  ITableSummary,
} from '@falang/workflow-dto';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { FilesService } from '../files/files.service.js';
import { streamFileResponse } from '../files/stream-file-response.js';
import { contentTypeOf, rawUploadBody, requireFileName } from '../files/upload-request.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { TablesError } from './table-errors.js';
import {
  CSV_IMPORT_MAX_BYTES,
  parseBoolean,
  parseEnv,
  parseInteger,
  parseSortDir,
  readTextBody,
  requireObject,
} from './table-request-parsing.js';
import { TablesCsvService } from './tables-csv.service.js';
import { TablesService } from './tables.service.js';

type TQuery = Record<string, string | undefined>;
type TRawBodyRequest = Request & { rawBody?: Buffer };

/**
 * The project's Tables tab: records of a `table` document, JWT-guarded, data keyed by FIELD ID (ADR 0075 (private)).
 * Reads (`tables` access: owner, editor, executor, admin viewer) and writes (`edit`) are checked per route. Everything
 * written here has source `grid`, which never fires table triggers.
 */
@Controller('projects/:projectId/tables')
export class TablesProjectController {
  private readonly tables: TablesService;
  private readonly csv: TablesCsvService;
  private readonly projects: ProjectsService;
  private readonly files: FilesService;

  constructor(
    @Inject(TablesService) tables: TablesService,
    @Inject(TablesCsvService) csv: TablesCsvService,
    @Inject(ProjectsService) projects: ProjectsService,
    @Inject(FilesService) files: FilesService,
  ) {
    this.tables = tables;
    this.csv = csv;
    this.projects = projects;
    this.files = files;
  }

  @Get()
  async listTables(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableSummary[]> {
    await this.projects.getOwnedProject(projectId, user.id, 'tables');
    return this.tables.listTables(projectId);
  }

  @Get(':tableId/records')
  async listRecords(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Query() q: TQuery,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableRecordsResponse> {
    await this.projects.getOwnedProject(projectId, user.id, 'tables');
    return this.tables.track('list', () =>
      this.tables.list(projectId, tableId, {
        env: parseEnv(q.env),
        limit: parseInteger(q.limit, 'limit'),
        offset: parseInteger(q.offset, 'offset'),
        search: q.search,
        sortField: q.sortField,
        sortDir: parseSortDir(q.sortDir),
      }),
    );
  }

  @Post(':tableId/records')
  async createRecord(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableRecord> {
    await this.projects.getOwnedProject(projectId, user.id);
    const input = requireObject(body, 'body');
    return this.tables.track('create', async () => {
      const result = await this.tables.insert(
        projectId,
        tableId,
        parseEnv(input.env),
        requireObject(input.data, 'data'),
        { source: 'grid' },
      );
      return result.record;
    });
  }

  @Post(':tableId/records/clear')
  @HttpCode(200)
  async clear(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableClearResponse> {
    await this.projects.getOwnedProject(projectId, user.id);
    const env = parseEnv(requireObject(body ?? {}, 'body').env);
    return this.tables.track('clear', async () => ({ deleted: await this.tables.clear(projectId, tableId, env) }));
  }

  @Post(':tableId/records/copy-to-prod')
  @HttpCode(200)
  async copyToProd(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableCopyToProdResponse> {
    await this.projects.getOwnedProject(projectId, user.id);
    if (requireObject(body ?? {}, 'body').confirm !== true) {
      throw new TablesError('validation', 'Send { "confirm": true } to replace prod records with dev records');
    }
    return this.tables.track('copy', async () => ({ copied: await this.tables.copyToProd(projectId, tableId) }));
  }

  @Patch(':tableId/records/:recordId')
  async patchRecord(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Body() body: unknown,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableRecord> {
    await this.projects.getOwnedProject(projectId, user.id);
    const input = requireObject(body, 'body');
    return this.tables.track('patch', () =>
      this.tables.patchRecord(
        projectId,
        tableId,
        parseEnv(input.env),
        recordId,
        requireObject(input.data, 'data'),
        parseInteger(input.expectedVersion, 'expectedVersion'),
        { source: 'grid' },
      ),
    );
  }

  @Delete(':tableId/records/:recordId')
  @HttpCode(204)
  async deleteRecord(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Query() q: TQuery,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.projects.getOwnedProject(projectId, user.id);
    await this.tables.track('delete', () =>
      this.tables.deleteRecord(projectId, tableId, parseEnv(q.env), recordId, { source: 'grid' }),
    );
  }

  @Get(':tableId/records/:recordId/history')
  async history(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Query() q: TQuery,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableHistoryResponse> {
    await this.projects.getOwnedProject(projectId, user.id, 'tables');
    const changes: ITableChangeEntry[] = await this.tables.track('history', () =>
      this.tables.history(projectId, tableId, parseEnv(q.env), recordId, parseInteger(q.limit, 'limit') ?? 50),
    );
    return { changes };
  }

  @Post(':tableId/records/:recordId/restore')
  @HttpCode(200)
  async restore(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Body() body: unknown,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableRecord> {
    await this.projects.getOwnedProject(projectId, user.id);
    const input = requireObject(body, 'body');
    const changeId = parseInteger(input.changeId, 'changeId');
    if (changeId === undefined) throw new TablesError('validation', '"changeId" is required');
    return this.tables.track('restore', () =>
      this.tables.restore(projectId, tableId, parseEnv(input.env), recordId, changeId),
    );
  }

  @Get(':tableId/export.csv')
  async exportCsv(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Query() q: TQuery,
    @CurrentUser() user: IJwtPayloadUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.projects.getOwnedProject(projectId, user.id, 'tables');
    const env = parseEnv(q.env);
    const name = await this.csv.tableName(projectId, tableId);
    const iterator = this.csv.exportCsv(projectId, tableId, env);
    // The first chunk (header) is pulled before the headers are sent so a failure still answers with a clean error.
    const first = await this.tables.track('export', () => iterator.next());
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const ascii = name.replaceAll(/[^\w.-]+/g, '_') || 'table';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`,
    );
    if (!first.done) res.write(first.value);
    for await (const chunk of iterator) res.write(chunk);
    res.end();
  }

  @Post(':tableId/import.csv')
  @HttpCode(200)
  async importCsv(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Query() q: TQuery,
    @Req() req: TRawBodyRequest,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableImportCsvResponse> {
    await this.projects.getOwnedProject(projectId, user.id);
    const mode = q.mode === 'replace' ? 'replace' : 'append';
    const text = await readTextBody(req, CSV_IMPORT_MAX_BYTES);
    return this.tables.track('import', () =>
      this.csv.importCsv(projectId, tableId, text, {
        env: parseEnv(q.env),
        mode,
        createMissingFields: parseBoolean(q.createMissingFields),
        dryRun: parseBoolean(q.dryRun),
      }),
    );
  }

  @Post(':tableId/files')
  async uploadFile(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Query() q: TQuery,
    @Req() req: TRawBodyRequest,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITableFileRef> {
    await this.projects.getOwnedProject(projectId, user.id);
    const env = parseEnv(q.env);
    await this.tables.resolveContext(projectId, tableId, env);
    const file = await this.files.upload(projectId, rawUploadBody(req), {
      name: requireFileName(req.headers['x-file-name']),
      mime: contentTypeOf(req.headers['content-type']),
      createdBy: 'grid',
      workflowEnv: env,
    });
    return { id: file.id, name: file.name, size: file.size, mime: file.mime };
  }

  /** Streams a file cell's file (authenticated, `edit` access) — never publishes it. */
  @Get(':tableId/files/:fileId')
  async downloadFile(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.projects.getOwnedProject(projectId, user.id);
    await this.tables.resolveContext(projectId, tableId, 'dev');
    const opened = await this.files.openStream(projectId, fileId);
    await streamFileResponse(res, {
      body: opened.body,
      contentType: opened.file.mime,
      name: opened.file.name,
      disposition: 'attachment',
      ...(typeof opened.contentLength === 'number' ? { contentLength: opened.contentLength } : {}),
    });
  }
}
