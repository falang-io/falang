import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type {
  ITableInternalAffectedResponse,
  ITableInternalInsertResponse,
  ITableInternalSelectResponse,
  ITableOrderBy,
  ITableRecord,
} from '@falang/workflow-dto';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
import { TablesError } from './table-errors.js';
import { optionalObject, parseEnv, parseInteger, requireObject } from './table-request-parsing.js';
import { TablesService, type IWriteMeta } from './tables.service.js';

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const metaOf = (input: Record<string, unknown>): IWriteMeta => {
  const context = optionalObject(input.context, 'context');
  return { source: 'workflow', runId: text(context?.runId), workflowId: text(context?.workflowId) };
};

const parseOrderBy = (value: unknown): ITableOrderBy[] => {
  if ((value ?? null) === null) return [];
  if (!Array.isArray(value)) throw new TablesError('validation', '"orderBy" must be an array');
  return value.map((item) => {
    const entry = requireObject(item, 'orderBy[]');
    if (typeof entry.field !== 'string') throw new TablesError('validation', 'orderBy[].field must be a string');
    return { field: entry.field, dir: entry.dir === 'desc' ? 'desc' : 'asc' };
  });
};

/**
 * Called by a runner pod's compiled table activities (ADR 0075 (private)): ids only (`where`/`set`/`data` keyed by field
 * id plus the system keys), `env` in the body. `ProjectTokenGuard` makes a leaked token reach only its own project.
 * Every write has source `workflow`, which fires the project's table triggers.
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/projects/:projectId/tables/:tableId')
export class TablesInternalController {
  private readonly tables: TablesService;

  constructor(@Inject(TablesService) tables: TablesService) {
    this.tables = tables;
  }

  @Post('select')
  @HttpCode(200)
  async select(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
  ): Promise<ITableInternalSelectResponse> {
    const input = requireObject(body, 'body');
    const records = await this.tables.track('select', () =>
      this.tables.select(projectId, tableId, parseEnv(input.env, null), {
        where: optionalObject(input.where, 'where'),
        orderBy: parseOrderBy(input.orderBy),
        limit: parseInteger(input.limit, 'limit'),
        offset: parseInteger(input.offset, 'offset'),
      }),
    );
    return { records };
  }

  @Post('get')
  @HttpCode(200)
  get(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
  ): Promise<ITableRecord> {
    const input = requireObject(body, 'body');
    if (typeof input.id !== 'string') throw new TablesError('validation', '"id" must be a string');
    const id = input.id;
    return this.tables.track('get', () => this.tables.getRecord(projectId, tableId, parseEnv(input.env, null), id));
  }

  @Post('insert')
  @HttpCode(200)
  insert(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
  ): Promise<ITableInternalInsertResponse> {
    const input = requireObject(body, 'body');
    if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey === '') {
      throw new TablesError('validation', '"idempotencyKey" is required');
    }
    const key = input.idempotencyKey;
    return this.tables.track('insert', () =>
      this.tables.insert(
        projectId,
        tableId,
        parseEnv(input.env, null),
        requireObject(input.data, 'data'),
        metaOf(input),
        key,
      ),
    );
  }

  @Post('update')
  @HttpCode(200)
  async update(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
  ): Promise<ITableInternalAffectedResponse> {
    const input = requireObject(body, 'body');
    const affected = await this.tables.track('update', () =>
      this.tables.updateWhere(
        projectId,
        tableId,
        parseEnv(input.env, null),
        requireObject(input.set, 'set'),
        optionalObject(input.where, 'where'),
        metaOf(input),
      ),
    );
    return { affected };
  }

  @Post('delete')
  @HttpCode(200)
  async remove(
    @Param('projectId') projectId: string,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
  ): Promise<ITableInternalAffectedResponse> {
    const input = requireObject(body, 'body');
    const affected = await this.tables.track('deleteWhere', () =>
      this.tables.deleteWhere(
        projectId,
        tableId,
        parseEnv(input.env, null),
        optionalObject(input.where, 'where'),
        metaOf(input),
      ),
    );
    return { affected };
  }
}
