import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Descriptions, Drawer, Spin, Table, Tabs, Tag, Typography } from 'antd';
import { TerminateRunButton } from './terminate-run-button.js';
import { RunJournalList } from './run-journal-list.js';
import { RunJournalStore } from '../run-journal-store.js';
import {
  workflowApi,
  type IApiWorkflowRunDetail,
  type IApiWorkflowRunEvent,
  type IApiWorkflowRunSummary,
} from '../api-client.js';

interface Props {
  /** `projectId` is optional — without it the journal waits for the Temporal detail (which carries it). */
  readonly run: (Pick<IApiWorkflowRunSummary, 'workflowId' | 'runId'> & { readonly projectId?: string }) | null;
  readonly onClose: () => void;
  /** Makes a journal row's node label a link (the project workspace passes it; the standalone Runs page has no editor). */
  readonly onJumpToNode?: (documentId: string, nodeId: string) => void;
  readonly resolveNode?: (documentId: string, nodeId: string) => string | null;
  /** No Terminate button — an admin viewing someone else's project. */
  readonly readOnly?: boolean;
}

const statusColor = (status: string): string => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'RUNNING') return 'processing';
  if (status === 'FAILED' || status === 'TERMINATED' || status === 'TIMED_OUT') return 'error';
  return 'default';
};

const jsonBlock = (value: unknown): React.ReactNode => (
  <Typography.Paragraph code copyable style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
    {JSON.stringify(value, null, 2) ?? 'null'}
  </Typography.Paragraph>
);

interface IJournalTabProps {
  readonly store: RunJournalStore | null;
  readonly loading: boolean;
  readonly wholeConversation: boolean;
  readonly onToggleWhole: () => void;
  readonly onJumpToNode?: (documentId: string, nodeId: string) => void;
  readonly resolveNode?: (documentId: string, nodeId: string) => string | null;
}

const JournalTab: React.FC<IJournalTabProps> = ({ store, loading, wholeConversation, onToggleWhole, ...rest }) => {
  const t = getGlobalI18n().t;
  if (!store) {
    return loading ? null : (
      <Typography.Text type="secondary">{t('client:run-detail-drawer.journal-unavailable')}</Typography.Text>
    );
  }
  return (
    <>
      <Button
        size="small"
        style={{ marginBottom: 8 }}
        onClick={onToggleWhole}
        data-testid="run-journal-whole-conversation"
      >
        {wholeConversation
          ? t('client:run-detail-drawer.this-run-only')
          : t('client:run-detail-drawer.whole-conversation')}
      </Button>
      <RunJournalList store={store} showRunId={wholeConversation} {...rest} />
    </>
  );
};

/**
 * Own, deliberately simplified stand-in for Temporal Web UI's workflow history page — basic
 * summary fields plus a flat event list, no execution graph. A link to the real Temporal UI is a
 * planned follow-up, not built here.
 */
export const RunDetailDrawer: React.FC<Props> = ({ run, onClose, onJumpToNode, resolveNode, readOnly }) => {
  const t = getGlobalI18n().t;
  const [detail, setDetail] = useState<IApiWorkflowRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!run) return;
    setDetail(null);
    setErrorMessage(null);
    setLoading(true);
    workflowApi
      .getWorkflowRunDetail(run.workflowId, run.runId, run.projectId)
      .then(setDetail)
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:run-detail-drawer.failed-to-load')),
      )
      .finally(() => setLoading(false));
  }, [run, t]);

  useEffect(() => {
    load();
  }, [load]);

  // The journal lives in our own table, so it outlives Temporal's retention: it is shown even when `detail` failed.
  const [wholeConversation, setWholeConversation] = useState(false);
  const projectId = run?.projectId ?? detail?.projectId ?? null;
  const workflowId = run?.workflowId ?? null;
  const runId = run?.runId ?? null;
  const journalStore = useMemo(() => {
    if (!projectId || !workflowId || !runId) return null;
    return new RunJournalStore(
      wholeConversation ? { kind: 'workflow', projectId, workflowId } : { kind: 'run', projectId, workflowId, runId },
    );
  }, [projectId, workflowId, runId, wholeConversation]);
  useEffect(() => {
    journalStore?.loadMore();
    return () => journalStore?.dispose();
  }, [journalStore]);
  useEffect(() => setWholeConversation(false), [workflowId, runId]);

  return (
    <Drawer
      title={run?.workflowId}
      open={run !== null}
      onClose={onClose}
      size={720}
      destroyOnHidden
      extra={
        !readOnly &&
        detail?.status === 'RUNNING' && (
          <TerminateRunButton
            onTerminate={async () => {
              await workflowApi.terminateWorkflowRun(detail.projectId, detail.workflowId, detail.runId);
              load();
            }}
          />
        )
      }
    >
      {loading && <Spin />}
      {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}
      {detail && (
        <>
          <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('client:run-detail-drawer.status')}>
              <Tag color={statusColor(detail.status)}>{detail.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('client:run-detail-drawer.project')}>{detail.projectName}</Descriptions.Item>
            <Descriptions.Item label={t('client:run-detail-drawer.workflow-name')}>
              {detail.workflowName}
            </Descriptions.Item>
            <Descriptions.Item label={t('client:run-detail-drawer.version')}>{detail.version}</Descriptions.Item>
            <Descriptions.Item label={t('client:run-detail-drawer.run-id')} span={2}>
              <Typography.Text code copyable>
                {detail.runId}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('client:run-detail-drawer.task-queue')} span={2}>
              <Typography.Text code copyable>
                {detail.taskQueue}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('client:run-detail-drawer.start')}>
              {new Date(detail.startTime).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label={t('client:run-detail-drawer.end')}>
              {detail.closeTime ? new Date(detail.closeTime).toLocaleString() : '—'}
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
      <Tabs
        defaultActiveKey="journal"
        items={[
          {
            key: 'journal',
            label: <span data-testid="run-journal-tab">{t('client:run-detail-drawer.tab-journal')}</span>,
            children: (
              <JournalTab
                store={journalStore}
                loading={loading}
                wholeConversation={wholeConversation}
                onToggleWhole={() => setWholeConversation(!wholeConversation)}
                onJumpToNode={onJumpToNode}
                resolveNode={resolveNode}
              />
            ),
          },
          {
            key: 'io',
            label: t('client:run-detail-drawer.tab-io'),
            disabled: !detail,
            children: detail && (
              <>
                <Typography.Title level={5}>{t('client:run-detail-drawer.input')}</Typography.Title>
                {jsonBlock(detail.input)}

                <Typography.Title level={5}>{t('client:run-detail-drawer.result')}</Typography.Title>
                {jsonBlock(detail.result)}
              </>
            ),
          },
          {
            key: 'events',
            label: t('client:run-detail-drawer.tab-events'),
            disabled: !detail,
            children: detail && (
              <>
                <Typography.Title level={5}>{t('client:run-detail-drawer.event-history')}</Typography.Title>
                <Table<IApiWorkflowRunEvent>
                  rowKey="id"
                  size="small"
                  dataSource={detail.events}
                  pagination={false}
                  columns={[
                    { title: t('client:run-detail-drawer.event-id'), dataIndex: 'id', width: 64 },
                    {
                      title: t('client:run-detail-drawer.event-time'),
                      dataIndex: 'time',
                      width: 180,
                      render: (time: string | null) => (time ? new Date(time).toLocaleString() : '—'),
                    },
                    { title: t('client:run-detail-drawer.event-type'), dataIndex: 'type' },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
    </Drawer>
  );
};
