import type React from 'react';
import { Alert, List, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import type { IApiCompileError } from '../api-client.js';
import { useWorkflowStore } from '../workflow-store-context.js';

interface Props {
  readonly errors: readonly IApiCompileError[];
  /** Called after a row's click has already opened/focused the node — lets the caller (e.g. close the modal) so the canvas is actually visible. */
  readonly onNavigate?: () => void;
}

/** Summary + one row per document — shared by `BuildErrorsModal` (a failed dev/publish build) and `CodeViewerModal` (a failed `GET /code`), both fed the same `IApiCompileError[]` shape. Clicking a row opens that document's tab and, when the error is attributed to a specific node (`nodeId`), selects and pans to it — see `WorkflowStore.jumpToNode`. */
export const CompileErrorsList: React.FC<Props> = ({ errors, onNavigate }) => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();

  const handleClick = (error: IApiCompileError): void => {
    store.jumpToNode(error.documentId, error.nodeId);
    onNavigate?.();
  };

  return (
    <>
      <Alert type="error" showIcon message={t('client:build-errors-modal.summary', { count: errors.length })} />
      <List
        style={{ marginTop: 12 }}
        dataSource={[...errors]}
        renderItem={(error) => (
          <List.Item
            key={`${error.documentId}-${error.nodeId ?? ''}`}
            onClick={() => handleClick(error)}
            style={{ cursor: 'pointer' }}
          >
            <List.Item.Meta
              title={<Typography.Text strong>{error.documentName}</Typography.Text>}
              description={<Typography.Text type="danger">{error.message}</Typography.Text>}
            />
          </List.Item>
        )}
      />
    </>
  );
};
