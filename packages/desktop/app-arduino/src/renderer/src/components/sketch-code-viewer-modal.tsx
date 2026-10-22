import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Modal, Spin, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { GeneratedCodeView, type IGeneratedCodeLineMark } from '@falang/antd';
import type { ArduinoProjectStore } from '../arduino-project-store.js';
import { SketchProblemsList } from './sketch-problems-list.js';

interface Props {
  readonly store: ArduinoProjectStore;
}

/**
 * "View code": every file that goes to the board — `sketch.ino` plus the used drivers' sources — like the workflow
 * client's code viewer. Clicking a line a document produced (inside its `doc-start`/`icon-start` markers) closes the
 * modal and jumps to that document/node; the build's problems sit above the code, gcc's lines are tinted in it.
 */
export const SketchCodeViewerModal: React.FC<Props> = observer(({ store }) => {
  const t = getGlobalI18n().t;
  const viewer = store.codeViewer;

  const jump = (documentId: string, nodeId?: string): void => {
    viewer.close();
    store.jumpToNode(documentId, nodeId);
  };

  const marks: IGeneratedCodeLineMark[] = viewer.diagnostics.map((diagnostic) => ({
    path: diagnostic.file,
    line: diagnostic.line,
    severity: diagnostic.severity,
    message: diagnostic.message,
  }));
  const partial = viewer.problems.length > 0 && viewer.files.length > 0;

  return (
    <Modal
      title={t('desktop-app-arduino:code-viewer.title')}
      open={viewer.isOpen}
      onCancel={() => viewer.close()}
      footer={null}
      width={900}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="sketch-code-viewer">
        {viewer.loading && <Spin />}
        {viewer.loadError && (
          <Alert type="error" message={<span style={{ whiteSpace: 'pre-wrap' }}>{viewer.loadError}</span>} />
        )}
        <SketchProblemsList
          problems={viewer.problems}
          diagnostics={viewer.diagnostics}
          onJumpToNode={jump}
          onShowInCode={(focus) => viewer.setFocus(focus)}
        />
        {partial && <Typography.Text type="secondary">{t('desktop-app-arduino:code-viewer.partial')}</Typography.Text>}
        {!viewer.loading && viewer.files.length > 0 && (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('desktop-app-arduino:code-viewer.hint')}
            </Typography.Text>
            <GeneratedCodeView
              files={viewer.files}
              language="cpp"
              marks={marks}
              focus={viewer.focus}
              onLineClick={(location) => {
                if (location.documentId) jump(location.documentId, location.nodeId);
              }}
            />
          </>
        )}
      </div>
    </Modal>
  );
});
