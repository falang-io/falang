import { action, makeObservable, observable, runInAction } from 'mobx';
import {
  TABLE_RECORDS_DEFAULT_LIMIT,
  type ITableChangeEntry,
  type ITableImportCsvResponse,
  type ITableRecord,
  type ITableRecordsQuery,
  type ITableRecordsResponse,
  type TTableEnv,
  type TTableSortDir,
} from '@falang/workflow-dto';

/** The slice of `workflowApi` the store uses (injected, so the store never imports the localStorage-reading api client). */
export interface ITableApi {
  listTableRecords(projectId: string, tableId: string, query?: ITableRecordsQuery): Promise<ITableRecordsResponse>;
  createTableRecord(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    data: Record<string, unknown>,
  ): Promise<ITableRecord>;
  patchTableRecord(
    projectId: string,
    tableId: string,
    recordId: string,
    env: TTableEnv,
    data: Record<string, unknown>,
    expectedVersion?: number,
  ): Promise<ITableRecord>;
  deleteTableRecord(projectId: string, tableId: string, recordId: string, env: TTableEnv): Promise<unknown>;
  clearTable(projectId: string, tableId: string, env: TTableEnv): Promise<{ deleted: number }>;
  copyTableToProd(projectId: string, tableId: string): Promise<{ copied: number }>;
  importTableCsv(
    projectId: string,
    tableId: string,
    csv: string,
    options: { env: TTableEnv; mode: 'append' | 'replace'; createMissingFields: boolean; dryRun?: boolean },
  ): Promise<ITableImportCsvResponse>;
  getTableRecordHistory(
    projectId: string,
    tableId: string,
    recordId: string,
    env: TTableEnv,
    limit?: number,
  ): Promise<{ changes: ITableChangeEntry[] }>;
  restoreTableRecord(
    projectId: string,
    tableId: string,
    recordId: string,
    env: TTableEnv,
    changeId: number,
  ): Promise<ITableRecord>;
}

export const TABLE_PAGE_SIZE = TABLE_RECORDS_DEFAULT_LIMIT;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const isVersionConflict = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 'version_conflict';

/** MobX state of one table's grid: environment, paging, sorting, search and the optimistic-lock cell saves. */
export class TableStore {
  /** Production records by default: those are the ones people come to look at; dev is one click away. */
  @observable env: TTableEnv = 'prod';
  @observable page = 1;
  @observable search = '';
  @observable sortField: string | null = null;
  @observable sortDir: TTableSortDir = 'asc';
  @observable.ref records: ITableRecord[] = [];
  @observable total = 0;
  @observable loading = false;
  @observable error: string | null = null;
  /** Set when a cell save lost to another write (`409 version_conflict`); the grid shows it and has reloaded. */
  @observable conflict = false;
  private loadToken = 0;

  readonly projectId: string;
  readonly tableId: string;
  readonly pageSize: number;
  private readonly api: ITableApi;

  constructor(projectId: string, tableId: string, api: ITableApi, pageSize: number = TABLE_PAGE_SIZE) {
    this.projectId = projectId;
    this.tableId = tableId;
    this.api = api;
    this.pageSize = pageSize;
    makeObservable(this);
  }

  buildQuery(): ITableRecordsQuery {
    const query: ITableRecordsQuery = { env: this.env, limit: this.pageSize, offset: (this.page - 1) * this.pageSize };
    if (this.search.trim()) query.search = this.search.trim();
    if (this.sortField) {
      query.sortField = this.sortField;
      query.sortDir = this.sortDir;
    }
    return query;
  }

