import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import { Button, Select, Table, Tag, Typography, type TableProps } from 'antd';
import { workflowApi, type IApiTask, type TTaskStatus } from '../api-client.js';
import { navigationStore } from '../navigation-store.js';
import { TasksStore } from '../tasks-store.js';
import { LanguageSwitcher } from './language-switcher.js';
import { RunDetailDrawer } from './run-detail-drawer.js';
import { TaskDetailDrawer } from './task-detail-drawer.js';

interface Props {
  /** When given, this page filters by that project and hides the project filter — used as the workspace's own "Tasks" view (see `WorkflowStore.activeView`). Omitted, it's the standalone cross-project Tasks page reached via `navigationStore.goToTasks()`. */
  readonly projectId?: string;
}

const TASK_STATUSES: readonly TTaskStatus[] = ['open', 'done', 'expired', 'cancelled', 'orphaned'];

const statusColor = (status: TTaskStatus): string => {
  if (status === 'done') return 'success';
  if (status === 'open') return 'processing';
  if (status === 'orphaned') return 'error';
  return 'default';
};

const standaloneStyles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    justifyContent: 'center',
    background: '#1e1e2e',
    overflow: 'auto',
  },
  content: { width: 960, padding: '48px 0' },
};

const embeddedStyles: Record<string, React.CSSProperties> = {
  root: { flex: 1, overflow: 'auto', padding: 16, color: '#cdd6f4', background: '#1e1e2e' },
  content: {},
};

const buildColumns = (t: TFunction, projectId: string | undefined): TableProps<IApiTask>['columns'] => {
  const columns: NonNullable<TableProps<IApiTask>['columns']> = [
    { title: t('client:tasks-page.column-title'), dataIndex: 'title' },
  ];
  if (!projectId) {
    columns.push({ title: t('client:tasks-page.column-project'), dataIndex: 'projectName' });
  }
  columns.push(
    {
      title: t('client:tasks-page.column-env'),
      dataIndex: 'env',
      render: (env: string) => <Tag color={env === 'prod' ? 'green' : 'blue'}>{env}</Tag>,
    },
    {
      title: t('client:tasks-page.column-status'),
      dataIndex: 'status',
      render: (status: TTaskStatus) => <Tag color={statusColor(status)}>{status}</Tag>,
    },
    {
      title: t('client:tasks-page.column-due-at'),
      dataIndex: 'dueAt',
      render: (value: string | null) => (value ? new Date(value).toLocaleString() : '—'),
    },
    {
      title: t('client:tasks-page.column-created-at'),
      dataIndex: 'createdAt',
      render: (value: string) => new Date(value).toLocaleString(),
    },
  );
  return columns;
};

const commonStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  title: { color: '#cdd6f4', margin: 0 },
  filters: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterSelect: { minWidth: 180 },
};

/**
 * Human-in-the-loop Tasks page (ADR 0040 (private) §2's "Tasks page" —
 * a project owner resolving `human-task` nodes). Reused two ways: standalone, cross-project
 * (`navigationStore.view === 'tasks'`, project filter shown, own dark full-page chrome) and embedded in
 * a project workspace (`projectId` given, project filter hidden, `FilesTab`-style flex container — see
 * `ProjectWorkspace`'s `activeView === 'tasks'` branch).
 */
export const TasksPage: React.FC<Props> = observer(({ projectId }) => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new TasksStore());
  const [facetTasks, setFacetTasks] = useState<IApiTask[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<TTaskStatus>();
  const [projectFilter, setProjectFilter] = useState<string>();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<{ workflowId: string; runId: string } | null>(null);

  const effectiveProjectId = projectId ?? projectFilter;

  const loadFacets = useCallback(() => {
    // Best-effort, same "only feeds the filter dropdown" pattern as `RunsPage`'s own `facetRuns`.
    workflowApi
      .listTasks(projectId ? { projectId } : {})
      .then(setFacetTasks)
      .catch(() => setFacetTasks([]));
  }, [projectId]);

  const loadDisplayed = useCallback(() => {
    store.load({ status: statusFilter, projectId: effectiveProjectId });
  }, [store, statusFilter, effectiveProjectId]);

  useEffect(() => {
    loadFacets();
  }, [loadFacets]);

  useEffect(() => {
    loadDisplayed();
  }, [loadDisplayed]);

  // Periodic refresh (30s) while this page is mounted — a task can be resolved from elsewhere (another
  // tab, a public `/t/<token>` link) so the list/status here can go stale on its own.
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  useEffect(() => () => store.dispose(), [store]);

  const refresh = () => {
    loadFacets();
    loadDisplayed();
  };

  const projectOptions = useMemo(() => {
    const nameById = new Map<string, string>();
    for (const task of facetTasks ?? []) nameById.set(task.projectId, task.projectName);
    return Array.from(nameById, ([value, label]) => ({ value, label }));
  }, [facetTasks]);

  const styles = projectId ? embeddedStyles : standaloneStyles;

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        <div style={commonStyles.header}>
          <Typography.Title level={projectId ? 4 : 3} style={commonStyles.title}>
            {t('client:tasks-page.title')}
          </Typography.Title>
          <div>
            {!projectId && <LanguageSwitcher />}
            {!projectId && (
              <Button onClick={() => navigationStore.goToProjectList()} style={{ marginLeft: 8, marginRight: 8 }}>
                {t('client:tasks-page.back-to-projects')}
              </Button>
            )}
            <Button onClick={refresh} loading={store.loading}>
              {t('client:tasks-page.refresh')}
            </Button>
          </div>
        </div>

        <div style={commonStyles.filters}>
          <Select
            allowClear
            placeholder={t('client:tasks-page.filter-status')}
            style={commonStyles.filterSelect}
            options={TASK_STATUSES.map((status) => ({ value: status, label: status }))}
            value={statusFilter}
            onChange={(value: TTaskStatus | undefined) => setStatusFilter(value)}
          />
          {!projectId && (
            <Select
              allowClear
              placeholder={t('client:tasks-page.filter-project')}
              style={commonStyles.filterSelect}
              options={projectOptions}
              value={projectFilter}
              onChange={(value: string | undefined) => setProjectFilter(value)}
            />
          )}
        </div>

        {store.error && <Typography.Text type="danger">{store.error}</Typography.Text>}

        <Table<IApiTask>
          rowKey="id"
          loading={store.loading}
          dataSource={store.tasks}
          onRow={(task) => ({ onClick: () => setSelectedTaskId(task.id), style: { cursor: 'pointer' } })}
          columns={buildColumns(t, projectId)}
        />
      </div>

      <TaskDetailDrawer
        taskId={selectedTaskId}
        store={store}
        onClose={() => setSelectedTaskId(null)}
        onResolved={() => loadDisplayed()}
        onOpenRun={(run) => setSelectedRun(run)}
      />
      <RunDetailDrawer run={selectedRun} onClose={() => setSelectedRun(null)} />
    </div>
  );
});
