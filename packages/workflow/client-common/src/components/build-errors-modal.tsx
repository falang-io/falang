import type React from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Modal } from 'antd';
import type { IApiCompileError, IApiCompileErrorFile } from '../api-client.js';
import { CompileErrorsList } from './compile-errors-list.js';
import { GeneratedCodeView } from './generated-code-view.js';

interface Props {
  readonly open: boolean;
  readonly errors: readonly IApiCompileError[];
  readonly files: readonly IApiCompileErrorFile[];
  readonly onClose: () => void;
}

/** Shown when the dev/"test stand" Start (or Publish) build fails because the project doesn't compile — one entry per broken document, see `BuildService.compileProjectDocuments`. `files` is the compiled-or-partially-compiled code accompanying the errors, shown below the list. */
export const BuildErrorsModal: React.FC<Props> = ({ open, errors, files, onClose }) => {
  const t = getGlobalI18n().t;

  return (
    <Modal title={t('client:build-errors-modal.title')} open={open} onCancel={onClose} footer={null} width={800}>
      <CompileErrorsList errors={errors} onNavigate={onClose} />
      <div style={{ marginTop: 12 }}>
        <GeneratedCodeView files={files} onNavigate={onClose} />
      </div>
    </Modal>
  );
};
