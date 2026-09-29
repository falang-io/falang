import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Modal, Space, Table, Typography } from 'antd';
import { workflowApi, type IApiProjectVersion } from '../api-client.js';

interface Props {
  readonly projectId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Fetches `GET /projects/:id/versions` + `GET /projects/:id/versions/status` on open. The top
 * Start/Stop toggle is project-wide — Start (re)starts only the latest version, Stop kills every
 * running version together (see `BuildService.startProd`/`stopProd`); the per-row Activate/Stop
 * buttons still target one specific version (rollback / retiring an old one without touching the
 * rest). Delete is only allowed while the toggle shows "stopped".
 */
export const VersionsModal: React.FC<Props> = observer(({ projectId, open, onClose }) => {
  const t = getGlobalI18n().t;
  const [versions, setVersions] = useState<IApiProjectVersion[] | null>(null);
  const [prodRunning, setProdRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actioningVersion, setActioningVersion] = useState<number | null>(null);
  const [prodActionLoading, setProdActionLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    Promise.all([workflowApi.listVersions(projectId), workflowApi.getProdStatus(projectId)])
      .then(([result, status]) => {
        setVersions(result.toReversed());
        setProdRunning(status.running);
      })
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:versions-modal.failed-to-load')),
      )
      .finally(() => setLoading(false));
  }, [projectId, t]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const runAction = (versionNumber: number, action: () => Promise<unknown>) => {
    setActioningVersion(versionNumber);
    setErrorMessage(null);
    action()
      .then(() => load())
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:versions-modal.action-failed')),
      )
      .finally(() => setActioningVersion(null));
  };

  const runProdAction = (action: () => Promise<unknown>) => {
    setProdActionLoading(true);
    setErrorMessage(null);
    action()
      .then(() => load())
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:versions-modal.action-failed')),
      )
      .finally(() => setProdActionLoading(false));
  };

  // Stable across every published version (see ADR 0004 (private))
  // — all versions share the same prod task queue, only the "current" one gets new starts routed to it.
  const taskQueue = `workflow-${projectId}`;

  return (
    <Modal title={t('client:versions-modal.title')} open={open} onCancel={onClose} footer={null} width={700}>
      <Typography.Paragraph>
        {t('client:versions-modal.task-queue')}{' '}
        <Typography.Text code copyable>
          {taskQueue}
        </Typography.Text>
      </Typography.Paragraph>
      <Space style={{ marginBottom: 16 }}>
        <Typography.Text>
          {t('client:versions-modal.production')}{' '}
          <Typography.Text strong>
            {prodRunning ? t('client:versions-modal.running') : t('client:versions-modal.stopped')}
          </Typography.Text>
        </Typography.Text>
        {prodRunning ? (
          <Button
            danger
            size="small"
            loading={prodActionLoading}
            onClick={() => runProdAction(() => workflowApi.stopProd(projectId))}
          >
            {t('client:versions-modal.stop')}
          </Button>
        ) : (
          <Button
            type="primary"
            size="small"
            loading={prodActionLoading}
            disabled={!versions || versions.length === 0}
            onClick={() => runProdAction(() => workflowApi.startProd(projectId))}
          >
            {t('client:versions-modal.start')}
          </Button>
        )}
      </Space>
      {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}
      <Table<IApiProjectVersion>
        rowKey="id"
        loading={loading}
        dataSource={versions ?? []}
        pagination={false}
        columns={[
          { title: t('client:versions-modal.version'), dataIndex: 'versionNumber', render: (v: number) => `v${v}` },
          {
            title: t('client:versions-modal.published'),
            dataIndex: 'createdAt',
            render: (createdAt: string) => new Date(createdAt).toLocaleString(),
          },
          {
            title: t('client:versions-modal.actions'),
            key: 'actions',
            render: (_, version) => (
              <Space>
                <Button
                  size="small"
                  loading={actioningVersion === version.versionNumber}
                  onClick={() =>
                    runAction(version.versionNumber, () =>
                      workflowApi.activateVersion(projectId, version.versionNumber),
                    )
                  }
                >
                  {t('client:versions-modal.activate')}
                </Button>
                <Button
                  size="small"
                  loading={actioningVersion === version.versionNumber}
                  onClick={() =>
                    runAction(version.versionNumber, () => workflowApi.stopVersion(projectId, version.versionNumber))
                  }
                >
                  {t('client:versions-modal.stop-runner')}
                </Button>
                <Button
                  danger
                  size="small"
                  disabled={prodRunning}
                  title={prodRunning ? t('client:versions-modal.stop-prod-first') : ''}
                  loading={actioningVersion === version.versionNumber}
                  onClick={() =>
                    runAction(version.versionNumber, () => workflowApi.deleteVersion(projectId, version.versionNumber))
                  }
                >
                  {t('client:versions-modal.delete')}
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
});
