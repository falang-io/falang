import type React from 'react';
import { GeneratedCodeView as SharedGeneratedCodeView, type IGeneratedCodeLocation } from '@falang/antd';
import { useWorkflowStore } from '../workflow-store-context.js';

interface IFile {
  readonly path: string;
  readonly content: string;
}

interface Props {
  readonly files: readonly IFile[];
  /** Called after a clicked line has opened/selected its node — lets the caller (e.g. close the modal) so the canvas is actually visible. */
  readonly onNavigate?: () => void;
}

/**
 * Every generated file — one code block if there's just one, tabbed by path once there's more (e.g. a separate activities
 * module). Shared by `CodeViewerModal` (a successful `GET /code`) and `BuildErrorsModal` (the compiled-or-partially-compiled
 * code accompanying a failed build). Rendering and the click-to-node marker lookup are `@falang/antd`'s
 * `GeneratedCodeView`; this wrapper jumps to the document/node that produced a clicked line.
 */
export const GeneratedCodeView: React.FC<Props> = ({ files, onNavigate }) => {
  const store = useWorkflowStore();

  const handleLineClick = (location: IGeneratedCodeLocation): void => {
    if (!location.documentId) return;
    store.jumpToNode(location.documentId, location.nodeId);
    onNavigate?.();
  };

  return <SharedGeneratedCodeView files={files} language="typescript" onLineClick={handleLineClick} />;
};