  /** Loads the current page; a stale answer (a newer load started meanwhile) is dropped. */
  async load(): Promise<void> {
    this.loadToken += 1;
    const token = this.loadToken;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const result = await this.api.listTableRecords(this.projectId, this.tableId, this.buildQuery());
      if (token !== this.loadToken) return;
      runInAction(() => {
        this.records = result.records;
        this.total = result.total;
        this.loading = false;
      });
    } catch (error) {
      if (token !== this.loadToken) return;
      runInAction(() => {
        this.error = errorText(error);
        this.loading = false;
      });
    }
  }

  @action setEnv(env: TTableEnv): Promise<void> {
    this.env = env;
    this.page = 1;
    this.conflict = false;
    return this.load();
  }

  @action setPage(page: number): Promise<void> {
    this.page = Math.max(1, page);
    return this.load();
  }

  @action setSearch(search: string): Promise<void> {
    this.search = search;
    this.page = 1;
    return this.load();
  }

  /** Header click: asc -> desc -> no sort on the same field, asc on a new one. */
  @action toggleSort(field: string): Promise<void> {
    if (this.sortField !== field) {
      this.sortField = field;
      this.sortDir = 'asc';
    } else if (this.sortDir === 'asc') {
      this.sortDir = 'desc';
    } else {
      this.sortField = null;
      this.sortDir = 'asc';
    }
    this.page = 1;
    return this.load();
  }

  /** Antd's controlled sorter: `dir === null` clears the sort. */
  @action setSort(field: string | null, dir: TTableSortDir | null): Promise<void> {
    this.sortField = dir === null ? null : field;
    this.sortDir = dir ?? 'asc';
    this.page = 1;
    return this.load();
  }

  @action clearConflict(): void {
    this.conflict = false;
  }

  async createRecord(data: Record<string, unknown>): Promise<void> {
    await this.api.createTableRecord(this.projectId, this.tableId, this.env, data);
    await this.load();
  }

  /**
   * Saves one cell change with the record's current version (`expectedVersion`). On `409 version_conflict`
   * the grid reloads and `conflict` is set; any other error is rethrown to the caller. Returns whether it saved.
   */
  async patchRecord(record: ITableRecord, data: Record<string, unknown>): Promise<boolean> {
    try {
      const saved = await this.api.patchTableRecord(
        this.projectId,
        this.tableId,
        record.id,
        this.env,
        data,
        record.version,
      );
      runInAction(() => {
        this.conflict = false;
        this.records = this.records.map((item) => (item.id === saved.id ? saved : item));
      });
      return true;
    } catch (error) {
      if (!isVersionConflict(error)) throw error;
      runInAction(() => {
        this.conflict = true;
      });
      await this.load();
      return false;
    }
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.api.deleteTableRecord(this.projectId, this.tableId, recordId, this.env);
    // The last row of a page going away must not leave an empty page behind.
    if (this.records.length === 1 && this.page > 1) runInAction(() => (this.page -= 1));
    await this.load();
  }

  async clear(): Promise<number> {
    const result = await this.api.clearTable(this.projectId, this.tableId, this.env);
    runInAction(() => (this.page = 1));
    await this.load();
    return result.deleted;
  }

  /** Replaces prod's records with dev's; the grid reloads when it is showing prod. */
  async copyToProd(): Promise<number> {
    const result = await this.api.copyTableToProd(this.projectId, this.tableId);
    if (this.env === 'prod') await this.load();
    return result.copied;
  }

  importCsv(
    csv: string,
    options: { mode: 'append' | 'replace'; createMissingFields: boolean; dryRun?: boolean },
  ): Promise<ITableImportCsvResponse> {
    return this.api.importTableCsv(this.projectId, this.tableId, csv, { env: this.env, ...options });
  }

  async afterImport(): Promise<void> {
    runInAction(() => (this.page = 1));
    await this.load();
  }

  history(recordId: string): Promise<ITableChangeEntry[]> {
    return this.api
      .getTableRecordHistory(this.projectId, this.tableId, recordId, this.env)
      .then((result) => result.changes);
  }

  async restore(recordId: string, changeId: number): Promise<void> {
    await this.api.restoreTableRecord(this.projectId, this.tableId, recordId, this.env, changeId);
    await this.load();
  }
}
