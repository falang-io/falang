import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Descriptions, Drawer, Spin, Table, Tag, Typography } from 'antd';
import {
  workflowApi,
  type IApiWorkflowRunDetail,
  type IApiWorkflowRunEvent,
  type IApiWorkflowRunSummary,
} from '../api-client.js';

interface Props {
  readonly run: Pick<IApiWorkflowRunSummary, 'workflowId' | 'runId'> | null;
  readonly onClose: () => void;
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

/**
 * Own, deliberately simplified stand-in for Temporal Web UI's workflow history page — basic
 * summary fields plus a flat event list, no execution graph. A link to the real Temporal UI is a
 * planned follow-up, not built here.
 */
export const RunDetailDrawer: React.FC<Props> = ({ run, onClose }) => {
  const t = getGlobalI18n().t;
  const [detail, setDetail] = useState<IApiWorkflowRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!run) return;
    setDetail(null);
    setErrorMessage(null);
    setLoading(true);
    workflowApi
      .getWorkflowRunDetail(run.workflowId, run.runId)
      .then(setDetail)
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:run-detail-drawer.failed-to-load')),
      )
      .finally(() => setLoading(false));
  }, [run, t]);

  return (
    <Drawer title={run?.workflowId} open={run !== null} onClose={onClose} size={720} destroyOnHidden>
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

          <Typography.Title level={5}>{t('client:run-detail-drawer.input')}</Typography.Title>
          {jsonBlock(detail.input)}

          <Typography.Title level={5}>{t('client:run-detail-drawer.result')}</Typography.Title>
          {jsonBlock(detail.result)}

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
      )}
    </Drawer>
  );
};
