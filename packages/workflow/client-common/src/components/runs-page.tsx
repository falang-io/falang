import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Select, Table, Tag, Typography } from 'antd';
import { workflowApi, type IApiWorkflowRunFilters, type IApiWorkflowRunSummary } from '../api-client.js';
import { navigationStore } from '../navigation-store.js';
import { LanguageSwitcher } from './language-switcher.js';
import { RunDetailDrawer } from './run-detail-drawer.js';
import { SupportButton } from './support-button.js';

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    justifyContent: 'center',
    background: '#1e1e2e',
    overflow: 'auto',
  },
  content: { width: 960, padding: '48px 0' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: '#cdd6f4', margin: 0 },
  filters: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  filterSelect: { minWidth: 180 },
};

const statusColor = (status: string): string => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'RUNNING') return 'processing';
  if (status === 'FAILED' || status === 'TERMINATED' || status === 'TIMED_OUT') return 'error';
  return 'default';
};

const distinctOptions = (values: readonly (string | null)[]): { label: string; value: string }[] =>
  Array.from(new Set(values.filter((value): value is string => value !== null))).map((value) => ({
    label: value,
    value,
  }));

/**
 * Global, cross-project run history — reads Temporal's own visibility store via `RunsService`, see
 * `GET /workflow-runs`. Filtering happens on the backend (`workflowApi.listWorkflowRuns(filters)`),
 * not in the browser over an already-fetched full list: the table's rows come straight from the
 * filtered response. A separate, always-unfiltered `facetRuns` fetch only feeds the filter dropdown
 * option lists, so they don't collapse to nothing as the user narrows down.
 */
export const RunsPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [facetRuns, setFacetRuns] = useState<IApiWorkflowRunSummary[] | null>(null);
  const [displayedRuns, setDisplayedRuns] = useState<IApiWorkflowRunSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<IApiWorkflowRunFilters>({});
  const [selectedRun, setSelectedRun] = useState<Pick<IApiWorkflowRunSummary, 'workflowId' | 'runId'> | null>(null);

  const loadFacets = useCallback(() => {
    // Best-effort: a failure here only means filter dropdowns show no options — `loadDisplayed`
    // is the one that surfaces `errorMessage` to the user.
    workflowApi
      .listWorkflowRuns()
      .then(setFacetRuns)
      .catch(() => setFacetRuns([]));
  }, []);

  const loadDisplayed = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    workflowApi
      .listWorkflowRuns(filters)
      .then(setDisplayedRuns)
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:runs-page.failed-to-load')),
      )
      .finally(() => setLoading(false));
  }, [filters, t]);

  useEffect(() => {
    loadFacets();
  }, [loadFacets]);

  useEffect(() => {
    loadDisplayed();
  }, [loadDisplayed]);

  const refresh = () => {
    loadFacets();
    loadDisplayed();
  };

  const allFacetRuns = facetRuns ?? [];

  const projectOptions = useMemo(() => {
    const nameById = new Map<string, string>();
    for (const run of allFacetRuns) nameById.set(run.projectId, run.projectName);
    return Array.from(nameById, ([value, label]) => ({ value, label }));
  }, [allFacetRuns]);
  const workflowNameOptions = useMemo(
    () => distinctOptions(allFacetRuns.map((run) => run.workflowName)),
    [allFacetRuns],
  );
  const versionOptions = useMemo(() => distinctOptions(allFacetRuns.map((run) => run.version)), [allFacetRuns]);
  const buildOptions = useMemo(() => distinctOptions(allFacetRuns.map((run) => run.buildId)), [allFacetRuns]);

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        <div style={styles.header}>
          <Typography.Title level={3} style={styles.title}>
            {t('client:runs-page.title')}
          </Typography.Title>
          <div>
            <LanguageSwitcher />
            <span style={{ marginLeft: 8 }}>
              <SupportButton type="default" />
            </span>
            <Button onClick={() => navigationStore.goToProjectList()} style={{ marginLeft: 8, marginRight: 8 }}>
              {t('client:runs-page.back-to-projects')}
            </Button>
            <Button onClick={refresh} loading={loading}>
              {t('client:runs-page.refresh')}
            </Button>
          </div>
        </div>

        <div style={styles.filters}>
          <Select
            allowClear
            placeholder={t('client:runs-page.filter-project')}
            style={styles.filterSelect}
            options={projectOptions}
            value={filters.projectId}
            onChange={(value: string | undefined) => setFilters({ ...filters, projectId: value })}
          />
          <Select
            allowClear
            placeholder={t('client:runs-page.filter-workflow')}
            style={styles.filterSelect}
            options={workflowNameOptions}
            value={filters.workflowName}
            onChange={(value: string | undefined) => setFilters({ ...filters, workflowName: value })}
          />
          <Select
            allowClear
            placeholder={t('client:runs-page.filter-version')}
            style={styles.filterSelect}
            options={versionOptions}
            value={filters.version}
            onChange={(value: string | undefined) => setFilters({ ...filters, version: value })}
          />
          <Select
            allowClear
            placeholder={t('client:runs-page.filter-build')}
            style={styles.filterSelect}
            options={buildOptions}
            value={filters.buildId}
            onChange={(value: string | undefined) => setFilters({ ...filters, buildId: value })}
          />
        </div>

        {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}

        <Table<IApiWorkflowRunSummary>
          rowKey={(run) => `${run.workflowId}:${run.runId}`}
          loading={loading}
          dataSource={displayedRuns ?? []}
          onRow={(run) => ({ onClick: () => setSelectedRun(run), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: t('client:runs-page.column-status'),
              dataIndex: 'status',
              render: (status: string) => <Tag color={statusColor(status)}>{status}</Tag>,
            },
            { title: t('client:runs-page.column-project'), dataIndex: 'projectName' },
            { title: t('client:runs-page.column-workflow'), dataIndex: 'workflowName' },
            { title: t('client:runs-page.column-version'), dataIndex: 'version' },
            {
              title: t('client:runs-page.column-build'),
              dataIndex: 'buildId',
              render: (buildId: string | null) => buildId ?? '—',
            },
            {
              title: t('client:runs-page.column-run-id'),
              dataIndex: 'runId',
              render: (runId: string) => <Typography.Text code>{runId}</Typography.Text>,
            },
            {
              title: t('client:runs-page.column-start'),
              dataIndex: 'startTime',
              render: (startTime: string) => new Date(startTime).toLocaleString(),
            },
            {
              title: t('client:runs-page.column-end'),
              dataIndex: 'closeTime',
              render: (closeTime: string | null) => (closeTime ? new Date(closeTime).toLocaleString() : '—'),
            },
          ]}
        />
      </div>

      <RunDetailDrawer run={selectedRun} onClose={() => setSelectedRun(null)} />
    </div>
  );
});
