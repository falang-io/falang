import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Modal, Spin, Typography } from 'antd';
import { ApiCompileErrorsError, workflowApi, type IApiCompileError, type IApiGeneratedFile } from '../api-client.js';
import { CompileErrorsList } from './compile-errors-list.js';
import { GeneratedCodeView } from './generated-code-view.js';

interface Props {
  readonly projectId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Fetches `GET /projects/:id/code` on open. On success, shows every generated file; on a failed compile (`ApiCompileErrorsError`), shows the per-document error list plus whatever code did compile — same as `BuildErrorsModal`, since both hit the same backend path (`BuildService.compileProjectDocuments`). */
export const CodeViewerModal: React.FC<Props> = observer(({ projectId, open, onClose }) => {
  const t = getGlobalI18n().t;
  const [files, setFiles] = useState<readonly IApiGeneratedFile[]>([]);
  const [compileErrors, setCompileErrors] = useState<readonly IApiCompileError[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    setCompileErrors([]);
    setFiles([]);
    workflowApi
      .getCode(projectId)
      .then((result) => setFiles(result))
      .catch((error: unknown) => {
        if (error instanceof ApiCompileErrorsError) {
          setCompileErrors(error.errors);
          setFiles(error.files);
        } else {
          setLoadError(error instanceof Error ? error.message : t('client:code-viewer-modal.failed-to-generate'));
        }
      })
      .finally(() => setLoading(false));
  }, [open, projectId, t]);

  return (
    <Modal title={t('client:code-viewer-modal.title')} open={open} onCancel={onClose} footer={null} width={800}>
      {loading && <Spin />}
      {loadError && <Typography.Text type="danger">{loadError}</Typography.Text>}
      {compileErrors.length > 0 && <CompileErrorsList errors={compileErrors} onNavigate={onClose} />}
      {!loading && <GeneratedCodeView files={files} onNavigate={onClose} />}
    </Modal>
  );
});
