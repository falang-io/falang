import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Spin, Table, Tag, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import type { IApiWorkflowPosition, IApiWorkflowRunEvent } from '../api-client.js';
import { useWorkflowStore } from '../workflow-store-context.js';
import { TerminateRunButton } from './terminate-run-button.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, color: '#cdd6f4', fontSize: 12, minHeight: 0 },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  row: { display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' },
  label: { color: '#6c7086' },
  position: { display: 'flex', flexDirection: 'column', gap: 2 },
  frame: { paddingLeft: 8, borderLeft: '2px solid #45475a' },
  mono: { fontFamily: 'ui-monospace, monospace', fontSize: 11 },
  history: { flex: 1, minHeight: 0, overflow: 'auto' },
};

export const statusTagColor = (status: string): string => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'RUNNING') return 'processing';
  if (status === 'FAILED' || status === 'TERMINATED' || status === 'TIMED_OUT') return 'error';
  return 'default';
};

/** What the position block says when there's no node to point at — depends on why (`source`) and on the run's status. */
const positionFallback = (position: IApiWorkflowPosition, t: TFunction): string => {
  if (position.source === 'unavailable') return t('client:run-panel.position-unavailable');
  if (position.status === 'RUNNING') return t('client:run-panel.position-not-started');
  if (position.status === 'FAILED') return t('client:run-panel.position-unknown-failure');
  return t('client:run-panel.position-finished');
};

/**
 * The right-hand column's view of the watched run (ADR 0022 (private)): status, the position stack
 * (outermost function first, the innermost — highlighted on the canvas — last), the failure message
 * if any, and the execution's Temporal event history, all refreshed by `LiveRunStore`'s polling.
 * Clicking a frame jumps to that node; the canvas already follows the innermost one by itself.
 */
export const RunPanel: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const { liveRun } = store;
  const run = liveRun.watchedRun;
  if (!run) return null;
  const { position, detail } = liveRun;

  const documentName = (documentId: string): string =>
    store.getDocument(documentId)?.name ?? t('client:run-panel.document-missing');
  const nodeLabel = (documentId: string, nodeId: string): string => {
    const icon = store.hasScheme(documentId) ? store.getScheme(documentId).icons.getIconSafe(nodeId) : null;
    return icon?.title ?? icon?.name ?? nodeId;
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.title} title={run.workflowId}>
          {run.workflowName}
        </span>
        <Tag color={position ? statusTagColor(position.status) : 'default'}>
          {position ? position.status : t('client:run-panel.loading')}
        </Tag>
        {liveRun.isOpen && <TerminateRunButton onTerminate={() => liveRun.terminateWatched()} />}
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => liveRun.unwatch()} />
      </div>

      <div style={styles.row}>
        <span style={styles.label}>{t('client:run-panel.env')}</span>
        <span>
          {run.env === 'dev' ? t('client:run-panel.env-dev') : t('client:run-panel.env-prod', { version: run.version })}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>{t('client:run-panel.run-id')}</span>
        <Typography.Text style={styles.mono} copyable>
          {run.runId}
        </Typography.Text>
      </div>

      {liveRun.pollError && <Alert type="warning" showIcon message={liveRun.pollError} />}

      <div style={styles.position}>
        <span style={styles.label}>{t('client:run-panel.position')}</span>
        {!position && <Spin size="small" />}
        {position && (!position.stack || position.stack.length === 0) && <span>{positionFallback(position, t)}</span>}
        {position?.stack?.map((frame, index) => (
          <div key={`${frame.documentId}:${frame.nodeId ?? ''}:${index}`} style={styles.frame}>
            <div>{documentName(frame.documentId)}</div>
            {frame.nodeId !== null && (
              <Typography.Link
                style={{ fontSize: 12 }}
                onClick={() => {
                  if (frame.nodeId !== null && store.getDocument(frame.documentId)) {
                    store.jumpToNode(frame.documentId, frame.nodeId);
                  }
                }}
              >
                › {nodeLabel(frame.documentId, frame.nodeId)}
              </Typography.Link>
            )}
          </div>
        ))}
      </div>

      {position?.failureMessage && <Alert type="error" showIcon message={position.failureMessage} />}

      <span style={styles.label}>{t('client:run-panel.history')}</span>
      <div style={styles.history}>
        {!detail && <Spin size="small" />}
        {detail && (
          <Table<IApiWorkflowRunEvent>
            rowKey="id"
            size="small"
            dataSource={detail.events}
            pagination={false}
            columns={[
              { title: t('client:run-detail-drawer.event-id'), dataIndex: 'id', width: 48 },
              { title: t('client:run-detail-drawer.event-type'), dataIndex: 'type', ellipsis: true },
              {
                title: t('client:run-detail-drawer.event-time'),
                dataIndex: 'time',
                width: 80,
                render: (time: string | null) => (time ? new Date(time).toLocaleTimeString() : '—'),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
});
