import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Modal, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { driversModalStore } from '../drivers-modal-store.js';
import type { IDriverValidationResult } from '../../../shared/driver-ipc-types.js';

type IDriverValidationIssue = IDriverValidationResult['errors'][number];

const STAGE_ORDER = ['schema', 'collisions', 'templates', 'cli', 'usages'] as const;

const IssueGroups: React.FC<{ issues: readonly IDriverValidationIssue[]; type: 'error' | 'warning' }> = ({
  issues,
  type,
}) => {
  const t = getGlobalI18n().t;
  if (issues.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      {STAGE_ORDER.map((stage) => {
        const group = issues.filter((issue) => issue.stage === stage);
        if (group.length === 0) return null;
        return (
          <Alert
            key={`${type}:${stage}`}
            type={type}
            showIcon
            style={{ marginBottom: 8 }}
            message={`${t(`drivers:stage.${stage}`)} — ${t(type === 'error' ? 'drivers:errors' : 'drivers:warnings')}`}
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {group.map((issue, index) => (
                  <li key={`${stage}:${String(index)}`} style={{ whiteSpace: 'pre-wrap' }}>
                    {issue.action ? <code>{issue.action}: </code> : null}
                    {issue.message}
                  </li>
                ))}
              </ul>
            }
          />
        );
      })}
    </div>
  );
};

/** Validation errors (grouped by stage), warnings (incl. `arduino-cli` ones), delete-blocking usages and plain messages. */
export const DriverResultModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const result = driversModalStore.result;
  const validation = result?.validation;
  return (
    <Modal
      title={result?.title ?? ''}
      open={result !== null}
      onCancel={() => driversModalStore.closeResult()}
      width={720}
      footer={[
        <Button key="close" onClick={() => driversModalStore.closeResult()}>
          {t('drivers:close')}
        </Button>,
      ]}
      destroyOnHidden
    >
      <div data-testid="drivers-result">
        {validation ? (
          <>
            <Alert
              type={validation.ok ? 'success' : 'error'}
              showIcon
              style={{ marginBottom: 12 }}
              message={t(validation.ok ? 'drivers:result.ok' : 'drivers:result.failed')}
            />
            <IssueGroups issues={validation.errors} type="error" />
            <IssueGroups issues={validation.warnings} type="warning" />
          </>
        ) : null}
        {result?.message ? (
          <Typography.Paragraph type={result.isError ? 'danger' : 'secondary'} style={{ whiteSpace: 'pre-wrap' }}>
            {result.message}
          </Typography.Paragraph>
        ) : null}
        {result?.usages ? (
          <ul>
            {result.usages.map((usage, index) => (
              <li key={`${usage.documentId}:${usage.nodeId ?? usage.instanceId ?? String(index)}`}>
                {usage.kind === 'node'
                  ? t('drivers:usage.node', { document: usage.documentId, action: usage.actionId ?? '' })
                  : t('drivers:usage.device', { document: usage.documentId })}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
});
