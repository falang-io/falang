import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Drawer, Table, Tag, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi, type IApiWorkflowRunSummary } from '../api-client.js';
import { useWorkflowStore } from '../workflow-store-context.js';
import { statusTagColor } from './run-panel.js';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Open executions first, then newest first — the drawer exists to reach the currently running ones. */
const sortRuns = (runs: readonly IApiWorkflowRunSummary[]): IApiWorkflowRunSummary[] =>
  [...runs].toSorted((a, b) => {
    const aOpen = a.status === 'RUNNING' ? 0 : 1;
    const bOpen = b.status === 'RUNNING' ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return b.startTime.localeCompare(a.startTime);
  });

/**
 * This project's executions (dev and prod), for picking one to follow — see ADR 0022 (private).
 * A per-project slice of the global Runs page's data (`GET /workflow-runs?projectId=`), no extra
 * backend surface. Clicking a row hands it to `LiveRunStore.watchSummary`, which opens the run's
 * document, highlights its current node and shows its history in the right-hand panel.
 */
export const ProjectRunsDrawer: React.FC<Props> = observer(({ open, onClose }) => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [runs, setRuns] = useState<IApiWorkflowRunSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    workflowApi
      .listWorkflowRuns({ projectId: store.projectId })
      .then((result) => setRuns(sortRuns(result)))
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:runs-drawer.failed-to-load')),
      )
      .finally(() => setLoading(false));
  }, [store.projectId, t]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <Drawer
      title={t('client:runs-drawer.title')}
      open={open}
      onClose={onClose}
      size={640}
      extra={
        <Button size="small" onClick={load} loading={loading}>
          {t('client:runs-drawer.refresh')}
        </Button>
      }
    >
      {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}
      <Table<IApiWorkflowRunSummary>
        rowKey={(run) => `${run.workflowId}:${run.runId}`}
        size="small"
        loading={loading && runs === null}
        dataSource={runs ?? []}
        pagination={false}
        locale={{ emptyText: t('client:runs-drawer.empty') }}
        onRow={(run) => ({
          style: { cursor: 'pointer' },
          onClick: () => {
            store.liveRun.watchSummary(run);
            onClose();
          },
        })}
        columns={[
          {
            title: t('client:runs-page.column-status'),
            dataIndex: 'status',
            width: 110,
            render: (status: string) => <Tag color={statusTagColor(status)}>{status}</Tag>,
          },
          { title: t('client:runs-page.column-workflow'), dataIndex: 'workflowName', ellipsis: true },
          { title: t('client:runs-page.column-version'), dataIndex: 'version', width: 90 },
          {
            title: t('client:runs-page.column-start'),
            dataIndex: 'startTime',
            width: 170,
            render: (time: string) => new Date(time).toLocaleString(),
          },
        ]}
      />
    </Drawer>
  );
});
